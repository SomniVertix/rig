import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

import { Pool } from 'pg';

import { buildComposition, createServerScheduler } from '../../dist/server/src/index.js';
import { buildApp } from '../../dist/server/src/web/app.js';
import { FakeAgentExecutor } from '../../../test-support/dist/index.js';
import { SpecRepository, ensureProject } from '@rig/persistence';

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

// Helper to make HTTP requests to the Fastify app. Mirrors the real browser client
// (packages/web/src/api/client.ts's apiFetch): always sets Content-Type: application/json
// and sends a real JSON body ('{}' when the caller has none) for POST/PUT/PATCH, rather
// than an empty/no-body request -- Fastify hands an unset-Content-Type bodyless POST's
// request.body as `null`, which a Zod `.default({})` schema does not cover (it only
// applies to `undefined`), so a bodyless raw request isn't representative of what any
// real caller actually sends.
async function makeRequest(app, method, path, body = null) {
	const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
	return await new Promise((resolve, reject) => {
		app
			.inject({
				method,
				url: path,
				headers: hasBody ? { 'content-type': 'application/json' } : undefined,
				payload: hasBody ? JSON.stringify(body ?? {}) : undefined
			})
			.then((response) => {
				let parsedBody = null;
				if (response.body) {
					try {
						parsedBody = JSON.parse(response.body);
					} catch {
						parsedBody = response.body;
					}
				}
				resolve({
					statusCode: response.statusCode,
					body: parsedBody,
					text: response.body,
					headers: response.headers
				});
			})
			.catch(reject);
	});
}

test('REST BFF API: read operations, write operations, error handling, and SPA fallback', async () => {
	const postgres = await startPostgresContainer();
	const workspaceRoot = repoRoot;
	const mirrorRoot = await mkdtemp(join(tmpdir(), 'rig-mirror-'));

	const executor = new FakeAgentExecutor('pi');
	executor.setPlan('compile-requirements', { status: 'ok', text: 'requirements draft v1\n' });
	executor.setPlan('draft-design', { status: 'ok', text: 'design draft v1\n' });
	executor.setPlan('draft-tasks', { status: 'ok', text: 'tasks draft v1\n' });

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
		configPath: join(workspaceRoot, 'rig.config.ts')
	};

	const composition = await buildComposition(config, { executor });
	const scheduler = createServerScheduler(composition, { pollIntervalMs: 25 });
	// Exercises the real rest-bff-api route registration (app.ts/routes/reads.ts/routes/writes.ts)
	// end to end, rather than a hand-rolled stand-in -- every route is registered up front,
	// matching how buildApp is actually used in production (Fastify disallows adding routes
	// after the instance has started serving requests via .inject()/.listen()).
	const app = buildApp(composition.pool, { events: composition.specEvents });

	try {
		const repository = new SpecRepository(composition.pool, composition.specEvents);
		const projectId = await ensureProject(composition.pool, 'test-project'); // GET /api/specs requires a real project (rest-bff-api's ensureProject), not the global/null convention

		// =========================================================================
		// Setup: Seed test data into the database
		// =========================================================================

		const specResult = await repository.createSpec(
			{
				projectId,
				slug: 'test-feature',
				featureName: 'Test Feature'
			},
			{ actor: 'test-actor', projectId }
		);
		const specId = specResult.id;

		const requirementsRecord = await repository.setRequirementsOverview(
			specId,
			{
				featureName: 'Test Feature',
				overview: 'A test feature overview'
			},
			{ actor: 'test-actor', projectId }
		);

		const designResult = await repository.setDesignOverview(
			specId,
			{
				featureName: 'Test Feature',
				overview: 'A test design overview'
			},
			{ actor: 'test-actor', projectId }
		);

		await repository.addDesignComponent(
			designResult.id,
			{
				slug: 'test-component',
				displayName: 'Test Component'
			},
			{ actor: 'test-actor', projectId }
		);

		// finalizeStage('requirements') requires at least one top-level user story
		const userStory = await repository.addUserStory(
			requirementsRecord.id,
			{
				title: 'Test Story',
				role: 'user',
				capability: 'do a thing',
				benefit: 'get value',
				rationale: 'because'
			},
			{ actor: 'test-actor', projectId }
		);
		await repository.addAcceptanceCriterion(
			userStory.id,
			{
				earsPattern: 'ubiquitous',
				responseClause: 'the system shall do the thing',
				fullText: 'THE SYSTEM SHALL do the thing.'
			},
			{ actor: 'test-actor', projectId }
		);

		// Finalize requirements stage
		await repository.finalizeStage(specId, 'requirements', undefined, { actor: 'test-actor', projectId });

		// =========================================================================
		// Test GET /api/specs (Story 1 AC1) - list all specs
		// =========================================================================
		{
			const response = await makeRequest(app, 'GET', `/api/specs?project=${encodeURIComponent('test-project')}`);
			assert.equal(response.statusCode, 200);
			assert(Array.isArray(response.body));
			assert.equal(response.body.length, 1);
			assert.equal(response.body[0].id, specId);
			assert.equal(response.body[0].slug, 'test-feature');
			assert.equal(response.body[0].stages.requirements, 'in_review');
		}

		// =========================================================================
		// Test GET /api/specs/:specId (Story 1 AC1) - fetch single spec
		// =========================================================================
		{
			const response = await makeRequest(app, 'GET', `/api/specs/${specId}`);
			assert.equal(response.statusCode, 200);
			assert.equal(response.body.id, specId);
			assert.equal(response.body.featureName, 'Test Feature');
		}

		// =========================================================================
		// Test GET /api/specs/:specId/stages/:stage/document (Story 2 AC1-3)
		// =========================================================================
		{
			const response = await makeRequest(app, 'GET', `/api/specs/${specId}/stages/requirements/document`);
			assert.equal(response.statusCode, 200);
			assert(typeof response.body.markdown === 'string');
			assert(response.body.markdown.includes('Test Feature'));
		}

		// =========================================================================
		// Test POST /api/specs/:specId/stages/:stage/approve (Story 5 AC1-4)
		// =========================================================================
		{
			const response = await makeRequest(app, 'POST', `/api/specs/${specId}/stages/requirements/approve`);
			assert.equal(response.statusCode, 200);
			assert.equal(response.body.status, 'approved');
			assert.equal(response.body.stage, 'requirements');
		}

		// =========================================================================
		// Test POST /api/specs/:specId/stages/:stage/deny (Story 5 AC1-4)
		// =========================================================================
		{
			// Requirements is now 'approved', not 'in_review' -- denying it should be rejected.
			const response = await makeRequest(app, 'POST', `/api/specs/${specId}/stages/requirements/deny`);
			assert.equal(response.statusCode, 409);
			assert.equal(response.body.error, 'not_in_review');
		}

		// =========================================================================
		// Test error handling: 400 (component_required) case
		// =========================================================================
		{
			const spec2Result = await repository.createSpec(
				{ projectId, slug: 'test-feature-2', featureName: 'Test Feature 2' },
				{ actor: 'test-actor', projectId }
			);
			const spec2Id = spec2Result.id;

			const requirements2 = await repository.setRequirementsOverview(
				spec2Id,
				{ featureName: 'Test Feature 2', overview: 'Overview' },
				{ actor: 'test-actor', projectId }
			);
			const userStory2 = await repository.addUserStory(
				requirements2.id,
				{
					title: 'Story 2',
					role: 'user',
					capability: 'do another thing',
					benefit: 'get more value',
					rationale: 'because'
				},
				{ actor: 'test-actor', projectId }
			);
			await repository.addAcceptanceCriterion(
				userStory2.id,
				{
					earsPattern: 'ubiquitous',
					responseClause: 'the system shall do another thing',
					fullText: 'THE SYSTEM SHALL do another thing.'
				},
				{ actor: 'test-actor', projectId }
			);

			const design2 = await repository.setDesignOverview(
				spec2Id,
				{ featureName: 'Test Feature 2', overview: 'Design overview' },
				{ actor: 'test-actor', projectId }
			);

			await repository.addDesignComponent(
				design2.id,
				{ slug: 'component-1', displayName: 'Component 1' },
				{ actor: 'test-actor', projectId }
			);

			await repository.finalizeStage(spec2Id, 'requirements', undefined, { actor: 'test-actor', projectId });
			await repository.approveStage(spec2Id, 'requirements', undefined, { actor: 'test-actor', projectId });
			await repository.finalizeStage(spec2Id, 'design', undefined, { actor: 'test-actor', projectId });

			// tasks approval requires a componentSlug -- omitting it should 400
			const tasksApproveResponse = await makeRequest(app, 'POST', `/api/specs/${spec2Id}/stages/tasks/approve`);
			assert.equal(tasksApproveResponse.statusCode, 400);
			assert.equal(tasksApproveResponse.body.error, 'component_required');
		}

		// =========================================================================
		// Test GET /docs returns the real Swagger UI (Story 6 AC1-2)
		// =========================================================================
		{
			const response = await makeRequest(app, 'GET', '/docs');
			assert.equal(response.statusCode, 200);
			assert(response.headers['content-type'].includes('text/html'));
		}

		// =========================================================================
		// Test static SPA fallback: the real built index.html for non-/api paths (Story 8 AC3)
		// =========================================================================
		{
			const spaResponse = await makeRequest(app, 'GET', '/some-random-path');
			assert.equal(spaResponse.statusCode, 200);
			assert(spaResponse.text.includes('id="root"'));
		}

		{
			const apiNotFoundResponse = await makeRequest(app, 'GET', '/api/nonexistent-endpoint');
			assert.equal(apiNotFoundResponse.statusCode, 404);
			assert.equal(apiNotFoundResponse.body.error, 'not_found');
		}
	} finally {
		await composition.close().catch(() => {});
		await postgres.stop().catch(() => {});
	}
});
