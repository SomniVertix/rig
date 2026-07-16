// T6.7: unit tests for guardrails validation rules -- EARS/empty/quality-adjective
// content validation (T6.1), actor/known-actors validation (T6.2), boot-time
// known-actors sync (T6.4), and the parent/child checkbox rule (T6.5).
//
// The pure content-validation rules (EARS structural matching, blank rejection,
// quality-adjective rejection) need no database and run first. The actor-registry
// and checkbox-rule tests spin up a throwaway Postgres container (matching the
// convention used by packages/server/test/e2e/api.test.mjs and
// packages/persistence/test/spec-repository.test.mjs), apply the evolved canonical
// spec_pipeline schema.sql, and exercise the guardrails module against it directly.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

import { Pool } from 'pg';

import {
	assertEarsStructure,
	assertNoUnquantifiedQualityAdjective,
	assertNotBlank,
	assertParentCheckboxRule,
	GuardrailError,
	QUALITY_ADJECTIVES,
	requireKnownActor,
	syncKnownActorsFromAgentDefinitions
} from '../../dist/server/src/mcp/guardrails/index.js';
import { ensureProject, SpecRepository } from '../../../persistence/dist/index.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const schemaPath = join(repoRoot, 'spec-templates/spec/db/schema.sql');
const agentsDirectory = join(repoRoot, 'spec-templates/agents');

const TEST_AUDIT = { actor: 'test-actor', projectId: null };

// =============================================================================
// T6.1: EARS / empty-content / quality-adjective validation (pure, no DB)
// =============================================================================

describe('assertNotBlank (T6.1, Story 12.5)', () => {
	test('rejects an empty string', () => {
		assert.throws(() => assertNotBlank('role', ''), (error) => error instanceof GuardrailError && error.rule === 'empty_field');
	});

	test('rejects a whitespace-only string', () => {
		assert.throws(() => assertNotBlank('role', '   \t\n '), (error) => error instanceof GuardrailError && error.rule === 'empty_field');
	});

	test('accepts non-blank content', () => {
		assert.doesNotThrow(() => assertNotBlank('role', 'a project maintainer'));
	});
});

describe('assertEarsStructure (T6.1, Story 12.1, 12.6)', () => {
	test('rejects full_text lacking SHALL entirely', () => {
		assert.throws(
			() => assertEarsStructure('ubiquitous', 'THE SYSTEM does the thing.'),
			(error) => error instanceof GuardrailError && error.rule === 'ears_missing_shall'
		);
	});

	test('ubiquitous: accepts SHALL with no extra keyword required', () => {
		assert.doesNotThrow(() => assertEarsStructure('ubiquitous', 'THE SYSTEM SHALL always do the thing.'));
	});

	test('event_driven: rejects SHALL without WHEN', () => {
		assert.throws(
			() => assertEarsStructure('event_driven', 'THE SYSTEM SHALL respond.'),
			(error) => error instanceof GuardrailError && error.rule === 'ears_pattern_mismatch'
		);
	});

	test('event_driven: accepts WHEN + SHALL', () => {
		assert.doesNotThrow(() => assertEarsStructure('event_driven', 'WHEN a request arrives, THE SYSTEM SHALL respond within 200ms.'));
	});

	test('state_driven: rejects SHALL without WHILE', () => {
		assert.throws(
			() => assertEarsStructure('state_driven', 'THE SYSTEM SHALL stay available.'),
			(error) => error instanceof GuardrailError && error.rule === 'ears_pattern_mismatch'
		);
	});

	test('state_driven: accepts WHILE + SHALL', () => {
		assert.doesNotThrow(() => assertEarsStructure('state_driven', 'WHILE the session is active, THE SYSTEM SHALL keep the connection open.'));
	});

	test('unwanted_behavior: rejects SHALL without IF', () => {
		assert.throws(
			() => assertEarsStructure('unwanted_behavior', 'THE SYSTEM SHALL log the error.'),
			(error) => error instanceof GuardrailError && error.rule === 'ears_pattern_mismatch'
		);
	});

	test('unwanted_behavior: accepts IF ... THEN + SHALL', () => {
		assert.doesNotThrow(() => assertEarsStructure('unwanted_behavior', 'IF the upload fails, THEN THE SYSTEM SHALL retry once.'));
	});

	test('optional_feature: rejects SHALL without WHERE', () => {
		assert.throws(
			() => assertEarsStructure('optional_feature', 'THE SYSTEM SHALL enable the feature.'),
			(error) => error instanceof GuardrailError && error.rule === 'ears_pattern_mismatch'
		);
	});

	test('optional_feature: accepts WHERE + SHALL', () => {
		assert.doesNotThrow(() => assertEarsStructure('optional_feature', 'WHERE the beta flag is enabled, THE SYSTEM SHALL show the new UI.'));
	});

	test('complex_conditional: rejects when only one of WHEN/IF is present', () => {
		assert.throws(
			() => assertEarsStructure('complex_conditional', 'WHEN a request arrives, THE SYSTEM SHALL respond.'),
			(error) => error instanceof GuardrailError && error.rule === 'ears_pattern_mismatch'
		);
	});

	test('complex_conditional: accepts WHEN + IF + SHALL together', () => {
		assert.doesNotThrow(() =>
			assertEarsStructure('complex_conditional', 'WHEN a request arrives, IF the cache is cold, THE SYSTEM SHALL fetch from origin.')
		);
	});

	test('rejects an unrecognized ears_pattern', () => {
		assert.throws(
			() => assertEarsStructure('not_a_real_pattern', 'THE SYSTEM SHALL do the thing.'),
			(error) => error instanceof GuardrailError && error.rule === 'ears_unknown_pattern'
		);
	});
});

describe('assertNoUnquantifiedQualityAdjective (T6.1, Story 12.7)', () => {
	test('rejects "fast" with no accompanying number+unit', () => {
		assert.throws(
			() => assertNoUnquantifiedQualityAdjective('description', 'The endpoint must be fast.'),
			(error) => error instanceof GuardrailError && error.rule === 'unquantified_quality_adjective'
		);
	});

	test('accepts "responds within 200ms" (a quantified claim)', () => {
		assert.doesNotThrow(() => assertNoUnquantifiedQualityAdjective('description', 'The endpoint responds within 200ms.'));
	});

	test('accepts a quality adjective when quantified in the same field', () => {
		assert.doesNotThrow(() => assertNoUnquantifiedQualityAdjective('description', 'The endpoint must be fast, responding within 200ms.'));
	});

	test('every adjective in the fixed v1 vocabulary has a rejection case', () => {
		assert.equal(QUALITY_ADJECTIVES.length, 19, 'sanity-checks the fixed v1 vocabulary size stays as tasks.md specified');
		for (const adjective of QUALITY_ADJECTIVES) {
			const fieldText = `The system must be ${adjective}.`;
			assert.throws(
				() => assertNoUnquantifiedQualityAdjective('description', fieldText),
				(error) => error instanceof GuardrailError && error.rule === 'unquantified_quality_adjective',
				`expected "${adjective}" to be rejected without an adjacent number+unit`
			);
		}
	});
});

// =============================================================================
// T6.2 / T6.4 / T6.5: DB-backed guardrails
// =============================================================================

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
	const containerName = `relentless-guardrails-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

before(async () => {
	postgres = await startPostgresContainer();
	pool = new Pool({ connectionString: postgres.connectionString });
	const schemaSql = await readFile(schemaPath, 'utf8');
	await pool.query(schemaSql);
	repository = new SpecRepository(pool);
	projectId = await ensureProject(pool, `guardrails-test-${randomUUID().slice(0, 8)}`);
});

after(async () => {
	await pool?.end();
	await postgres?.stop();
});

describe('requireKnownActor (T6.2, Story 11.1, 11.4)', () => {
	test('rejects a missing actor before touching known_actors', async () => {
		await assert.rejects(
			() => requireKnownActor(pool, undefined),
			(error) => error instanceof GuardrailError && error.rule === 'missing_actor'
		);
	});

	test('rejects a blank actor', async () => {
		await assert.rejects(
			() => requireKnownActor(pool, '   '),
			(error) => error instanceof GuardrailError && error.rule === 'missing_actor'
		);
	});

	test('rejects an actor not present in known_actors', async () => {
		await assert.rejects(
			() => requireKnownActor(pool, `nobody-${randomUUID()}`),
			(error) => error instanceof GuardrailError && error.rule === 'unknown_actor'
		);
	});

	test('accepts an actor present in known_actors', async () => {
		const actor = `known-actor-${randomUUID().slice(0, 8)}`;
		await pool.query(`insert into spec_pipeline.known_actors (actor, source) values ($1, 'test')`, [actor]);
		const resolved = await requireKnownActor(pool, actor);
		assert.equal(resolved, actor);
	});
});

describe('syncKnownActorsFromAgentDefinitions (T6.4, Story 11.5)', () => {
	test('registers every spec-templates/agents/*.md file as a known actor', async () => {
		const actors = await syncKnownActorsFromAgentDefinitions(pool, agentsDirectory);
		assert.ok(actors.includes('code-implementer'), 'expected code-implementer.md to be scanned');
		assert.ok(actors.includes('design-drafter'), 'expected design-drafter.md to be scanned');

		const result = await pool.query(`select actor, source from spec_pipeline.known_actors where actor = 'code-implementer'`);
		assert.equal(result.rowCount, 1);
		assert.equal(result.rows[0].source, 'spec-templates/agents');
	});

	test('re-running the sync does not error and keeps the actor registered', async () => {
		const actors = await syncKnownActorsFromAgentDefinitions(pool, agentsDirectory);
		assert.ok(actors.includes('code-implementer'));
	});

	test('scanning a nonexistent directory returns an empty list rather than throwing', async () => {
		const actors = await syncKnownActorsFromAgentDefinitions(pool, join(agentsDirectory, 'does-not-exist'));
		assert.deepEqual(actors, []);
	});
});

describe('assertParentCheckboxRule (T6.5, Story 6.6)', () => {
	async function buildComponentWithParentChild() {
		const slug = `spec-${randomUUID().slice(0, 8)}`;
		const spec = await repository.createSpec({ projectId, slug, featureName: 'Checkbox Feature' }, TEST_AUDIT);

		const requirements = await repository.setRequirementsOverview(spec.id, { featureName: 'Checkbox Feature', overview: 'Overview.' }, TEST_AUDIT);
		const userStory = await repository.addUserStory(
			requirements.id,
			{ title: 'Story', role: 'user', capability: 'do a thing', benefit: 'get value', rationale: 'because' },
			TEST_AUDIT
		);
		await repository.addAcceptanceCriterion(
			userStory.id,
			{ earsPattern: 'ubiquitous', responseClause: 'the system shall do the thing', fullText: 'THE SYSTEM SHALL do the thing.' },
			TEST_AUDIT
		);
		await repository.finalizeStage(spec.id, 'requirements', undefined, TEST_AUDIT);
		await pool.query(`update spec_pipeline.spec_stages set status = 'approved' where spec_id = $1 and stage_name = 'requirements'`, [spec.id]);

		const design = await repository.setDesignOverview(spec.id, { featureName: 'Checkbox Feature', overview: 'Design overview.' }, TEST_AUDIT);
		await repository.setDesignArchitecture(spec.id, 'Design architecture.', TEST_AUDIT);
		await repository.addDesignComponent(design.id, { slug: 'alpha', displayName: 'Alpha' }, TEST_AUDIT);
		await repository.addDesignComponent(design.id, { slug: 'beta', displayName: 'Beta' }, TEST_AUDIT);
		await repository.finalizeStage(spec.id, 'design', undefined, TEST_AUDIT);
		await pool.query(`update spec_pipeline.spec_stages set status = 'approved' where spec_id = $1 and stage_name = 'design'`, [spec.id]);

		const parent = await repository.addTaskItem(
			spec.id,
			'alpha',
			{ title: 'Parent', description: 'Parent work.', traceability: 'Story 1', acceptanceCheck: 'Done.' },
			TEST_AUDIT
		);
		const child = await repository.addTaskItem(
			spec.id,
			'alpha',
			{
				parentItemId: parent.id,
				title: 'Child',
				description: 'Child work.',
				traceability: 'Story 1',
				acceptanceCheck: 'Done.'
			},
			TEST_AUDIT
		);
		const otherComponentItem = await repository.addTaskItem(
			spec.id,
			'beta',
			{ title: 'Other component work', description: 'Beta work.', traceability: 'Story 1', acceptanceCheck: 'Done.' },
			TEST_AUDIT
		);
		return { spec, parent, child, otherComponentItem };
	}

	test('rejects checking a parent while its child in the same component is unchecked', async () => {
		const { parent } = await buildComponentWithParentChild();
		await assert.rejects(
			() => assertParentCheckboxRule(pool, parent.id, true),
			(error) => error instanceof GuardrailError && error.rule === 'unchecked_child_task_item'
		);
	});

	test('allows checking a parent once every child in the same component is checked', async () => {
		const { parent, child } = await buildComponentWithParentChild();
		await repository.updateTaskItem(child.id, { isChecked: true }, TEST_AUDIT);
		await assert.doesNotReject(() => assertParentCheckboxRule(pool, parent.id, true));
	});

	test('is unaffected by an unchecked item in a different component (no parent_item_id link)', async () => {
		const { parent, child, otherComponentItem } = await buildComponentWithParentChild();
		await repository.updateTaskItem(child.id, { isChecked: true }, TEST_AUDIT);
		assert.equal(otherComponentItem.isChecked, false);
		// otherComponentItem is not a child of `parent` (different component, no
		// parent_item_id relationship) -- its unchecked state must not block.
		await assert.doesNotReject(() => assertParentCheckboxRule(pool, parent.id, true));
	});

	test('does not run the child-completeness query at all when isChecked is not true', async () => {
		const { parent } = await buildComponentWithParentChild();
		await assert.doesNotReject(() => assertParentCheckboxRule(pool, parent.id, false));
		await assert.doesNotReject(() => assertParentCheckboxRule(pool, parent.id, undefined));
	});
});
