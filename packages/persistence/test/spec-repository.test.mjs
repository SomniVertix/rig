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

import { Pool, ensureProject, SpecRepository, SpecRepositoryError, SpecChangeEmitter } from '../dist/index.js';

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
	const containerName = `rig-spec-repo-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

// =============================================================================
// emission-coverage suite (spec-change-events)
// =============================================================================
// Representative tests verifying that each stage family's write methods emit
// exactly one correctly-scoped spec_changed event on success, and zero events
// on thrown rejection/rollback (Story 4 AC1, AC2).

describe('emission-coverage: requirements stage', () => {
	test('addUserStory emits spec_changed with stage=requirements', async () => {
		const events = [];
		const emitter = new SpecChangeEmitter();
		const testRepository = new SpecRepository(pool, emitter);
		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await testRepository.createSpec({ projectId, slug, featureName: 'Emission Test' }, TEST_AUDIT);
		const requirements = await testRepository.setRequirementsOverview(spec.id, { featureName: 'Emission Test', overview: 'Overview.' }, TEST_AUDIT);

		events.length = 0; // Clear events from prior operations

		const userStory = await testRepository.addUserStory(requirements.id, {
			title: 'Story',
			role: 'user',
			capability: 'do a thing',
			benefit: 'get value',
			rationale: 'because'
		}, TEST_AUDIT);

		assert.equal(events.length, 1, 'exactly one event emitted');
		assert.equal(events[0].type, 'spec_changed');
		assert.equal(events[0].specId, spec.id);
		assert.equal(events[0].stage, 'requirements');
		assert.equal(events[0].component, undefined, 'requirements events have no component');

		unsubscribe();
	});

	test('addUserStory emits no events on constraint violation', async () => {
		const events = [];
		const emitter = new SpecChangeEmitter();
		const testRepository = new SpecRepository(pool, emitter);
		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		// Try to add a user story to non-existent requirements ID (use a valid UUID)
		await assert.rejects(
			() => testRepository.addUserStory('00000000-0000-0000-0000-000000000000', {
				title: 'Story',
				role: 'user',
				capability: 'do a thing',
				benefit: 'get value',
				rationale: 'because'
			}, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'parent_not_found'
		);

		assert.equal(events.length, 0, 'no events emitted on constraint violation');

		unsubscribe();
	});

	test('addNonGoal emits spec_changed with stage=requirements', async () => {
		const events = [];
		const emitter = new SpecChangeEmitter();
		const testRepository = new SpecRepository(pool, emitter);
		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await testRepository.createSpec({ projectId, slug, featureName: 'Non-Goal Emission' }, TEST_AUDIT);
		const requirements = await testRepository.setRequirementsOverview(spec.id, { featureName: 'Non-Goal Emission', overview: 'Overview.' }, TEST_AUDIT);

		events.length = 0; // Clear events from prior operations

		await testRepository.addNonGoal(requirements.id, 'This is not a goal', TEST_AUDIT);

		assert.equal(events.length, 1, 'exactly one event emitted');
		assert.equal(events[0].type, 'spec_changed');
		assert.equal(events[0].specId, spec.id);
		assert.equal(events[0].stage, 'requirements');

		unsubscribe();
	});
});

describe('emission-coverage: design stage', () => {
	test('addDesignComponent emits spec_changed with stage=design', async () => {
		const events = [];
		const emitter = new SpecChangeEmitter();
		const testRepository = new SpecRepository(pool, emitter);
		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await testRepository.createSpec({ projectId, slug, featureName: 'Design Emission' }, TEST_AUDIT);
		const requirements = await testRepository.setRequirementsOverview(spec.id, { featureName: 'Design Emission', overview: 'Overview.' }, TEST_AUDIT);
		const userStory = await testRepository.addUserStory(requirements.id, {
			title: 'Story',
			role: 'user',
			capability: 'do a thing',
			benefit: 'get value',
			rationale: 'because'
		}, TEST_AUDIT);
		await testRepository.addAcceptanceCriterion(userStory.id, {
			earsPattern: 'ubiquitous',
			responseClause: 'system does thing',
			fullText: 'THE SYSTEM SHALL do the thing.'
		}, TEST_AUDIT);
		await testRepository.finalizeStage(spec.id, 'requirements', undefined, TEST_AUDIT);
		await setStageStatus(spec.id, 'requirements', 'approved');

		const design = await testRepository.setDesignOverview(spec.id, { featureName: 'Design Emission', overview: 'Design.' }, TEST_AUDIT);

		events.length = 0; // Clear events from prior operations

		await testRepository.addDesignComponent(design.id, { slug: 'test-component', displayName: 'Test Component' }, TEST_AUDIT);

		assert.equal(events.length, 1, 'exactly one event emitted');
		assert.equal(events[0].type, 'spec_changed');
		assert.equal(events[0].specId, spec.id);
		assert.equal(events[0].stage, 'design');

		unsubscribe();
	});
});

describe('emission-coverage: tasks stage', () => {
	test('addTaskItem emits spec_changed with stage=tasks and component', async () => {
		const events = [];
		const emitter = new SpecChangeEmitter();
		const testRepository = new SpecRepository(pool, emitter);
		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		const { spec, tasksDocsBySlug } = await buildApprovedSpecWithComponents(['test-component']);

		events.length = 0; // Clear events from setup

		const taskItem = await testRepository.addTaskItem(spec.id, 'test-component', {
			title: 'Do the thing',
			description: 'Does the thing.',
			traceability: 'Story 1 -> design §Architecture',
			acceptanceCheck: 'The thing is done.'
		}, TEST_AUDIT);

		assert.equal(events.length, 1, 'exactly one event emitted');
		assert.equal(events[0].type, 'spec_changed');
		assert.equal(events[0].specId, spec.id);
		assert.equal(events[0].stage, 'tasks');
		assert.equal(events[0].component, 'test-component');

		unsubscribe();
	});
});

describe('emission-coverage: finalizeStage', () => {
	test('finalizeStage(requirements) emits spec_changed with stage=requirements', async () => {
		const events = [];
		const emitter = new SpecChangeEmitter();
		const testRepository = new SpecRepository(pool, emitter);
		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await testRepository.createSpec({ projectId, slug, featureName: 'Finalize Req' }, TEST_AUDIT);
		const requirements = await testRepository.setRequirementsOverview(spec.id, { featureName: 'Finalize Req', overview: 'Overview.' }, TEST_AUDIT);
		const userStory = await testRepository.addUserStory(requirements.id, {
			title: 'Story',
			role: 'user',
			capability: 'do a thing',
			benefit: 'get value',
			rationale: 'because'
		}, TEST_AUDIT);
		await testRepository.addAcceptanceCriterion(userStory.id, {
			earsPattern: 'ubiquitous',
			responseClause: 'system does thing',
			fullText: 'THE SYSTEM SHALL do the thing.'
		}, TEST_AUDIT);

		events.length = 0; // Clear events from prior operations

		const result = await testRepository.finalizeStage(spec.id, 'requirements', undefined, TEST_AUDIT);

		assert.equal(events.length, 1, 'exactly one event emitted');
		assert.equal(events[0].type, 'spec_changed');
		assert.equal(events[0].specId, spec.id);
		assert.equal(events[0].stage, 'requirements');
		assert.equal(result.status, 'in_review');

		unsubscribe();
	});

	test('finalizeStage(design) emits spec_changed with stage=design', async () => {
		const events = [];
		const emitter = new SpecChangeEmitter();
		const testRepository = new SpecRepository(pool, emitter);
		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		const { spec } = await buildApprovedSpecWithComponents(['delta']);

		events.length = 0; // Clear events from setup

		const result = await testRepository.finalizeStage(spec.id, 'design', undefined, TEST_AUDIT);

		assert.equal(events.length, 1, 'exactly one event emitted');
		assert.equal(events[0].type, 'spec_changed');
		assert.equal(events[0].specId, spec.id);
		assert.equal(events[0].stage, 'design');
		assert.equal(events[0].component, undefined, 'design finalize has no component');
		assert.equal(result.status, 'in_review');

		unsubscribe();
	});

	test('finalizeStage(tasks) emits spec_changed with stage=tasks and component', async () => {
		const events = [];
		const emitter = new SpecChangeEmitter();
		const testRepository = new SpecRepository(pool, emitter);
		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		const { spec } = await buildApprovedSpecWithComponents(['echo', 'foxtrot']);
		// Add task items with files touched (using the test repository with emitter)
		const taskItem1 = await testRepository.addTaskItem(spec.id, 'echo', {
			title: 'Task 1',
			description: 'Does the thing.',
			traceability: 'Story 1 -> design §Architecture',
			acceptanceCheck: 'The thing is done.'
		}, TEST_AUDIT);
		await testRepository.addTaskFileTouched(taskItem1.id, '/path/to/file1.ts', TEST_AUDIT);

		const taskItem2 = await testRepository.addTaskItem(spec.id, 'foxtrot', {
			title: 'Task 2',
			description: 'Does the thing.',
			traceability: 'Story 1 -> design §Architecture',
			acceptanceCheck: 'The thing is done.'
		}, TEST_AUDIT);
		await testRepository.addTaskFileTouched(taskItem2.id, '/path/to/file2.ts', TEST_AUDIT);

		events.length = 0; // Clear events from setup

		const result = await testRepository.finalizeStage(spec.id, 'tasks', 'echo', TEST_AUDIT);

		assert.equal(events.length, 1, 'exactly one event emitted');
		assert.equal(events[0].type, 'spec_changed');
		assert.equal(events[0].specId, spec.id);
		assert.equal(events[0].stage, 'tasks');
		assert.equal(events[0].component, 'echo', 'tasks finalize includes component');
		assert.equal(result.status, 'in_review');

		unsubscribe();
	});

	test('finalizeStage emits no events on validation rejection', async () => {
		const events = [];
		const emitter = new SpecChangeEmitter();
		const testRepository = new SpecRepository(pool, emitter);
		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await testRepository.createSpec({ projectId, slug, featureName: 'Finalize Reject' }, TEST_AUDIT);
		await testRepository.setRequirementsOverview(spec.id, { featureName: 'Finalize Reject', overview: 'Overview.' }, TEST_AUDIT);
		// Deliberately no user stories

		events.length = 0; // Clear events from prior operations

		await assert.rejects(
			() => testRepository.finalizeStage(spec.id, 'requirements', undefined, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'zero_top_level_items'
		);

		assert.equal(events.length, 0, 'no events emitted on validation rejection');

		unsubscribe();
	});
});

describe('emission-coverage: approval/denial operations', () => {
	test('stage approval update emits no events (approval is human-only operation)', async () => {
		const events = [];
		const emitter = new SpecChangeEmitter();
		const testRepository = new SpecRepository(pool, emitter);
		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		const { spec } = await buildApprovedSpecWithComponents(['golf']);

		events.length = 0; // Clear events from setup

		// Directly update status via SQL (mimics human approve/deny in test environment)
		await pool.query(`update spec_pipeline.spec_stages set status = 'approved' where spec_id = $1 and stage_name = $2`, [spec.id, 'design']);

		// Approval is not a SpecRepository method call, so no emission expected
		assert.equal(events.length, 0, 'approval updates are external to SpecRepository');

		unsubscribe();
	});
});

describe('approveStage / denyStage (stage-approval-write-path)', () => {
	// Happy-path approve for requirements stage
	test('approveStage: requirements stage transitions from in_review to approved', async () => {
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

		// Stage should be in_review after finalize
		let stages = await repository.getSpecStages(spec.id);
		const requirementsStage = stages.find((s) => s.stageName === 'requirements');
		assert.equal(requirementsStage.status, 'in_review');

		// Approve the stage
		const result = await repository.approveStage(spec.id, 'requirements', undefined, TEST_AUDIT);
		assert.equal(result.stage, 'requirements');
		assert.equal(result.status, 'approved');

		// Verify database state
		stages = await repository.getSpecStages(spec.id);
		const approved = stages.find((s) => s.stageName === 'requirements');
		assert.equal(approved.status, 'approved');

		// Verify audit log entry exists
		const auditRows = await pool.query(
			`select * from spec_pipeline.audit_log where action = 'approve' and table_name = 'spec_stages' and row_id = $1`,
			[requirementsStage.id]
		);
		assert.equal(auditRows.rowCount, 1);
		assert.equal(auditRows.rows[0].actor, TEST_AUDIT.actor);
		assert.equal(auditRows.rows[0].project_id, TEST_AUDIT.projectId);
	});

	// Happy-path deny for requirements stage
	test('denyStage: requirements stage transitions from in_review back to not_started', async () => {
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

		// Stage should be in_review after finalize
		let stages = await repository.getSpecStages(spec.id);
		const requirementsStage = stages.find((s) => s.stageName === 'requirements');
		assert.equal(requirementsStage.status, 'in_review');

		// Deny the stage
		const result = await repository.denyStage(spec.id, 'requirements', undefined, TEST_AUDIT);
		assert.equal(result.stage, 'requirements');
		assert.equal(result.status, 'not_started');

		// Verify database state
		stages = await repository.getSpecStages(spec.id);
		const denied = stages.find((s) => s.stageName === 'requirements');
		assert.equal(denied.status, 'not_started');

		// Verify audit log entry exists
		const auditRows = await pool.query(
			`select * from spec_pipeline.audit_log where action = 'deny' and table_name = 'spec_stages' and row_id = $1`,
			[requirementsStage.id]
		);
		assert.equal(auditRows.rowCount, 1);
		assert.equal(auditRows.rows[0].actor, TEST_AUDIT.actor);
		assert.equal(auditRows.rows[0].project_id, TEST_AUDIT.projectId);
	});

	// Happy-path approve for design stage
	test('approveStage: design stage transitions from in_review to approved', async () => {
		const { spec } = await buildRequirementsApprovedOnlySpec();
		const design = await repository.setDesignOverview(spec.id, { featureName: 'Test Feature', overview: 'Design overview.' }, TEST_AUDIT);
		await repository.addDesignComponent(design.id, { slug: 'alpha', displayName: 'Alpha Component' }, TEST_AUDIT);
		await repository.finalizeStage(spec.id, 'design', undefined, TEST_AUDIT);

		// Stage should be in_review after finalize
		let stages = await repository.getSpecStages(spec.id);
		const designStage = stages.find((s) => s.stageName === 'design');
		assert.equal(designStage.status, 'in_review');

		// Approve the stage
		const result = await repository.approveStage(spec.id, 'design', undefined, TEST_AUDIT);
		assert.equal(result.stage, 'design');
		assert.equal(result.status, 'approved');

		// Verify database state
		stages = await repository.getSpecStages(spec.id);
		const approved = stages.find((s) => s.stageName === 'design');
		assert.equal(approved.status, 'approved');

		// Verify audit log entry exists
		const auditRows = await pool.query(
			`select * from spec_pipeline.audit_log where action = 'approve' and table_name = 'spec_stages' and row_id = $1`,
			[designStage.id]
		);
		assert.equal(auditRows.rowCount, 1);
	});

	// Happy-path deny for design stage
	test('denyStage: design stage transitions from in_review back to not_started', async () => {
		const { spec } = await buildRequirementsApprovedOnlySpec();
		const design = await repository.setDesignOverview(spec.id, { featureName: 'Test Feature', overview: 'Design overview.' }, TEST_AUDIT);
		await repository.addDesignComponent(design.id, { slug: 'beta', displayName: 'Beta Component' }, TEST_AUDIT);
		await repository.finalizeStage(spec.id, 'design', undefined, TEST_AUDIT);

		// Stage should be in_review after finalize
		let stages = await repository.getSpecStages(spec.id);
		const designStage = stages.find((s) => s.stageName === 'design');
		assert.equal(designStage.status, 'in_review');

		// Deny the stage
		const result = await repository.denyStage(spec.id, 'design', undefined, TEST_AUDIT);
		assert.equal(result.stage, 'design');
		assert.equal(result.status, 'not_started');

		// Verify database state
		stages = await repository.getSpecStages(spec.id);
		const denied = stages.find((s) => s.stageName === 'design');
		assert.equal(denied.status, 'not_started');

		// Verify audit log entry exists
		const auditRows = await pool.query(
			`select * from spec_pipeline.audit_log where action = 'deny' and table_name = 'spec_stages' and row_id = $1`,
			[designStage.id]
		);
		assert.equal(auditRows.rowCount, 1);
	});

	// Happy-path approve for tasks stage (component-specific)
	test('approveStage: tasks stage component transitions from in_review to approved via resolveTasksDocId', async () => {
		const { spec, tasksDocsBySlug } = await buildApprovedSpecWithComponents(['charlie']);
		const charlieItem = await addCompleteTaskItem(spec.id, 'charlie', 'Charlie work');
		await repository.addTaskFileTouched(charlieItem.id, 'packages/charlie/src/index.ts', TEST_AUDIT);
		await repository.finalizeStage(spec.id, 'tasks', 'charlie', TEST_AUDIT);

		// Tasks doc should be in_review after finalize
		let doc = await repository.getTasksDocByComponent(spec.id, 'charlie');
		assert.equal(doc.status, 'in_review');

		// Approve the tasks stage for this component
		const result = await repository.approveStage(spec.id, 'tasks', 'charlie', TEST_AUDIT);
		assert.equal(result.stage, 'tasks');
		assert.equal(result.componentSlug, 'charlie');
		assert.equal(result.status, 'approved');

		// Verify database state
		doc = await repository.getTasksDocByComponent(spec.id, 'charlie');
		assert.equal(doc.status, 'approved');

		// Verify audit log entry exists
		const auditRows = await pool.query(
			`select * from spec_pipeline.audit_log where action = 'approve' and table_name = 'tasks_docs' and row_id = $1`,
			[doc.id]
		);
		assert.equal(auditRows.rowCount, 1);
		assert.equal(auditRows.rows[0].actor, TEST_AUDIT.actor);
	});

	// Happy-path deny for tasks stage (component-specific)
	test('denyStage: tasks stage component transitions from in_review back to not_started via resolveTasksDocId', async () => {
		const { spec } = await buildApprovedSpecWithComponents(['delta']);
		const deltaItem = await addCompleteTaskItem(spec.id, 'delta', 'Delta work');
		await repository.addTaskFileTouched(deltaItem.id, 'packages/delta/src/index.ts', TEST_AUDIT);
		await repository.finalizeStage(spec.id, 'tasks', 'delta', TEST_AUDIT);

		// Tasks doc should be in_review after finalize
		let doc = await repository.getTasksDocByComponent(spec.id, 'delta');
		assert.equal(doc.status, 'in_review');

		// Deny the tasks stage for this component
		const result = await repository.denyStage(spec.id, 'tasks', 'delta', TEST_AUDIT);
		assert.equal(result.stage, 'tasks');
		assert.equal(result.componentSlug, 'delta');
		assert.equal(result.status, 'not_started');

		// Verify database state
		doc = await repository.getTasksDocByComponent(spec.id, 'delta');
		assert.equal(doc.status, 'not_started');

		// Verify audit log entry exists
		const auditRows = await pool.query(
			`select * from spec_pipeline.audit_log where action = 'deny' and table_name = 'tasks_docs' and row_id = $1`,
			[doc.id]
		);
		assert.equal(auditRows.rowCount, 1);
		assert.equal(auditRows.rows[0].actor, TEST_AUDIT.actor);
	});

	// Error case: not_in_review rejection for requirements stage
	test('approveStage: rejects with not_in_review when requirements stage is not in_review', async () => {
		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await repository.createSpec({ projectId, slug, featureName: 'Test Feature' }, TEST_AUDIT);
		const requirements = await repository.setRequirementsOverview(spec.id, { featureName: 'Test Feature', overview: 'Overview text.' }, TEST_AUDIT);

		// Stage is not_started, not in_review
		await assert.rejects(
			() => repository.approveStage(spec.id, 'requirements', undefined, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'not_in_review'
		);
	});

	// Error case: not_in_review rejection for design stage
	test('denyStage: rejects with not_in_review when design stage is not in_review', async () => {
		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await repository.createSpec({ projectId, slug, featureName: 'Test Feature' }, TEST_AUDIT);

		// Design stage is not_started, not in_review
		await assert.rejects(
			() => repository.denyStage(spec.id, 'design', undefined, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'not_in_review'
		);
	});

	// Error case: not_in_review rejection for tasks stage
	test('approveStage: rejects with not_in_review when tasks stage component is not in_review', async () => {
		const { spec } = await buildApprovedSpecWithComponents(['echo']);

		// Tasks doc is not_started, not in_review
		await assert.rejects(
			() => repository.approveStage(spec.id, 'tasks', 'echo', TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'not_in_review'
		);
	});

	// Error case: component_required rejection for tasks stage approve
	test('approveStage: rejects with component_required when stage=tasks and no componentSlug is supplied', async () => {
		const { spec } = await buildApprovedSpecWithComponents(['foxtrot']);
		const foxItem = await addCompleteTaskItem(spec.id, 'foxtrot', 'Fox work');
		await repository.addTaskFileTouched(foxItem.id, 'packages/fox/src/index.ts', TEST_AUDIT);
		await repository.finalizeStage(spec.id, 'tasks', 'foxtrot', TEST_AUDIT);

		// Attempting to approve tasks without componentSlug should fail
		await assert.rejects(
			() => repository.approveStage(spec.id, 'tasks', undefined, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'component_required'
		);
	});

	// Error case: component_required rejection for tasks stage deny
	test('denyStage: rejects with component_required when stage=tasks and no componentSlug is supplied', async () => {
		const { spec } = await buildApprovedSpecWithComponents(['golf']);
		const golfItem = await addCompleteTaskItem(spec.id, 'golf', 'Golf work');
		await repository.addTaskFileTouched(golfItem.id, 'packages/golf/src/index.ts', TEST_AUDIT);
		await repository.finalizeStage(spec.id, 'tasks', 'golf', TEST_AUDIT);

		// Attempting to deny tasks without componentSlug should fail
		await assert.rejects(
			() => repository.denyStage(spec.id, 'tasks', undefined, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'component_required'
		);
	});

	// Verify each successful call creates exactly one matching audit_log row
	test('approveStage and denyStage each create a single matching audit_log row', async () => {
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

		const stages = await repository.getSpecStages(spec.id);
		const requirementsStage = stages.find((s) => s.stageName === 'requirements');

		// Approve requirements
		await repository.approveStage(spec.id, 'requirements', undefined, TEST_AUDIT);
		let auditRows = await pool.query(
			`select * from spec_pipeline.audit_log where action = 'approve' and table_name = 'spec_stages' and row_id = $1`,
			[requirementsStage.id]
		);
		assert.equal(auditRows.rowCount, 1, 'approveStage should create exactly one audit_log row');

		// Deny requirements (first reset to in_review for testing)
		await setStageStatus(spec.id, 'requirements', 'in_review');
		await repository.denyStage(spec.id, 'requirements', undefined, TEST_AUDIT);
		auditRows = await pool.query(
			`select * from spec_pipeline.audit_log where action = 'deny' and table_name = 'spec_stages' and row_id = $1`,
			[requirementsStage.id]
		);
		assert.equal(auditRows.rowCount, 1, 'denyStage should create exactly one audit_log row');
	});
});
