// Unit tests for the two new read-only MCP tools this trail (spec-stage-tracking-fixes
// W3) adds: list_task_items and list_definition_of_done_items. Both exist to expose a
// task/DoD item's real spec_pipeline UUID to a cold reader (spec-implementation-orchestrator,
// code-reviewer, etc.) that previously had no MCP path to it other than raw SQL against
// the container's Postgres -- render_document's markdown only ever showed the display
// item_id ("1", "1.1"), never the row id update_task_item/update_definition_of_done_item
// actually require.
//
// Spins up a throwaway Postgres container (matching spec-repository.test.mjs /
// trail-tools.test.mjs) and calls registerTasksTools against a minimal fake McpServer
// that just captures each registered tool's handler, so the exact handler wired into
// the real server is what gets invoked here.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

import { Pool } from 'pg';

import { registerTasksTools } from '../../dist/server/src/mcp/tools/tasks-tools.js';
import { ensureProject, SpecRepository } from '../../../persistence/dist/index.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const schemaPath = join(repoRoot, 'spec-templates/spec/db/schema.sql');

const TEST_AUDIT = { actor: 'test-actor', projectId: null };

function runCommand(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
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
	const containerName = `rig-tasks-tools-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	const args = [
		'run',
		'--rm',
		'-d',
		'--name',
		containerName,
		'-e',
		'POSTGRES_USER=postgres',
		'-e',
		'POSTGRES_PASSWORD=postgres',
		'-e',
		'POSTGRES_DB=rig',
		'-p',
		`${port}:5432`,
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

/** A minimal stand-in for `McpServer` that just records each registered
 * tool's handler by name, so tests can invoke the exact function
 * `registerTasksTools` wired up without going through the MCP protocol. */
function createFakeServer() {
	const handlers = new Map();
	return {
		handlers,
		registerTool(name, _config, handler) {
			handlers.set(name, handler);
		}
	};
}

function parseResult(result) {
	return JSON.parse(result.content[0].text);
}

const KNOWN_ACTOR = 'test-known-actor';

let postgres;
let pool;
let repository;
let projectId;
let otherProjectId;
let handlers;

before(async () => {
	postgres = await startPostgresContainer();
	pool = new Pool({ connectionString: postgres.connectionString });
	const schemaSql = await readFile(schemaPath, 'utf8');
	await pool.query(schemaSql);
	await pool.query(`insert into spec_pipeline.known_actors (actor, source) values ($1, 'test')`, [KNOWN_ACTOR]);

	repository = new SpecRepository(pool);
	projectId = await ensureProject(pool, `tasks-tools-test-${randomUUID().slice(0, 8)}`);
	otherProjectId = await ensureProject(pool, `tasks-tools-test-other-${randomUUID().slice(0, 8)}`);

	const fakeServer = createFakeServer();
	registerTasksTools(fakeServer, { pool, projectId, projectSlug: 'test-project' });
	handlers = fakeServer.handlers;
});

after(async () => {
	await pool?.end();
	await postgres?.stop();
});

async function setStageStatus(specId, stageName, status) {
	await pool.query(`update spec_pipeline.spec_stages set status = $3 where spec_id = $1 and stage_name = $2`, [specId, stageName, status]);
}

/** Mirrors spec-repository.test.mjs's helper of the same shape: builds a spec
 * with requirements and design approved, plus one auto-seeded tasks_docs row
 * per requested component slug -- the only path a tasks_docs row actually
 * comes into being (no shortcuts around the schema). */
async function buildApprovedSpecWithComponents(ownerProjectId, componentSlugs) {
	const slug = `spec-${randomUUID().slice(0, 8)}`;
	const spec = await repository.createSpec({ projectId: ownerProjectId, slug, featureName: 'Test Feature' }, TEST_AUDIT);

	const requirements = await repository.setRequirementsOverview(spec.id, { featureName: 'Test Feature', overview: 'Overview text.' }, TEST_AUDIT);
	const userStory = await repository.addUserStory(
		requirements.id,
		{ title: 'Story', role: 'user', capability: 'do a thing', benefit: 'get value', rationale: 'because' },
		TEST_AUDIT
	);
	await repository.addAcceptanceCriterion(
		userStory.id,
		{
			earsPattern: 'event_driven',
			triggerClause: 'something happens',
			responseClause: 'the system shall respond',
			fullText: 'WHEN something happens, THE SYSTEM SHALL respond within 200ms.'
		},
		TEST_AUDIT
	);
	await repository.finalizeStage(spec.id, 'requirements', undefined, TEST_AUDIT);
	await setStageStatus(spec.id, 'requirements', 'approved');

	const design = await repository.setDesignOverview(spec.id, { featureName: 'Test Feature', overview: 'Design overview.' }, TEST_AUDIT);
	await repository.setDesignArchitecture(spec.id, 'Design architecture.', TEST_AUDIT);
	for (const componentSlug of componentSlugs) {
		await repository.addDesignComponent(design.id, { slug: componentSlug, displayName: componentSlug }, TEST_AUDIT);
	}
	await repository.finalizeStage(spec.id, 'design', undefined, TEST_AUDIT);
	await setStageStatus(spec.id, 'design', 'approved');

	return spec;
}

describe('list_task_items', () => {
	test('returns each item\'s real id alongside its display item_id, title, and parentItemId', async () => {
		const spec = await buildApprovedSpecWithComponents(projectId, ['auth-gateway']);
		const parent = await repository.addTaskItem(
			spec.id,
			'auth-gateway',
			{ title: 'Implement OAuth2', description: 'Build it.', traceability: 'Story 1', acceptanceCheck: 'Works.' },
			TEST_AUDIT
		);
		const child = await repository.addTaskItem(
			spec.id,
			'auth-gateway',
			{ title: 'Wire callback route', description: 'Sub-step.', traceability: 'Story 1', acceptanceCheck: 'Works.', parentItemId: parent.id },
			TEST_AUDIT
		);

		const result = await handlers.get('list_task_items')({ specId: spec.id, componentSlug: 'auth-gateway' });
		assert.equal(result.isError, undefined);
		const { taskItems } = parseResult(result);

		assert.equal(taskItems.length, 2);
		const [first, second] = taskItems;
		assert.equal(first.id, parent.id, 'the real UUID must be exposed, not just the display item_id');
		assert.equal(first.itemId, '1');
		assert.equal(first.parentItemId, null);
		assert.equal(first.title, 'Implement OAuth2');
		assert.equal(first.isChecked, false);
		assert.equal(second.id, child.id);
		assert.equal(second.itemId, '1.1');
		assert.equal(second.parentItemId, parent.id);
	});

	test('rejects an unknown component slug (unknown_component)', async () => {
		const spec = await buildApprovedSpecWithComponents(projectId, ['auth-gateway']);

		const result = await handlers.get('list_task_items')({ specId: spec.id, componentSlug: 'does-not-exist' });
		assert.equal(result.isError, true);
		assert.equal(parseResult(result).error, 'unknown_component');
	});

	test('rejects a spec belonging to a different project (not_found)', async () => {
		const spec = await buildApprovedSpecWithComponents(otherProjectId, ['auth-gateway']);

		const result = await handlers.get('list_task_items')({ specId: spec.id, componentSlug: 'auth-gateway' });
		assert.equal(result.isError, true);
		assert.equal(parseResult(result).error, 'not_found');
	});

	test('the real id returned round-trips into update_task_item (the original ISSUE-PLANS.md gap: update_task_item(id: "1") used to fail with invalid uuid syntax)', async () => {
		const spec = await buildApprovedSpecWithComponents(projectId, ['auth-gateway']);
		await repository.addTaskItem(
			spec.id,
			'auth-gateway',
			{ title: 'Implement OAuth2', description: 'Build it.', traceability: 'Story 1', acceptanceCheck: 'Works.' },
			TEST_AUDIT
		);

		const listResult = await handlers.get('list_task_items')({ specId: spec.id, componentSlug: 'auth-gateway' });
		const { taskItems } = parseResult(listResult);
		const { id: realId, itemId: displayItemId } = taskItems[0];
		assert.notEqual(realId, displayItemId, 'the real id must differ from the display item_id ("1") that used to be mistaken for it');

		const updateResult = await handlers.get('update_task_item')({ actor: KNOWN_ACTOR, id: realId, isChecked: true });
		assert.equal(updateResult.isError, undefined, 'update_task_item must accept the real id returned by list_task_items');
		const { taskItem } = parseResult(updateResult);
		assert.equal(taskItem.id, realId);
		assert.equal(taskItem.isChecked, true);
	});
});

describe('list_definition_of_done_items', () => {
	test('returns each item\'s real id alongside its ordinal, description, and isChecked', async () => {
		const spec = await buildApprovedSpecWithComponents(projectId, ['auth-gateway']);
		const first = await repository.addDefinitionOfDoneItem(spec.id, 'All tests pass.', TEST_AUDIT);
		const second = await repository.addDefinitionOfDoneItem(spec.id, 'Docs updated.', TEST_AUDIT);
		await repository.updateDefinitionOfDoneItem(first.id, { isChecked: true }, TEST_AUDIT);

		const result = await handlers.get('list_definition_of_done_items')({ specId: spec.id });
		assert.equal(result.isError, undefined);
		const { definitionOfDoneItems } = parseResult(result);

		assert.equal(definitionOfDoneItems.length, 2);
		assert.equal(definitionOfDoneItems[0].id, first.id, 'the real UUID must be exposed');
		assert.equal(definitionOfDoneItems[0].ordinal, 1);
		assert.equal(definitionOfDoneItems[0].isChecked, true);
		assert.equal(definitionOfDoneItems[1].id, second.id);
		assert.equal(definitionOfDoneItems[1].ordinal, 2);
		assert.equal(definitionOfDoneItems[1].isChecked, false);
	});

	test('rejects a spec belonging to a different project (not_found)', async () => {
		const spec = await buildApprovedSpecWithComponents(otherProjectId, ['auth-gateway']);

		const result = await handlers.get('list_definition_of_done_items')({ specId: spec.id });
		assert.equal(result.isError, true);
		assert.equal(parseResult(result).error, 'not_found');
	});

	test('the real id returned round-trips into update_definition_of_done_item', async () => {
		const spec = await buildApprovedSpecWithComponents(projectId, ['auth-gateway']);
		await repository.addDefinitionOfDoneItem(spec.id, 'All tests pass.', TEST_AUDIT);

		const listResult = await handlers.get('list_definition_of_done_items')({ specId: spec.id });
		const { definitionOfDoneItems } = parseResult(listResult);
		const realId = definitionOfDoneItems[0].id;

		const updateResult = await handlers.get('update_definition_of_done_item')({ actor: KNOWN_ACTOR, id: realId, isChecked: true });
		assert.equal(updateResult.isError, undefined, 'update_definition_of_done_item must accept the real id returned by list_definition_of_done_items');
		const { definitionOfDoneItem } = parseResult(updateResult);
		assert.equal(definitionOfDoneItem.id, realId);
		assert.equal(definitionOfDoneItem.isChecked, true);
	});
});
