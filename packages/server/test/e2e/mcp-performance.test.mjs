import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import http from 'node:http';

import { Pool } from 'pg';

import { buildComposition } from '../../dist/server/src/index.js';
import { FakeAgentExecutor } from '../../../test-support/dist/index.js';

import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

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
	const containerName = `rig-perf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

/**
 * Creates an MCP client session for a given project and bearer token.
 * Returns a client that can make tool calls.
 */
async function createMcpClientSession(host, port, projectSlug, bearerToken) {
	const url = new URL(`http://${host}:${port}/mcp`);

	const transport = new StreamableHTTPClientTransport(url, {
		requestInit: {
			headers: {
				'Authorization': `Bearer ${bearerToken}`,
				'x-rig-project-id': projectSlug
			}
		}
	});

	const client = new McpClient({
		name: 'performance-test-client',
		version: '1.0.0'
	});

	await client.connect(transport);
	return { client, transport };
}

/**
 * Helper to make an MCP tool call via an established client session.
 */
async function callMcpTool(client, toolName, toolArgs) {
	const startTime = Date.now();
	try {
		const result = await client.callTool({
			name: toolName,
			arguments: toolArgs
		});
		const latency = Date.now() - startTime;
		return {
			success: true,
			result,
			latency
		};
	} catch (error) {
		const latency = Date.now() - startTime;
		return {
			success: false,
			error: error.message,
			latency
		};
	}
}

/**
 * Main smoke check test: light-concurrency (20 sessions) exercising read/write
 * tools and recording p95 latencies.
 */
test('MCP performance/capacity smoke check: 20 concurrent sessions with read/write operations', async () => {
	const postgres = await startPostgresContainer();
	const workspaceRoot = repoRoot;
	const mirrorRoot = await mkdtemp(join(tmpdir(), 'rig-perf-'));
	const mcpPort = await getFreePort();
	const bearerToken = 'test-bearer-token-12345';

	const executor = new FakeAgentExecutor('pi');
	executor.setPlan('compile-requirements', { status: 'ok', text: 'requirements draft v1\n' });

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
		mcpBearerToken: bearerToken,
		mcpHost: '127.0.0.1',
		mcpPort: mcpPort
	};

	const composition = await buildComposition(config, { executor });

	try {
		// Wait a bit for MCP server to fully start
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Test data: 20 concurrent sessions
		const NUM_SESSIONS = 20;
		const OPERATIONS_PER_SESSION = 5; // 3 reads, 2 writes per session
		const projectSlugs = Array.from({ length: NUM_SESSIONS }, (_, i) => `perf-test-project-${i}`);

		// Track latencies for stats
		const readLatencies = [];
		const writeLatencies = [];
		const allLatencies = [];

		/**
		 * Simulate a single session's lifecycle: create spec, get spec (reads),
		 * add requirements (writes), etc.
		 */
		async function runSessionWorkload(projectSlug, sessionIndex) {
			const sessionStart = Date.now();
			let client;

			try {
				// Create MCP client session
				const session = await createMcpClientSession(
					config.mcpHost,
					config.mcpPort,
					projectSlug,
					bearerToken
				);
				client = session.client;

				// Operation 1: create_spec (WRITE)
				const createSpecResult = await callMcpTool(
					client,
					'create_spec',
					{
						actor: 'design-drafter',
						slug: `spec-${sessionIndex}`,
						featureName: `Test Spec ${sessionIndex}`
					}
				);

				if (!createSpecResult.success) {
					console.error(`create_spec failed for session ${sessionIndex}:`, createSpecResult.error);
					throw new Error(`create_spec failed: ${createSpecResult.error}`);
				}

				writeLatencies.push(createSpecResult.latency);
				allLatencies.push({ type: 'write', latency: createSpecResult.latency });

				// Extract spec ID from response
				const specId = createSpecResult.result?.content?.[0]?.text &&
					JSON.parse(createSpecResult.result.content[0].text)?.spec?.id;
				if (!specId) {
					throw new Error(`No spec ID returned from create_spec`);
				}

				// Operation 2: list_specs (READ)
				const listResult = await callMcpTool(
					client,
					'list_specs',
					{}
				);

				if (!listResult.success) {
					throw new Error(`list_specs failed: ${listResult.error}`);
				}

				readLatencies.push(listResult.latency);
				allLatencies.push({ type: 'read', latency: listResult.latency });

				// Operation 3: get_spec (READ)
				const getResult = await callMcpTool(
					client,
					'get_spec',
					{ specId }
				);

				if (!getResult.success) {
					throw new Error(`get_spec failed: ${getResult.error}`);
				}

				readLatencies.push(getResult.latency);
				allLatencies.push({ type: 'read', latency: getResult.latency });

				// Operation 4: get_next_stage (READ)
				const nextStageResult = await callMcpTool(
					client,
					'get_next_stage',
					{ specId }
				);

				if (!nextStageResult.success) {
					throw new Error(`get_next_stage failed: ${nextStageResult.error}`);
				}

				readLatencies.push(nextStageResult.latency);
				allLatencies.push({ type: 'read', latency: nextStageResult.latency });

				// Operation 5: render_document (READ)
				const renderResult = await callMcpTool(
					client,
					'render_document',
					{ specId, stage: 'requirements' }
				);

				if (!renderResult.success) {
					console.log(`render_document skipped (${renderResult.error})`);
				} else {
					readLatencies.push(renderResult.latency);
					allLatencies.push({ type: 'read', latency: renderResult.latency });
				}

				return {
					success: true,
					sessionIndex,
					projectSlug,
					sessionDuration: Date.now() - sessionStart
				};
			} catch (error) {
				console.error(`Session ${sessionIndex} error:`, error.message);
				return {
					success: false,
					sessionIndex,
					projectSlug,
					error: error.message,
					sessionDuration: Date.now() - sessionStart
				};
			} finally {
				if (client !== undefined) {
					try {
						await client.close();
					} catch (e) {
						// Ignore close errors
					}
				}
			}
		}

		// Run all sessions concurrently
		console.log(`Starting ${NUM_SESSIONS} concurrent sessions...`);
		const startTime = Date.now();
		const sessionPromises = projectSlugs.map((slug, idx) =>
			runSessionWorkload(slug, idx).catch((err) => ({
				success: false,
				sessionIndex: idx,
				error: err.message
			}))
		);

		const results = await Promise.all(sessionPromises);
		const totalTime = Date.now() - startTime;

		// Calculate statistics
		function calculateP95(latencies) {
			if (latencies.length === 0) return 0;
			const sorted = [...latencies].sort((a, b) => a - b);
			const index = Math.ceil((sorted.length * 0.95) - 1);
			return sorted[Math.max(0, index)];
		}

		const readP95 = calculateP95(readLatencies);
		const writeP95 = calculateP95(writeLatencies);
		const overallP95 = calculateP95(allLatencies.map((l) => l.latency));

		const successCount = results.filter((r) => r.success).length;
		const failureCount = results.filter((r) => !r.success).length;

		// Log results
		console.log('\n=== MCP Performance Smoke Check Results ===');
		console.log(`Total Sessions: ${NUM_SESSIONS}`);
		console.log(`Successful: ${successCount}`);
		console.log(`Failed: ${failureCount}`);
		console.log(`Total Time: ${totalTime}ms`);
		console.log(`Average Operations/sec: ${(allLatencies.length / (totalTime / 1000)).toFixed(2)}`);
		console.log('');
		console.log('Read Latencies:');
		console.log(`  Count: ${readLatencies.length}`);
		console.log(`  Min: ${Math.min(...readLatencies)}ms`);
		console.log(`  Max: ${Math.max(...readLatencies)}ms`);
		console.log(`  Avg: ${(readLatencies.reduce((a, b) => a + b, 0) / readLatencies.length).toFixed(2)}ms`);
		console.log(`  P95: ${readP95}ms`);
		console.log('');
		console.log('Write Latencies:');
		console.log(`  Count: ${writeLatencies.length}`);
		console.log(`  Min: ${Math.min(...writeLatencies)}ms`);
		console.log(`  Max: ${Math.max(...writeLatencies)}ms`);
		console.log(`  Avg: ${(writeLatencies.reduce((a, b) => a + b, 0) / writeLatencies.length).toFixed(2)}ms`);
		console.log(`  P95: ${writeP95}ms`);
		console.log('');
		console.log('Overall (combined read/write):');
		console.log(`  P95: ${overallP95}ms`);
		console.log('==========================================\n');

		// Basic assertions: smoke check should at least work without crashing
		assert.ok(successCount > 0, 'At least some sessions should succeed');
		assert.ok(readLatencies.length > 0, 'Should have captured read latencies');
		assert.ok(writeLatencies.length > 0, 'Should have captured write latencies');

		// Record results in a structured format for documentation
		const resultsDoc = {
			timestamp: new Date().toISOString(),
			concurrentSessions: NUM_SESSIONS,
			successRate: `${((successCount / NUM_SESSIONS) * 100).toFixed(1)}%`,
		readLatencyP95Ms: readP95,
			writeLatencyP95Ms: writeP95,
			overallP95Ms: overallP95,
			throughputOpsPerSecond: (allLatencies.length / (totalTime / 1000)).toFixed(2),
			totalOperations: allLatencies.length,
			totalTimeMs: totalTime,
			notes: 'Local Postgres, best-effort smoke check, not a formal load test. ' +
				'Performance characteristics will vary based on host hardware and database tuning. ' +
				'Story 14 thresholds are acknowledged as targets, not formally guaranteed by this check.'
		};

		console.log('\n=== Results Summary (for documentation) ===');
		console.log(JSON.stringify(resultsDoc, null, 2));
		console.log('============================================\n');

	} finally {
		await composition.close().catch(() => {});
		await postgres.stop().catch(() => {});
	}
});
