// Cross-repo workspace binding integration test (Story 5 AC1)
// Proves: workspace scanner ensures rig.projectId exists in fixture,
// multiple MCP clients bound to same project via headers,
// and cross-repo collaboration works end-to-end.

import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import process from 'node:process';

import { Pool } from 'pg';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { buildComposition } from '../../dist/server/src/index.js';
import { FakeAgentExecutor } from '../../../test-support/dist/index.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

function runCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ['ignore', 'pipe', 'pipe'],
			...options
		});
		let stdout = '';
		let stderr = '';
		child.stdout?.on('data', (chunk) => {
			stdout += chunk.toString('utf8');
		});
		child.stderr?.on('data', (chunk) => {
			stderr += chunk.toString('utf8');
		});
		child.on('error', reject);
		child.on('close', (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}
			reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}: ${stderr || stdout}`));
		});
	});
}

async function getFreePort() {
	return await new Promise((resolve, reject) => {
		const server = createServer();
		server.unref();
		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (address === null || typeof address === 'string') {
				reject(new Error('Unable to allocate a free port'));
				return;
			}
			const port = address.port;
			server.close((error) => {
				if (error !== undefined) {
					reject(error);
					return;
				}
				resolve(port);
			});
		});
	});
}

async function waitForPostgres(connectionString) {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		const pool = new Pool({ connectionString });
		try {
			await pool.query('select 1');
			await pool.end();
			return;
		} catch {
			await pool.end().catch(() => {});
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
	}
	throw new Error('Timed out waiting for Postgres container');
}

async function startPostgresContainer() {
	const port = await getFreePort();
	const containerName = `rig-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const args = [
		'run',
		'--rm',
		'-d',
		'--name', containerName,
		'-e', 'POSTGRES_USER=postgres',
		'-e', 'POSTGRES_PASSWORD=postgres',
		'-e', 'POSTGRES_DB=rig',
		'-p', `${port}:5432`,
		'postgres:16-alpine'
	];
	const { stdout } = await runCommand('docker', args);
	const containerId = stdout.trim();
	const connectionString = `postgres://postgres:postgres@127.0.0.1:${port}/rig`;

	try {
		await waitForPostgres(connectionString);
		return {
			containerId,
			connectionString,
			async stop() {
				await runCommand('docker', ['rm', '-f', containerId]);
			}
		};
	} catch (error) {
		await runCommand('docker', ['rm', '-f', containerId]).catch(() => {});
		throw error;
	}
}

// Helper to parse tool response content
function parseToolResponse(result) {
	if (!result || !result.content || !Array.isArray(result.content) || result.content.length === 0) {
		throw new Error(`Invalid tool response format: ${JSON.stringify(result)}`);
	}
	const content = result.content[0];
	if (content.type !== 'text') {
		throw new Error(`Expected text content, got ${content.type}`);
	}
	try {
		const parsed = JSON.parse(content.text);
		if (parsed.error) {
			const err = new Error(parsed.message || parsed.error);
			err.rule = parsed.error;
			throw err;
		}
		return parsed;
	} catch (error) {
		if (error instanceof SyntaxError) {
			console.error('Failed to parse response text:', content.text);
			throw error;
		}
		throw error;
	}
}

// Read and parse .code-workspace file to extract projectId
async function readProjectId(filePath) {
	const { readFileSync } = await import('node:fs');
	const { parse } = await import('jsonc-parser');
	const text = readFileSync(filePath, 'utf8');
	const parsed = parse(text);
	if (!parsed || !parsed.rig || !parsed.rig.projectId) {
		throw new Error(`No rig.projectId found in ${filePath}`);
	}
	return parsed.rig.projectId;
}

// Helper to create an MCP client via StdioClientTransport (spawns resolver subprocess)
async function createAndConnectMcpClient(mcpUrl, mcpBearerToken, cwd, cliPath) {
	// Create transport that spawns resolver subprocess
	// StdioClientTransport will spawn the process and handle stdio communication
	const transport = new StdioClientTransport({
		command: 'node',
		args: [cliPath],
		cwd,
		env: {
			...process.env,
			RIG_MCP_URL: mcpUrl,
			RIG_MCP_BEARER_TOKEN: mcpBearerToken
		}
	});

	// Create client
	const client = new Client({
		name: 'rig-workspace-binding-test',
		version: '1.0.0'
	});

	// client.connect() calls transport.start() itself (spawning the resolver
	// subprocess) -- calling start() manually first would throw "already
	// started!" on this second call, so it must NOT be called separately.
	await client.connect(transport);

	return client;
}

test('Cross-repo workspace binding: same projectId accessible via resolver subprocess in different repos', async () => {
	const postgres = await startPostgresContainer();
	const workspaceRoot = repoRoot;
	const mirrorRoot = await mkdtemp(join(tmpdir(), 'rig-mirror-'));
	const mcpBearerToken = 'test-binding-token';
	const mcpPort = await getFreePort();
	const mcpHost = '127.0.0.1';

	// Use the multi-repo fixture as the workspaces directory
	const workspacesDir = join(repoRoot, 'packages', 'server', 'test', 'fixtures', 'workspaces', 'multi-repo');
	const workspaceFile = join(workspacesDir, 'multi-repo.code-workspace');
	const repoADir = join(workspacesDir, 'repo-a');
	const repoBDir = join(workspacesDir, 'repo-b');

	// Resolver CLI path
	const cliPath = join(repoRoot, 'packages', 'resolver', 'dist', 'cli.js');

	// MCP URL for resolver env var
	const mcpUrl = `http://${mcpHost}:${mcpPort}/mcp`;

	const executor = new FakeAgentExecutor('pi');

	const config = {
		workspaceRoot,
		actorsDir: join(repoRoot, 'packages', 'server', 'test', 'fixtures', 'actors'),
		databaseUrl: postgres.connectionString,
		concurrencyCap: 1,
		defaultTimeoutMs: 60_000,
		librarySearchPaths: [],
		logLevel: 'info',
		defaultExecutor: 'pi',
		defaultModel: undefined,
		maxNodeExecutions: 100,
		mirrorRoot,
		configPath: join(workspaceRoot, 'rig.config.ts'),
		mcpBearerToken,
		mcpHost,
		mcpPort,
		// Enable workspace scanning with short interval for testing
		workspacesDir,
		workspacesScanIntervalMs: 500
	};

	const composition = await buildComposition(config, { executor });

	let clientA = null;
	let clientB = null;

	try {
		// The fixture already has a pre-injected projectId from T1.
		// The workspace scanner will run on boot and verify/ensure the project via ensureProject.
		// Give the scanner time to run its boot pass before we start making requests.
		await new Promise((resolve) => setTimeout(resolve, 1000));

		const projectId = await readProjectId(workspaceFile);
		assert(projectId, 'Fixture should have a projectId');
		assert(projectId.match(/^[a-z0-9]+(-[a-z0-9]+)*$/), `projectId should be kebab-case, got: ${projectId}`);

		// Test AC1: Fixture has valid projectId (pre-injected by T1's setup)
		// The workspace scanner ensures this project row exists via ensureProject on boot

		// Create first client via resolver subprocess spawned from repo-a/
		// The resolver walks up to find multi-repo.code-workspace and proxies to the server
		clientA = await createAndConnectMcpClient(mcpUrl, mcpBearerToken, repoADir, cliPath);

		// Create a spec from client A's session (via repo-a resolver proxy)
		const createSpecResult = await clientA.callTool({
			name: 'create_spec',
			arguments: {
				actor: 'design-drafter',
				slug: 'workspace-binding-test',
				featureName: 'Cross-Repo Collaboration'
			}
		});
		const specData = parseToolResponse(createSpecResult);
		const specId = specData.spec.id;
		assert(specId, 'Spec should be created from client A session');
		assert(specData.spec.projectId, 'Spec should have projectId bound');

		// List specs from client A to verify it's there
		const listResultA = await clientA.callTool({
			name: 'list_specs',
			arguments: {}
		});
		const listDataA = parseToolResponse(listResultA);
		assert.equal(listDataA.specs.length, 1, 'Client A should see 1 spec');
		assert.equal(listDataA.specs[0].id, specId, 'Client A should see the created spec');

		// Create second client via resolver subprocess spawned from repo-b/
		// This is a separate resolver process, different cwd, but same workspace
		clientB = await createAndConnectMcpClient(mcpUrl, mcpBearerToken, repoBDir, cliPath);

		// Test AC2: Both clients bound to same project via independent resolver proxies
		// Verify by listing specs from client B -- should see the same spec created from client A
		const listResultB = await clientB.callTool({
			name: 'list_specs',
			arguments: {}
		});
		const listDataB = parseToolResponse(listResultB);
		assert.equal(listDataB.specs.length, 1, 'Client B should see 1 spec (same as client A)');
		assert.equal(listDataB.specs[0].id, specId, 'Client B should see the same spec created from client A');
		assert.equal(listDataB.specs[0].slug, 'workspace-binding-test', 'Client B should see correct slug');

		// Test AC3: Cross-session tool call proves both resolver subprocesses bound to same project
		// by successfully retrieving the same spec via get_spec
		const getSpecFromB = await clientB.callTool({
			name: 'get_spec',
			arguments: { specId }
		});
		const getSpecData = parseToolResponse(getSpecFromB);
		assert.equal(getSpecData.spec.id, specId, 'Client B (repo-b resolver) should be able to get_spec created from client A (repo-a resolver)');

		// Create a second spec from client A and verify client B sees both
		const createSpec2Result = await clientA.callTool({
			name: 'create_spec',
			arguments: {
				actor: 'design-drafter',
				slug: 'workspace-binding-test-2',
				featureName: 'Cross-Repo Collaboration Part 2'
			}
		});
		const spec2Data = parseToolResponse(createSpec2Result);
		const spec2Id = spec2Data.spec.id;
		assert(spec2Id, 'Second spec should be created from client A');

		// Verify client B (repo-b resolver proxy) can see both specs created via repo-a resolver
		const finalListResultB = await clientB.callTool({
			name: 'list_specs',
			arguments: {}
		});
		const finalListDataB = parseToolResponse(finalListResultB);
		assert.equal(finalListDataB.specs.length, 2, 'Client B should now see 2 specs');
		const spec2FromB = finalListDataB.specs.find((s) => s.id === spec2Id);
		assert(spec2FromB, 'Client B should see the second spec created from client A');

	} finally {
		// Clean teardown: close all clients (which closes their resolver subprocesses)
		if (clientA) {
			try {
				await clientA.close();
			} catch (error) {
				console.error('Error closing client A:', error);
			}
		}

		if (clientB) {
			try {
				await clientB.close();
			} catch (error) {
				console.error('Error closing client B:', error);
			}
		}

		// Close composition (stops workspace scanner, closes MCP transport, etc.)
		await composition.close().catch(() => {});

		// Stop Postgres
		await postgres.stop().catch(() => {});
	}
});
