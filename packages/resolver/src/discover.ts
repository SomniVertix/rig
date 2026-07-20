import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import { parse } from 'jsonc-parser';
import type { ParseError } from 'jsonc-parser';

/**
 * Result of `resolveProjectId`: which `rig.projectId` to bind this host
 * session to, and whether it came from the committed `*.code-workspace` file
 * or a personal, gitignored `.local` override sitting next to it (see
 * `.code-workspace.local` override-file precedence below).
 */
export interface Resolved {
	workspaceFile: string;
	projectId: string;
	source: 'override' | 'workspace';
}

const WORKSPACE_FILE_SUFFIX = '.code-workspace';

/**
 * Walks up parent-by-parent from `startDir` looking for a `*.code-workspace`
 * marker file, mirroring `packages/server/src/web/app.ts`'s
 * `findWorkspaceRoot` walk-up idiom -- but with marker `*.code-workspace`
 * instead of `pnpm-workspace.yaml`, and terminating at the filesystem root
 * with `null` rather than falling back to `process.cwd()`: the resolver runs
 * on the host machine outside this repo, so there's no "current package"
 * fallback that would ever be a sensible default here -- a caller outside
 * any workspace tree needs to know that plainly, not silently land on
 * whatever directory it happened to be invoked from.
 */
export function findNearestWorkspace(startDir: string): { dir: string; file: string } | null {
	let dir = startDir;
	for (;;) {
		const fileName = findWorkspaceFileNameIn(dir);
		if (fileName !== null) {
			return { dir, file: join(dir, fileName) };
		}
		const parent = dirname(dir);
		if (parent === dir) {
			return null;
		}
		dir = parent;
	}
}

function findWorkspaceFileNameIn(dir: string): string | null {
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return null;
	}
	return entries.find((name) => name.endsWith(WORKSPACE_FILE_SUFFIX)) ?? null;
}

// Directory names never descended into while scanning a workspaces directory
// for claiming files -- mirrors
// packages/server/src/workspace/workspace-scanner.ts's SKIPPED_DIR_NAMES
// (minus `.local`, which is about `.code-workspace.local` *files*, not a
// directory this walk would ever encounter).
const SKIPPED_DIR_NAMES = new Set(['node_modules', '.git']);

/**
 * Fallback for when `findNearestWorkspace`'s upward walk from `targetDir`
 * finds nothing: recursively scans `workspacesDir` (typically
 * `RIG_WORKSPACES_DIR`, the same curated directory
 * `packages/server/src/workspace/workspace-scanner.ts` scans server-side) for
 * every `*.code-workspace` file whose `folders` array lists a path that is
 * `targetDir` itself or an ancestor of it.
 *
 * This covers the case a pure ancestor walk cannot: a workspace file
 * colocated in a shared directory as a *sibling* of the repo it describes,
 * rather than living inside the repo itself.
 *
 * Returns every match rather than picking one -- a caller with more than one
 * match must treat it as an ambiguous configuration error, not silently pick
 * a winner, since which project a session binds to is security-relevant (see
 * docs/workspace-binding-migration.md's trust-boundary section).
 */
export function findWorkspacesClaiming(workspacesDir: string, targetDir: string): string[] {
	const matches: string[] = [];
	for (const file of walkWorkspaceFiles(workspacesDir)) {
		if (workspaceClaims(file, targetDir)) {
			matches.push(file);
		}
	}
	return matches;
}

function* walkWorkspaceFiles(dir: string): Generator<string> {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.isDirectory()) {
			if (SKIPPED_DIR_NAMES.has(entry.name)) {
				continue;
			}
			yield* walkWorkspaceFiles(join(dir, entry.name));
		} else if (entry.isFile() && entry.name.endsWith(WORKSPACE_FILE_SUFFIX)) {
			yield join(dir, entry.name);
		}
	}
}

function workspaceClaims(workspaceFile: string, targetDir: string): boolean {
	let text: string;
	try {
		text = readFileSync(workspaceFile, 'utf8');
	} catch {
		return false;
	}

	const parseErrors: ParseError[] = [];
	const parsed: unknown = parse(text, parseErrors, { allowTrailingComma: true, disallowComments: false });
	if (parseErrors.length > 0 || typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return false;
	}

	const folders = (parsed as Record<string, unknown>).folders;
	if (!Array.isArray(folders)) {
		return false;
	}

	const workspaceDir = dirname(workspaceFile);
	for (const folder of folders) {
		if (typeof folder !== 'object' || folder === null) {
			continue;
		}
		const rawPath = (folder as Record<string, unknown>).path;
		if (typeof rawPath !== 'string') {
			continue;
		}
		// VS Code workspace folder paths may be relative to the .code-workspace
		// file's own directory or absolute; `resolve` handles both uniformly.
		const resolvedFolder = resolve(workspaceDir, rawPath);
		if (targetDir === resolvedFolder || targetDir.startsWith(resolvedFolder + sep)) {
			return true;
		}
	}
	return false;
}

/**
 * Applies `.code-workspace.local` override precedence: if a sibling
 * `<name>.code-workspace.local` exists next to `workspaceFile` and
 * JSONC-parses to a non-empty `rig.projectId`, that wins (`source:
 * 'override'`) -- this lets one developer point their local checkout at a
 * personal/sandbox project without touching the committed file everyone else
 * shares. Otherwise falls back to the committed `workspaceFile`'s own
 * `rig.projectId` (`source: 'workspace'`). Throws if neither has a
 * `rig.projectId`, since there is then no project to bind to at all. The
 * `.local` file is read-only from the resolver's perspective -- unlike
 * `packages/server/src/workspace/workspace-scanner.ts`'s injection of a
 * generated slug into the committed file, nothing here is ever written back.
 */
export function resolveProjectId(workspaceFile: string): Resolved {
	const localFile = `${workspaceFile}.local`;
	if (existsSync(localFile)) {
		const overrideProjectId = readProjectId(localFile);
		if (overrideProjectId !== undefined && overrideProjectId.length > 0) {
			return { workspaceFile, projectId: overrideProjectId, source: 'override' };
		}
	}

	const workspaceProjectId = readProjectId(workspaceFile);
	if (workspaceProjectId !== undefined && workspaceProjectId.length > 0) {
		return { workspaceFile, projectId: workspaceProjectId, source: 'workspace' };
	}

	throw new Error(`No rig.projectId found in ${workspaceFile} or its .local override`);
}

function readProjectId(filePath: string): string | undefined {
	let text: string;
	try {
		text = readFileSync(filePath, 'utf8');
	} catch {
		return undefined;
	}

	const parseErrors: ParseError[] = [];
	const parsed: unknown = parse(text, parseErrors, { allowTrailingComma: true, disallowComments: false });
	if (parseErrors.length > 0 || typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return undefined;
	}

	const rig = (parsed as Record<string, unknown>).rig;
	if (typeof rig !== 'object' || rig === null || Array.isArray(rig)) {
		return undefined;
	}

	const projectId = (rig as Record<string, unknown>).projectId;
	return typeof projectId === 'string' ? projectId : undefined;
}
