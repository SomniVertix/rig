#!/usr/bin/env node
import process from 'node:process';

import { findNearestWorkspace, findWorkspacesClaiming, resolveProjectId } from './discover.js';
import { runResolver } from './proxy.js';

/**
 * Locates the `*.code-workspace` file this session should bind to, or exits
 * non-zero without ever touching the network -- rather than falling back to
 * some default/last-used project the way an implicit binding would.
 *
 * Tries `findNearestWorkspace`'s upward walk from `cwd` first (covers a
 * workspace file living inside the repo itself, e.g. this repo's own
 * `rig.code-workspace`). If that finds nothing and `RIG_WORKSPACES_DIR` is
 * set, falls back to `findWorkspacesClaiming`, which covers a workspace file
 * colocated in a shared directory as a sibling of the repo instead of an
 * ancestor. More than one claiming file is treated as an ambiguous
 * configuration error, not silently resolved, since which project a session
 * binds to is security-relevant (docs/workspace-binding-migration.md).
 */
function locateWorkspaceFile(cwd: string): string {
	const nearest = findNearestWorkspace(cwd);
	if (nearest !== null) {
		return nearest.file;
	}

	const workspacesDir = process.env.RIG_WORKSPACES_DIR;
	const claimed = workspacesDir !== undefined && workspacesDir.length > 0 ? findWorkspacesClaiming(workspacesDir, cwd) : [];

	if (claimed.length === 1 && claimed[0] !== undefined) {
		return claimed[0];
	}

	if (claimed.length > 1) {
		process.stderr.write(
			`rig-resolver: ${cwd} is claimed by ${claimed.length} .code-workspace files under RIG_WORKSPACES_DIR (${claimed.join(', ')}); refusing to guess which project to bind to\n`
		);
		process.exit(1);
	}

	const workspacesDirNote =
		workspacesDir !== undefined && workspacesDir.length > 0
			? `, and no .code-workspace file under RIG_WORKSPACES_DIR (${workspacesDir}) lists it as a folder`
			: '';
	process.stderr.write(
		`rig-resolver: no .code-workspace file found above ${cwd}${workspacesDirNote}; refusing to bind to an implicit project\n`
	);
	process.exit(1);
}

async function main(): Promise<void> {
	const cwd = process.cwd();
	const workspaceFile = locateWorkspaceFile(cwd);

	let projectId: string;
	try {
		({ projectId } = resolveProjectId(workspaceFile));
	} catch (error) {
		process.stderr.write(`rig-resolver: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	}

	const serverUrl = process.env.RIG_MCP_URL;
	if (serverUrl === undefined || serverUrl.length === 0) {
		process.stderr.write('rig-resolver: RIG_MCP_URL environment variable is not set\n');
		process.exit(1);
	}

	const bearerToken = process.env.RIG_MCP_BEARER_TOKEN;
	if (bearerToken === undefined || bearerToken.length === 0) {
		process.stderr.write('rig-resolver: RIG_MCP_BEARER_TOKEN environment variable is not set\n');
		process.exit(1);
	}

	await runResolver({ projectId, serverUrl, bearerToken });
	// runResolver() resolves once both transports are torn down, but the HTTP
	// client's underlying keep-alive socket can outlive transport.close() and
	// hold the event loop open indefinitely -- exit explicitly rather than
	// relying on natural drain, so the process this bin spawns for each
	// client session actually terminates when that session ends.
	process.exit(0);
}

main().catch((error: unknown) => {
	process.stderr.write(`rig-resolver: ${error instanceof Error ? error.message : String(error)}\n`);
	process.exit(1);
});
