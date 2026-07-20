import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

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
