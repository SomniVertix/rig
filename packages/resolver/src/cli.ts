#!/usr/bin/env node
import process from 'node:process';

import { findNearestWorkspace, resolveProjectId } from './discover.js';
import { runResolver } from './proxy.js';

/**
 * `rig-resolver` bin entrypoint. Refuses to guess a project: if no
 * `*.code-workspace` marker is found walking up from `cwd`, this exits
 * non-zero immediately (see `findNearestWorkspace`'s doc comment) without
 * ever touching the network, rather than falling back to some default/last-used
 * project the way an implicit binding would.
 */
async function main(): Promise<void> {
	const cwd = process.cwd();
	const nearest = findNearestWorkspace(cwd);
	if (nearest === null) {
		process.stderr.write(`rig-resolver: no .code-workspace file found above ${cwd}; refusing to bind to an implicit project\n`);
		process.exit(1);
	}

	let projectId: string;
	try {
		({ projectId } = resolveProjectId(nearest.file));
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
