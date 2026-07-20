import { randomBytes } from 'node:crypto';
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

import { ensureProject } from '@rig/persistence';
import { applyEdits, modify, parse } from 'jsonc-parser';
import type { FormattingOptions, ParseError } from 'jsonc-parser';
import type { Pool } from 'pg';

/**
 * `RIG_WORKSPACES_DIR` scanner (Story 1). Walks a curated directory of VS Code
 * multi-root `*.code-workspace` files and binds each one to a
 * `spec_pipeline.projects` row via its durable `rig.projectId` field, replacing
 * the old URL-slug-keyed `ensureProject(pool, projectSlug)` call in
 * `packages/server/src/mcp/session.ts`.
 *
 * Per file (AC1-AC5):
 * - `rig.projectId` present and kebab-valid -> `ensureProject` the existing id.
 * - `rig.projectId` present but not kebab-valid -> warn + skip, no throw.
 * - `rig.projectId` absent -> slugify the filename, resolve a collision-free
 *   slug against `spec_pipeline.projects.slug`, provision the project row for
 *   it, and write the winning slug back into the file as a minimal JSONC edit.
 * - Unreadable/malformed file -> warn + skip, never aborts the rest of the pass.
 *
 * The write-back races other server instances/processes touching the same
 * `.code-workspace` file concurrently (Design Open Risk: "Cross-server /
 * cross-process write-back races"). This module only protects against
 * *in-process* overlap (the `isScanning` guard below); it does not take a
 * filesystem lock, so a same-slug collision from a truly concurrent writer
 * is still possible in principle -- the `INSERT ... ON CONFLICT DO NOTHING`
 * retry loop keeps the Postgres side safe either way, and the temp-file +
 * `rename` sequence keeps the on-disk write atomic so a reader never sees a
 * half-written file, even if two writers race for the same final content.
 */
export interface WorkspaceScannerOptions {
	pool: Pool;
	workspacesDir: string;
}

export interface WorkspaceScanSummary {
	scanned: number;
	injected: number;
	matched: number;
	skipped: number;
}

const KEBAB_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Directory names never descended into while walking `workspacesDir`. `.local`
// is treated the same way as `node_modules`/`.git`: an opaque directory whose
// contents are never scanned, not a filename suffix -- the task's "skip
// node_modules/.git; do not scan .local siblings" groups all three together
// as directory-level exclusions encountered while walking.
const SKIPPED_DIR_NAMES = new Set(['node_modules', '.git', '.local']);

// In-process guard only (see the write-back race note above): a call that
// arrives while a prior pass is still running is a no-op and returns a
// zeroed summary rather than queuing or blocking.
let isScanning = false;

export async function scanWorkspaces(opts: WorkspaceScannerOptions): Promise<WorkspaceScanSummary> {
	const summary: WorkspaceScanSummary = { scanned: 0, injected: 0, matched: 0, skipped: 0 };
	if (isScanning) {
		return summary;
	}
	isScanning = true;
	try {
		const filePaths = await findWorkspaceFiles(opts.workspacesDir);
		for (const filePath of filePaths) {
			summary.scanned += 1;
			await scanOneFile(opts.pool, filePath, summary);
		}
	} finally {
		isScanning = false;
	}
	return summary;
}

export interface WorkspaceScannerHandle {
	stop(): void;
}

/**
 * Boots the workspace scanner: runs one `scanWorkspaces` pass immediately,
 * then re-arms it on a fixed `setInterval(intervalMs)` cadence. Overlap
 * protection is not duplicated here -- each interval tick just calls
 * `scanWorkspaces` again, and that function's own `isScanning` guard makes a
 * tick that lands while a previous pass is still in flight a no-op (it
 * returns a zeroed summary instead of queuing up), matching the "poll-interval
 * binding latency" open risk that already accepts pass durations bleeding
 * into the next tick's boundary.
 */
export function startWorkspaceScanner(opts: WorkspaceScannerOptions & { intervalMs: number }): WorkspaceScannerHandle {
	// scanWorkspaces already catches per-file failures internally (see
	// scanOneFile), so these `.catch`s are defense in depth only: they exist
	// so that even if some future code path reintroduces an uncaught
	// rejection, it is logged rather than becoming an unhandled promise
	// rejection that crashes the process.
	void scanWorkspaces(opts).catch((error: unknown) => {
		console.warn(`workspace-scanner: scan pass failed unexpectedly: ${String(error)}`);
	});
	const timer = setInterval(() => {
		void scanWorkspaces(opts).catch((error: unknown) => {
			console.warn(`workspace-scanner: scan pass failed unexpectedly: ${String(error)}`);
		});
	}, opts.intervalMs);
	return {
		stop(): void {
			clearInterval(timer);
		}
	};
}

async function findWorkspaceFiles(dir: string): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch (error) {
		console.warn(`workspace-scanner: failed to read directory, skipping: ${dir} (${String(error)})`);
		return [];
	}

	const filePaths: string[] = [];
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (SKIPPED_DIR_NAMES.has(entry.name)) {
				continue;
			}
			filePaths.push(...(await findWorkspaceFiles(join(dir, entry.name))));
		} else if (entry.isFile() && entry.name.endsWith('.code-workspace')) {
			filePaths.push(join(dir, entry.name));
		}
	}
	return filePaths;
}

async function scanOneFile(pool: Pool, filePath: string, summary: WorkspaceScanSummary): Promise<void> {
	let text: string;
	try {
		text = await readFile(filePath, 'utf8');
	} catch (error) {
		console.warn(`workspace-scanner: failed to read file, skipping: ${filePath} (${String(error)})`);
		summary.skipped += 1;
		return;
	}

	const parseErrors: ParseError[] = [];
	const parsed: unknown = parse(text, parseErrors, { allowTrailingComma: true, disallowComments: false });
	if (parseErrors.length > 0 || typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		console.warn(`workspace-scanner: malformed .code-workspace file, skipping: ${filePath}`);
		summary.skipped += 1;
		return;
	}

	const rig = (parsed as Record<string, unknown>).rig;
	const projectId =
		typeof rig === 'object' && rig !== null && !Array.isArray(rig)
			? (rig as Record<string, unknown>).projectId
			: undefined;

	// Everything past this point can hit the DB (ensureProject, the
	// resolveUniqueSlug collision loop) or the filesystem (writeBackSlug). Any
	// of those can reject -- e.g. a DB outage -- and per the module contract
	// (AC1-AC5: "never throws on a single bad file") a failure processing one
	// file must never escape scanOneFile and abort the rest of the pass, so
	// the whole matched/injected pipeline is wrapped and treated the same as
	// a malformed file: warn + count as skipped, then move on.
	try {
		if (projectId !== undefined) {
			if (typeof projectId === 'string' && KEBAB_SLUG_PATTERN.test(projectId)) {
				await ensureProject(pool, projectId);
				summary.matched += 1;
			} else {
				console.warn(`workspace-scanner: invalid rig.projectId, skipping: ${filePath} (${JSON.stringify(projectId)})`);
				summary.skipped += 1;
			}
			return;
		}

		const baseSlug = slugifyFilename(filePath);
		const winningSlug = await resolveUniqueSlug(pool, baseSlug);
		await writeBackSlug(filePath, text, winningSlug);
		summary.injected += 1;
	} catch (error) {
		console.warn(`workspace-scanner: failed to process file, skipping: ${filePath} (${String(error)})`);
		summary.skipped += 1;
	}
}

function slugifyFilename(filePath: string): string {
	const stem = basename(filePath, extname(filePath));
	const slug = stem
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug.length > 0 ? slug : 'workspace';
}

async function resolveUniqueSlug(pool: Pool, baseSlug: string): Promise<string> {
	for (let attempt = 1; ; attempt += 1) {
		const candidate = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
		const insertResult = await pool.query<{ id: string }>(
			`insert into spec_pipeline.projects (slug) values ($1)
			 on conflict (slug) do nothing
			 returning id`,
			[candidate]
		);
		if (insertResult.rowCount !== null && insertResult.rowCount > 0) {
			return candidate;
		}
		// slug already taken (by a pre-existing project or an earlier file in
		// this same pass) -- retry with the next numeric suffix.
	}
}

async function writeBackSlug(filePath: string, originalText: string, slug: string): Promise<void> {
	const edits = modify(originalText, ['rig', 'projectId'], slug, {
		formattingOptions: detectFormattingOptions(originalText)
	});
	const updatedText = applyEdits(originalText, edits);

	const tempPath = join(dirname(filePath), `.${basename(filePath)}.${randomBytes(6).toString('hex')}.tmp`);
	await writeFile(tempPath, updatedText, 'utf8');
	await rename(tempPath, filePath);
}

// Best-effort match to the file's existing indent style so the newly injected
// `rig` node reads naturally next to untouched content -- `modify`/`applyEdits`
// only ever touch the target path, so surrounding formatting is preserved
// regardless of this guess.
function detectFormattingOptions(text: string): FormattingOptions {
	const eol = text.includes('\r\n') ? '\r\n' : '\n';
	const indentMatch = /\n([ \t]+)\S/.exec(text);
	if (indentMatch === null) {
		return { insertSpaces: true, tabSize: 2, eol };
	}
	const indent = indentMatch[1] ?? '';
	if (indent.includes('\t')) {
		return { insertSpaces: false, tabSize: 4, eol };
	}
	return { insertSpaces: true, tabSize: indent.length, eol };
}
