// T5.10: unit/integration tests for finalize_stage/get_next_stage rule enforcement.
//
// Spins up a throwaway Postgres container (matching the convention used by
// packages/server/test/e2e/api.test.mjs), applies the evolved canonical
// spec_pipeline schema.sql, and exercises SpecRepository.finalizeStage /
// getNextStage directly against it. Approve/deny itself is out of this feature's
// tool surface (Story 9) -- these tests simulate that human-only action with a
// direct SQL UPDATE, purely to set up preconditions for the rules under test.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

import { Pool, ensureProject, SpecRepository, SpecRepositoryError } from '../dist/index.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const schemaPath = join(repoRoot, 'spec-templates/spec/db/schema.sql');

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
	const containerName = `relentless-spec-repo-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
		'POSTGRES_DB=relentless',
		'-p',
		`${port}:5432`,
		'postgres:16-alpine'
	];
	const { stdout } = await runCommand('docker', args);
	const containerId = stdout.trim();
	const connectionString = `postgres://postgres:postgres@127.0.0.1:${port}/relentless`;

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

let postgres;
let pool;
let repository;
let projectId;

// T6.3 threads an `AuditInfo` (actor + projectId) through every SpecRepository
// mutation method so its audit_log INSERT can share the same transaction as the
// mutation. These tests exercise SpecRepository directly (bypassing the MCP tool
// layer's actor/known_actors guardrail, T6.2), so any non-empty actor string works.
const TEST_AUDIT = { actor: 'test-actor', projectId: null };

before(async () => {
	postgres = await startPostgresContainer();
	pool = new Pool({ connectionString: postgres.connectionString });
	const schemaSql = await readFile(schemaPath, 'utf8');
	await pool.query(schemaSql);
	repository = new SpecRepository(pool);
	projectId = await ensureProject(pool, `spec-repository-test-${randomUUID().slice(0, 8)}`);
});

after(async () => {
	await pool?.end();
	await postgres?.stop();
});

async function setStageStatus(specId, stageName, status) {
	await pool.query(`update spec_pipeline.spec_stages set status = $3 where spec_id = $1 and stage_name = $2`, [specId, stageName, status]);
}

async function setTasksDocStatus(tasksDocId, status) {
	await pool.query(`update spec_pipeline.tasks_docs set status = $2 where id = $1`, [tasksDocId, status]);
}

/**
 * Builds a spec with requirements approved, design approved, and one
 * `design_components` row (+ its auto-seeded `tasks_docs` row) per requested slug.
 * Mirrors the only path finalize_stage / the seed trigger actually take -- no
 * shortcuts around the schema.
 */
async function buildApprovedSpecWithComponents(componentSlugs) {
	const slug = `spec-${randomUUID().slice(0, 8)}`;
	const spec = await repository.createSpec({ projectId, slug, featureName: 'Test Feature' }, TEST_AUDIT);

	const requirements = await repository.setRequirementsOverview(spec.id, { featureName: 'Test Feature', overview: 'Overview text.' }, TEST_AUDIT);
	const userStory = await repository.addUserStory(requirements.id, {
		title: 'Story',
		role: 'user',
		capability: 'do a thing',
		benefit: 'get value',
		rationale: 'because'
	}, TEST_AUDIT);
	await repository.addAcceptanceCriterion(userStory.id, {
		earsPattern: 'event_driven',
		triggerClause: 'something happens',
		responseClause: 'the system shall respond',
		fullText: 'WHEN something happens, THE SYSTEM SHALL respond within 200ms.'
	}, TEST_AUDIT);
	await repository.finalizeStage(spec.id, 'requirements', undefined, TEST_AUDIT);
	await setStageStatus(spec.id, 'requirements', 'approved');

	const design = await repository.setDesignOverview(spec.id, { featureName: 'Test Feature', overview: 'Design overview.' }, TEST_AUDIT);
	await repository.setDesignArchitecture(spec.id, 'Design architecture.', TEST_AUDIT);
	for (const componentSlug of componentSlugs) {
		await repository.addDesignComponent(design.id, { slug: componentSlug, displayName: componentSlug }, TEST_AUDIT);
	}
	await repository.finalizeStage(spec.id, 'design', undefined, TEST_AUDIT);
	await setStageStatus(spec.id, 'design', 'approved');

	const tasksDocsBySlug = new Map();
	for (const componentSlug of componentSlugs) {
		const doc = await repository.getTasksDocByComponent(spec.id, componentSlug);
		assert.ok(doc, `expected tasks_docs to be auto-seeded for component ${componentSlug}`);
		tasksDocsBySlug.set(componentSlug, doc);
	}

	return { spec, design, tasksDocsBySlug };
}

/** Adds one top-level task item (with a files-touched entry) to a component. */
async function addCompleteTaskItem(specId, componentSlug, title) {
	return await repository.addTaskItem(specId, componentSlug, {
		title,
		description: 'Does the thing.',
		traceability: 'Story 1 -> design §Architecture',
		acceptanceCheck: 'The thing is done.'
	}, TEST_AUDIT);
}

describe('finalize_stage', () => {
	test('rejects finalizing requirements with zero user stories', async () => {
		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await repository.createSpec({ projectId, slug, featureName: 'Empty Feature' }, TEST_AUDIT);
		await repository.setRequirementsOverview(spec.id, { featureName: 'Empty Feature', overview: 'Overview.' }, TEST_AUDIT);

		await assert.rejects(
			() => repository.finalizeStage(spec.id, 'requirements', undefined, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'zero_top_level_items'
		);
	});

	test('rejects finalizing requirements when a user story has zero acceptance criteria', async () => {
		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await repository.createSpec({ projectId, slug, featureName: 'Bare Story Feature' }, TEST_AUDIT);
		const requirements = await repository.setRequirementsOverview(spec.id, { featureName: 'Bare Story Feature', overview: 'Overview.' }, TEST_AUDIT);
		await repository.addUserStory(requirements.id, {
			title: 'Story',
			role: 'user',
			capability: 'do a thing',
			benefit: 'get value',
			rationale: 'because'
		}, TEST_AUDIT);

		await assert.rejects(
			() => repository.finalizeStage(spec.id, 'requirements', undefined, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'zero_acceptance_criteria'
		);
	});

	test('rejects finalizing design when the predecessor (requirements) is not approved', async () => {
		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await repository.createSpec({ projectId, slug, featureName: 'Ordering Feature' }, TEST_AUDIT);
		const requirements = await repository.setRequirementsOverview(spec.id, { featureName: 'Ordering Feature', overview: 'Overview.' }, TEST_AUDIT);
		const userStory = await repository.addUserStory(requirements.id, {
			title: 'Story',
			role: 'user',
			capability: 'do a thing',
			benefit: 'get value',
			rationale: 'because'
		}, TEST_AUDIT);
		await repository.addAcceptanceCriterion(userStory.id, {
			earsPattern: 'ubiquitous',
			responseClause: 'the system shall do the thing',
			fullText: 'THE SYSTEM SHALL do the thing.'
		}, TEST_AUDIT);
		// requirements is only in_review here, never approved.
		await repository.finalizeStage(spec.id, 'requirements', undefined, TEST_AUDIT);

		const design = await repository.setDesignOverview(spec.id, { featureName: 'Ordering Feature', overview: 'Design overview.' }, TEST_AUDIT);
		await repository.addDesignComponent(design.id, { slug: 'only-component', displayName: 'Only Component' }, TEST_AUDIT);

		await assert.rejects(
			() => repository.finalizeStage(spec.id, 'design', undefined, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'predecessor_not_approved'
		);
	});

	test('rejects finalizing design with zero declared components', async () => {
		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await repository.createSpec({ projectId, slug, featureName: 'No Components Feature' }, TEST_AUDIT);
		const requirements = await repository.setRequirementsOverview(spec.id, { featureName: 'No Components Feature', overview: 'Overview.' }, TEST_AUDIT);
		const userStory = await repository.addUserStory(requirements.id, {
			title: 'Story',
			role: 'user',
			capability: 'do a thing',
			benefit: 'get value',
			rationale: 'because'
		}, TEST_AUDIT);
		await repository.addAcceptanceCriterion(userStory.id, {
			earsPattern: 'ubiquitous',
			responseClause: 'the system shall do the thing',
			fullText: 'THE SYSTEM SHALL do the thing.'
		}, TEST_AUDIT);
		await repository.finalizeStage(spec.id, 'requirements', undefined, TEST_AUDIT);
		await setStageStatus(spec.id, 'requirements', 'approved');
		await repository.setDesignOverview(spec.id, { featureName: 'No Components Feature', overview: 'Design overview.' }, TEST_AUDIT);

		await assert.rejects(
			() => repository.finalizeStage(spec.id, 'design', undefined, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'zero_components'
		);
	});

	test('rejects finalizing a component tasks doc with zero task_files_touched on a top-level item', async () => {
		const { spec } = await buildApprovedSpecWithComponents(['alpha']);
		await addCompleteTaskItem(spec.id, 'alpha', 'Do the thing').then(async (taskItem) => {
			// Deliberately no task_files_touched for this item.
			assert.ok(taskItem.id);
		});

		await assert.rejects(
			() => repository.finalizeStage(spec.id, 'tasks', 'alpha', TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'zero_task_files_touched'
		);
	});

	test('rejects finalizing a component tasks doc with zero top-level task items', async () => {
		const { spec } = await buildApprovedSpecWithComponents(['bravo']);

		await assert.rejects(
			() => repository.finalizeStage(spec.id, 'tasks', 'bravo', TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'zero_top_level_items'
		);
	});

	test('finalizes only the named component, never a shared tasks-stage status', async () => {
		const { spec } = await buildApprovedSpecWithComponents(['charlie', 'delta']);
		const charlieItem = await addCompleteTaskItem(spec.id, 'charlie', 'Charlie work');
		await repository.addTaskFileTouched(charlieItem.id, 'packages/charlie/src/index.ts', TEST_AUDIT);

		const result = await repository.finalizeStage(spec.id, 'tasks', 'charlie', TEST_AUDIT);
		assert.equal(result.status, 'in_review');

		const charlieDoc = await repository.getTasksDocByComponent(spec.id, 'charlie');
		const deltaDoc = await repository.getTasksDocByComponent(spec.id, 'delta');
		assert.equal(charlieDoc.status, 'in_review');
		assert.equal(deltaDoc.status, 'not_started');
	});

	test('rejects finalizing tasks for a component when a cycle exists anywhere in the spec', async () => {
		const { spec } = await buildApprovedSpecWithComponents(['echo', 'foxtrot']);
		const echoItem = await addCompleteTaskItem(spec.id, 'echo', 'Echo work');
		await repository.addTaskFileTouched(echoItem.id, 'packages/echo/src/index.ts', TEST_AUDIT);
		const foxtrotItem = await addCompleteTaskItem(spec.id, 'foxtrot', 'Foxtrot work');
		await repository.addTaskFileTouched(foxtrotItem.id, 'packages/foxtrot/src/index.ts', TEST_AUDIT);

		// echo -> foxtrot and foxtrot -> echo forms a 2-node cross-component cycle.
		await repository.addTaskDependencyEdge(spec.id, { fromTaskItemId: echoItem.id, toTaskItemId: foxtrotItem.id }, TEST_AUDIT);
		await repository.addTaskDependencyEdge(spec.id, { fromTaskItemId: foxtrotItem.id, toTaskItemId: echoItem.id }, TEST_AUDIT);

		await assert.rejects(
			() => repository.finalizeStage(spec.id, 'tasks', 'echo', TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'cycle_detected'
		);
	});

	test('a non-cyclic cross-component dependency graph does not block finalize', async () => {
		const { spec } = await buildApprovedSpecWithComponents(['golf', 'hotel']);
		const golfItem = await addCompleteTaskItem(spec.id, 'golf', 'Golf work');
		await repository.addTaskFileTouched(golfItem.id, 'packages/golf/src/index.ts', TEST_AUDIT);
		const hotelItem = await addCompleteTaskItem(spec.id, 'hotel', 'Hotel work');
		await repository.addTaskFileTouched(hotelItem.id, 'packages/hotel/src/index.ts', TEST_AUDIT);

		// golf -> hotel only: acyclic.
		await repository.addTaskDependencyEdge(spec.id, { fromTaskItemId: golfItem.id, toTaskItemId: hotelItem.id }, TEST_AUDIT);

		const golfResult = await repository.finalizeStage(spec.id, 'tasks', 'golf', TEST_AUDIT);
		const hotelResult = await repository.finalizeStage(spec.id, 'tasks', 'hotel', TEST_AUDIT);
		assert.equal(golfResult.status, 'in_review');
		assert.equal(hotelResult.status, 'in_review');
	});

	test('rejects a same-component task dependency edge before any cycle check runs', async () => {
		const { spec } = await buildApprovedSpecWithComponents(['india']);
		const first = await addCompleteTaskItem(spec.id, 'india', 'First');
		const second = await addCompleteTaskItem(spec.id, 'india', 'Second');

		await assert.rejects(
			() => repository.addTaskDependencyEdge(spec.id, { fromTaskItemId: first.id, toTaskItemId: second.id }, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'same_component_edge'
		);
	});

	test('design redraft: deletes an orphaned, still-empty component task doc; rejects when it has drafted content', async () => {
		const { spec, design } = await buildApprovedSpecWithComponents(['juliet', 'kilo']);

		// juliet has drafted content; kilo does not. A redraft that *renames* a
		// component's slug (rather than deleting the design_components row outright,
		// which would cascade-delete its tasks_docs row before finalize ever runs)
		// is what actually leaves an orphaned tasks_docs row still present for
		// finalize_stage('design') to reconcile: the FK from tasks_docs to
		// design_components survives the rename, but tasks_docs.component_slug is a
		// denormalized snapshot that only finalize's reconciliation brings back
		// into agreement with the current design_components set.
		const julietItem = await addCompleteTaskItem(spec.id, 'juliet', 'Juliet work');
		await repository.addTaskFileTouched(julietItem.id, 'packages/juliet/src/index.ts', TEST_AUDIT);

		const components = await repository.listDesignComponents(design.id);
		const julietComponent = components.find((component) => component.slug === 'juliet');
		const kiloComponent = components.find((component) => component.slug === 'kilo');
		await repository.updateDesignComponent(julietComponent.id, { slug: 'juliet-renamed' }, TEST_AUDIT);
		await repository.updateDesignComponent(kiloComponent.id, { slug: 'kilo-renamed' }, TEST_AUDIT);

		await assert.rejects(
			() => repository.finalizeStage(spec.id, 'design', undefined, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'orphaned_component_has_content'
		);

		// Deleting juliet's drafted content leaves only stale, empty, orphaned docs,
		// which the redraft reconciliation is allowed to delete outright; the seed
		// trigger then re-seeds fresh tasks_docs rows under the renamed slugs.
		await repository.deleteTaskItem(julietItem.id, TEST_AUDIT);
		const result = await repository.finalizeStage(spec.id, 'design', undefined, TEST_AUDIT);
		assert.equal(result.status, 'in_review');
		assert.equal(await repository.getTasksDocByComponent(spec.id, 'juliet'), null);
		assert.equal(await repository.getTasksDocByComponent(spec.id, 'kilo'), null);
		assert.ok(await repository.getTasksDocByComponent(spec.id, 'juliet-renamed'));
		assert.ok(await repository.getTasksDocByComponent(spec.id, 'kilo-renamed'));
	});
});

describe('get_next_stage', () => {
	test('reports requirements as actionable when it is not yet approved', async () => {
		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await repository.createSpec({ projectId, slug, featureName: 'Fresh Feature' }, TEST_AUDIT);

		const result = await repository.getNextStage(spec.id);
		assert.equal(result.actionableStage, 'requirements');
	});

	test('reports design as actionable once requirements is approved', async () => {
		const { spec } = await buildRequirementsApprovedOnlySpec();
		const result = await repository.getNextStage(spec.id);
		assert.equal(result.actionableStage, 'design');
	});

	test('reports no actionable stage once every stage/component is approved', async () => {
		const { spec, tasksDocsBySlug } = await buildApprovedSpecWithComponents(['mike', 'november']);
		for (const doc of tasksDocsBySlug.values()) {
			await setTasksDocStatus(doc.id, 'approved');
		}

		const result = await repository.getNextStage(spec.id);
		assert.equal(result.actionableStage, null);
	});

	test('reports tasks as actionable and names the one lagging component', async () => {
		const { spec, tasksDocsBySlug } = await buildApprovedSpecWithComponents(['oscar', 'papa', 'quebec']);
		await setTasksDocStatus(tasksDocsBySlug.get('oscar').id, 'in_review');
		await setTasksDocStatus(tasksDocsBySlug.get('papa').id, 'in_review');
		// quebec is deliberately left not_started.

		const result = await repository.getNextStage(spec.id);
		assert.equal(result.actionableStage, 'tasks');
		assert.deepEqual(result.laggingComponents, ['quebec']);
	});
});

async function buildRequirementsApprovedOnlySpec() {
	const slug = `spec-${randomUUID().slice(0, 8)}`;
	const spec = await repository.createSpec({ projectId, slug, featureName: 'Requirements Only Feature' }, TEST_AUDIT);
	const requirements = await repository.setRequirementsOverview(spec.id, { featureName: 'Requirements Only Feature', overview: 'Overview.' }, TEST_AUDIT);
	const userStory = await repository.addUserStory(requirements.id, {
		title: 'Story',
		role: 'user',
		capability: 'do a thing',
		benefit: 'get value',
		rationale: 'because'
	}, TEST_AUDIT);
	await repository.addAcceptanceCriterion(userStory.id, {
		earsPattern: 'ubiquitous',
		responseClause: 'the system shall do the thing',
		fullText: 'THE SYSTEM SHALL do the thing.'
	}, TEST_AUDIT);
	await repository.finalizeStage(spec.id, 'requirements', undefined, TEST_AUDIT);
	await setStageStatus(spec.id, 'requirements', 'approved');
	return { spec };
}
