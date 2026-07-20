// Integration tests for TrailRepository — the persistence query layer for the
// `discovery` schema (the trails domain; see spec-templates/spec/db/schema.sql
// PART 2 for the DDL and design model).
//
// Spins up a throwaway Postgres container (matching spec-repository.test.mjs)
// and applies the full clean-database bootstrap. The bootstrap currently lives
// at discovery.schema.mock.sql while under review; once it is renamed to
// schema.sql at cut-over, the fallback below keeps this suite working unchanged.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

import { Pool, ensureProject, TrailRepository, SpecRepositoryError } from '../dist/index.js';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

async function resolveSchemaPath() {
	const mockPath = join(repoRoot, 'spec-templates/spec/db/discovery.schema.mock.sql');
	try {
		await access(mockPath);
		return mockPath;
	} catch {
		return join(repoRoot, 'spec-templates/spec/db/schema.sql');
	}
}

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
	const containerName = `rig-trail-repo-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

// These tests exercise TrailRepository directly (bypassing the MCP tool layer's
// actor/known_actors guardrail), so any non-empty actor string works.
const TEST_AUDIT = { actor: 'test-actor', projectId: null };

before(async () => {
	postgres = await startPostgresContainer();
	pool = new Pool({ connectionString: postgres.connectionString });
	const schemaSql = await readFile(await resolveSchemaPath(), 'utf8');
	await pool.query(schemaSql);
	repository = new TrailRepository(pool);
	projectId = await ensureProject(pool, `trail-repository-test-${randomUUID().slice(0, 8)}`);
});

after(async () => {
	await pool?.end();
	await postgres?.stop();
});

async function createTestTrail(overrides = {}) {
	return await repository.createTrail(
		{
			projectId,
			slug: `trail-${randomUUID().slice(0, 8)}`,
			title: 'Test Trail',
			trailheadPrompt: 'Figure out the thing.',
			...overrides
		},
		TEST_AUDIT
	);
}

describe('createTrail / addWaypoint numbering', () => {
	test('creates a trail and numbers waypoints max+1 in insertion order', async () => {
		const trail = await createTestTrail({ destination: 'A settled design', notes: 'Consult the domain model.' });
		assert.equal(trail.status, 'active');
		assert.equal(trail.destination, 'A settled design');
		assert.equal(trail.outcomeKind, null);

		const first = await repository.addWaypoint(trail.id, { title: 'Scope', question: 'What is in scope?' }, TEST_AUDIT);
		const second = await repository.addWaypoint(trail.id, { title: 'Storage', question: 'Where does data live?' }, TEST_AUDIT);
		const third = await repository.addWaypoint(trail.id, { title: 'Auth', question: 'Who can call this?' }, TEST_AUDIT);
		assert.equal(first.waypointNumber, 1);
		assert.equal(second.waypointNumber, 2);
		assert.equal(third.waypointNumber, 3);
		assert.equal(first.status, 'marked');
	});

	test('addWaypoint with an inline resolution inserts directly at reached with reached_at set', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(
			trail.id,
			{
				title: 'Transport',
				question: 'HTTP or stdio?',
				approach: 'grilling',
				resolution: { resolution: 'HTTP only.', resolutionGist: 'HTTP transport', rationale: 'Matches deployment.', reachedIn: 'session-1' }
			},
			TEST_AUDIT
		);
		assert.equal(waypoint.status, 'reached');
		assert.equal(waypoint.resolution, 'HTTP only.');
		assert.equal(waypoint.resolutionGist, 'HTTP transport');
		assert.ok(waypoint.reachedAt !== null, 'reached_at must be stamped on inline resolution');
		assert.equal(waypoint.reachedIn, 'session-1');
	});

	test('rejects a sighted waypoint carrying a resolution (fog is by definition unresolved)', async () => {
		const trail = await createTestTrail();
		await assert.rejects(
			() =>
				repository.addWaypoint(
					trail.id,
					{
						title: 'Fog',
						question: 'Something about caching?',
						sighted: true,
						resolution: { resolution: 'Nope.', resolutionGist: 'Nope' }
					},
					TEST_AUDIT
				),
			(error) => error instanceof SpecRepositoryError && error.rule === 'sighted_cannot_resolve'
		);
	});
});

describe('claimWaypoint', () => {
	test('claims a marked waypoint atomically; a second live claim is rejected', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Claim me', question: 'Who claims this?' }, TEST_AUDIT);

		const claimed = await repository.claimWaypoint(waypoint.id, 'session-a', TEST_AUDIT);
		assert.equal(claimed.status, 'claimed');
		assert.equal(claimed.claimedBy, 'session-a');
		assert.ok(claimed.claimedAt !== null);

		await assert.rejects(
			() => repository.claimWaypoint(waypoint.id, 'session-b', TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'already_claimed'
		);
	});

	test('a stale claim (older than the TTL) is reclaimable in the same atomic UPDATE', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Stale claim', question: 'Reclaimable?' }, TEST_AUDIT);
		await repository.claimWaypoint(waypoint.id, 'session-a', TEST_AUDIT);

		// 0.0001 hours = 360ms: the live claim above goes stale almost immediately.
		const shortTtlRepository = new TrailRepository(pool, undefined, { claimTtlHours: 0.0001 });
		await new Promise((resolve) => setTimeout(resolve, 500));

		const reclaimed = await shortTtlRepository.claimWaypoint(waypoint.id, 'session-b', TEST_AUDIT);
		assert.equal(reclaimed.status, 'claimed');
		assert.equal(reclaimed.claimedBy, 'session-b');
	});

	test('releaseWaypoint returns a claimed waypoint to marked and clears the claim', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Release me', question: 'Released?' }, TEST_AUDIT);
		await repository.claimWaypoint(waypoint.id, 'session-a', TEST_AUDIT);

		const released = await repository.releaseWaypoint(waypoint.id, TEST_AUDIT);
		assert.equal(released.status, 'marked');
		assert.equal(released.claimedBy, null);
		assert.equal(released.claimedAt, null);
	});
});

describe('reach / bypass transitions', () => {
	test('reachWaypoint works straight from marked (the grilling rhythm — no claim step)', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Direct reach', question: 'Reachable from marked?' }, TEST_AUDIT);

		const reached = await repository.reachWaypoint(
			waypoint.id,
			{ resolution: 'Yes, straight from marked.', resolutionGist: 'Reached from marked', reachedIn: 'session-x' },
			TEST_AUDIT
		);
		assert.equal(reached.status, 'reached');
		assert.equal(reached.resolutionGist, 'Reached from marked');
		assert.ok(reached.reachedAt !== null);
	});

	test('bypassWaypoint works from sighted — fog can lie beyond the destination unsharpened', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Foggy', question: 'Something out there?', sighted: true }, TEST_AUDIT);
		assert.equal(waypoint.status, 'sighted');

		const bypassed = await repository.bypassWaypoint(waypoint.id, 'Beyond the destination.', TEST_AUDIT);
		assert.equal(bypassed.status, 'bypassed');
		assert.equal(bypassed.bypassReason, 'Beyond the destination.');
	});

	test('bypassWaypoint records previous_status so a later unbypass has history to restore from', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Marked', question: 'Marked?' }, TEST_AUDIT);
		const bypassed = await repository.bypassWaypoint(waypoint.id, 'Out of scope.', TEST_AUDIT);
		assert.equal(bypassed.previousStatus, 'marked');
	});
});

describe('unbypassWaypoint', () => {
	test('restores a waypoint bypassed from marked back to marked, clearing bypassReason and previousStatus', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Marked', question: 'Marked?' }, TEST_AUDIT);
		await repository.bypassWaypoint(waypoint.id, 'Mistaken bypass.', TEST_AUDIT);

		const { waypoint: restored, progressedDependents } = await repository.unbypassWaypoint(waypoint.id, TEST_AUDIT);
		assert.equal(restored.status, 'marked');
		assert.equal(restored.bypassReason, null);
		assert.equal(restored.previousStatus, null);
		assert.deepEqual(progressedDependents, []);
	});

	test('restores a waypoint bypassed from sighted back to sighted — fog can be unbypassed too', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Foggy', question: 'Something out there?', sighted: true }, TEST_AUDIT);
		await repository.bypassWaypoint(waypoint.id, 'Mistaken bypass.', TEST_AUDIT);

		const { waypoint: restored } = await repository.unbypassWaypoint(waypoint.id, TEST_AUDIT);
		assert.equal(restored.status, 'sighted');
		assert.equal(restored.bypassReason, null);
	});

	test('reports progressedDependents — a dependent that moved on while the blocker sat bypassed — without undoing it', async () => {
		const trail = await createTestTrail();
		const blocker = await repository.addWaypoint(trail.id, { title: 'Blocker', question: 'First?' }, TEST_AUDIT);
		const dependent = await repository.addWaypoint(trail.id, { title: 'Dependent', question: 'Second?' }, TEST_AUDIT);
		await repository.addWaypointDependency(blocker.id, dependent.id, TEST_AUDIT);
		await repository.bypassWaypoint(blocker.id, 'Mistaken bypass.', TEST_AUDIT);

		// reachWaypoint only checks the waypoint's own status (marked/claimed), not
		// frontier membership, so the dependent can progress independently of its
		// bypassed blocker — exactly the scenario unbypass_waypoint needs to surface.
		const reachedDependent = await repository.reachWaypoint(
			dependent.id,
			{ resolution: 'Decided anyway.', resolutionGist: 'Decided' },
			TEST_AUDIT
		);

		const { waypoint: restored, progressedDependents } = await repository.unbypassWaypoint(blocker.id, TEST_AUDIT);
		assert.equal(restored.status, 'marked');
		assert.deepEqual(progressedDependents.map((w) => w.id), [reachedDependent.id]);
		assert.equal(progressedDependents[0].status, 'reached', 'the undo reports the blast radius but never reverts it');
	});

	test('rejects unbypassing a waypoint that is not currently bypassed (not_bypassed)', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Never bypassed', question: 'Live?' }, TEST_AUDIT);

		await assert.rejects(
			() => repository.unbypassWaypoint(waypoint.id, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'not_bypassed'
		);
	});

	test('rejects unbypassing a legacy bypass with no recorded previous_status (no_previous_status)', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Legacy bypass', question: 'Pre-dates the column?' }, TEST_AUDIT);
		await repository.bypassWaypoint(waypoint.id, 'Out of scope.', TEST_AUDIT);

		// Simulates a waypoint bypassed before previous_status tracking existed
		// (two real examples of exactly this were found in production data).
		await pool.query(`update discovery.waypoints set previous_status = null where id = $1`, [waypoint.id]);

		await assert.rejects(
			() => repository.unbypassWaypoint(waypoint.id, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'no_previous_status'
		);
	});
});

describe('getFrontier', () => {
	test('excludes a blocked waypoint until its blocker is reached', async () => {
		const trail = await createTestTrail();
		const blocker = await repository.addWaypoint(trail.id, { title: 'Blocker', question: 'First?' }, TEST_AUDIT);
		const blocked = await repository.addWaypoint(trail.id, { title: 'Blocked', question: 'Second?' }, TEST_AUDIT);
		await repository.addWaypointDependency(blocker.id, blocked.id, TEST_AUDIT);

		let frontier = await repository.getFrontier(trail.id);
		assert.deepEqual(frontier.map((w) => w.id), [blocker.id], 'blocked waypoint stays off the frontier');

		await repository.reachWaypoint(blocker.id, { resolution: 'Done.', resolutionGist: 'Done' }, TEST_AUDIT);
		frontier = await repository.getFrontier(trail.id);
		assert.deepEqual(frontier.map((w) => w.id), [blocked.id], 'reached blocker unblocks its dependent');
	});

	test('a bypassed blocker also unblocks its dependents — a scope ruling never deadlocks the frontier', async () => {
		const trail = await createTestTrail();
		const blocker = await repository.addWaypoint(trail.id, { title: 'Bypassed blocker', question: 'First?' }, TEST_AUDIT);
		const blocked = await repository.addWaypoint(trail.id, { title: 'Waiting', question: 'Second?' }, TEST_AUDIT);
		await repository.addWaypointDependency(blocker.id, blocked.id, TEST_AUDIT);

		let frontier = await repository.getFrontier(trail.id);
		assert.deepEqual(frontier.map((w) => w.id), [blocker.id]);

		await repository.bypassWaypoint(blocker.id, 'Out of scope.', TEST_AUDIT);
		frontier = await repository.getFrontier(trail.id);
		assert.deepEqual(frontier.map((w) => w.id), [blocked.id], 'bypass unblocks just like reached');
	});
});

describe('addWaypointDependency', () => {
	test('rejects a cross-trail edge', async () => {
		const trailA = await createTestTrail();
		const trailB = await createTestTrail();
		const inA = await repository.addWaypoint(trailA.id, { title: 'In A', question: 'A?' }, TEST_AUDIT);
		const inB = await repository.addWaypoint(trailB.id, { title: 'In B', question: 'B?' }, TEST_AUDIT);

		await assert.rejects(
			() => repository.addWaypointDependency(inA.id, inB.id, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'cross_trail'
		);
	});

	test('rejects an edge that would close a cycle', async () => {
		const trail = await createTestTrail();
		const one = await repository.addWaypoint(trail.id, { title: 'One', question: '1?' }, TEST_AUDIT);
		const two = await repository.addWaypoint(trail.id, { title: 'Two', question: '2?' }, TEST_AUDIT);
		const three = await repository.addWaypoint(trail.id, { title: 'Three', question: '3?' }, TEST_AUDIT);

		await repository.addWaypointDependency(one.id, two.id, TEST_AUDIT);
		await repository.addWaypointDependency(two.id, three.id, TEST_AUDIT);

		await assert.rejects(
			() => repository.addWaypointDependency(three.id, one.id, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'cycle'
		);
	});
});

describe('completeTrail', () => {
	test("outcomeKind 'spec' creates the spec_pipeline.specs row and links outcome_spec_id in one transaction", async () => {
		const trail = await createTestTrail();
		const specSlug = `handed-off-${randomUUID().slice(0, 8)}`;

		const { trail: completed, spec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'spec', outcomeSummary: 'Handed off.', spec: { slug: specSlug, featureName: 'Handed-Off Feature' } },
			TEST_AUDIT
		);
		assert.equal(completed.status, 'complete');
		assert.equal(completed.outcomeKind, 'spec');
		assert.ok(spec !== null);
		assert.equal(spec.slug, specSlug);
		assert.equal(completed.outcomeSpecId, spec.id);

		const specRows = await pool.query(`select id, slug from spec_pipeline.specs where id = $1`, [spec.id]);
		assert.equal(specRows.rowCount, 1);
		assert.equal(specRows.rows[0].slug, specSlug);

		const bySpec = await repository.getTrailBySpec(spec.id);
		assert.ok(bySpec !== null, 'getTrailBySpec resolves the trail through outcome_spec_id');
		assert.equal(bySpec.id, trail.id);
	});

	test("outcomeKind 'spec' without the spec input is rejected with spec_input_required", async () => {
		const trail = await createTestTrail();
		await assert.rejects(
			() => repository.completeTrail(trail.id, { outcomeKind: 'spec' }, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'spec_input_required'
		);
	});

	test("outcomeKind 'decision' completes without any spec involvement", async () => {
		const trail = await createTestTrail();
		const { trail: completed, spec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'decision', outcomeSummary: 'Decided; nothing to build.' },
			TEST_AUDIT
		);
		assert.equal(completed.status, 'complete');
		assert.equal(completed.outcomeKind, 'decision');
		assert.equal(completed.outcomeSpecId, null);
		assert.equal(spec, null);
	});
});

describe('completeTrail re-run after reopenTrail', () => {
	test('decision -> reopen -> decision overwrites outcome_kind/outcome_summary in place', async () => {
		const trail = await createTestTrail();
		await repository.completeTrail(trail.id, { outcomeKind: 'decision', outcomeSummary: 'First pass.' }, TEST_AUDIT);

		const { trail: reopened } = await repository.reopenTrail(trail.id, TEST_AUDIT);
		assert.equal(reopened.status, 'active');
		assert.equal(reopened.outcomeKind, 'decision', 'reopen leaves the prior outcome_kind in place');
		assert.equal(reopened.outcomeSummary, null, 'reopen clears the stale outcome_summary');

		const { trail: recompleted, spec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'decision', outcomeSummary: 'Corrected decision.' },
			TEST_AUDIT
		);
		assert.equal(recompleted.status, 'complete');
		assert.equal(recompleted.outcomeKind, 'decision');
		assert.equal(recompleted.outcomeSummary, 'Corrected decision.');
		assert.equal(recompleted.outcomeSpecId, null);
		assert.equal(spec, null);
	});

	test('spec -> reopen -> a different spec supersedes the old outcome_spec_id without tripping trails_one_per_spec', async () => {
		const trail = await createTestTrail();
		const firstSlug = `first-spec-${randomUUID().slice(0, 8)}`;
		const { spec: firstSpec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'spec', spec: { slug: firstSlug, featureName: 'First Feature' } },
			TEST_AUDIT
		);

		const { trail: reopened } = await repository.reopenTrail(trail.id, TEST_AUDIT);
		assert.equal(reopened.outcomeSpecId, firstSpec.id, 'reopen leaves the prior spec link in place');

		const secondSlug = `second-spec-${randomUUID().slice(0, 8)}`;
		const { trail: recompleted, spec: secondSpec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'spec', spec: { slug: secondSlug, featureName: 'Second Feature' } },
			TEST_AUDIT
		);
		assert.equal(recompleted.status, 'complete');
		assert.equal(recompleted.outcomeSpecId, secondSpec.id);
		assert.notEqual(secondSpec.id, firstSpec.id);

		const bySpec = await repository.getTrailBySpec(secondSpec.id);
		assert.ok(bySpec !== null);
		assert.equal(bySpec.id, trail.id);

		const byOldSpec = await repository.getTrailBySpec(firstSpec.id);
		assert.equal(byOldSpec, null, 'the superseded spec is no longer linked from any trail');

		const oldSpecRows = await pool.query(`select id from spec_pipeline.specs where id = $1`, [firstSpec.id]);
		assert.equal(oldSpecRows.rowCount, 1, 'the superseded spec row itself is untouched, just unlinked');
	});

	test('spec -> reopen -> the same spec slug re-links to the existing spec instead of duplicating it', async () => {
		const trail = await createTestTrail();
		const slug = `same-spec-${randomUUID().slice(0, 8)}`;
		const { spec: firstSpec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'spec', spec: { slug, featureName: 'Feature' } },
			TEST_AUDIT
		);

		await repository.reopenTrail(trail.id, TEST_AUDIT);

		const { trail: recompleted, spec: secondSpec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'spec', spec: { slug, featureName: 'Feature' } },
			TEST_AUDIT
		);
		assert.equal(recompleted.status, 'complete');
		assert.equal(recompleted.outcomeSpecId, firstSpec.id, 're-completing with the already-linked slug reuses the same spec row');
		assert.equal(secondSpec.id, firstSpec.id);

		const specRows = await pool.query(`select id from spec_pipeline.specs where slug = $1`, [slug]);
		assert.equal(specRows.rowCount, 1, 'no duplicate spec row was created for the matching slug');
	});

	test('spec -> reopen -> re-completing with the same slug reports the reused spec\'s real derived progress (spec-stage-tracking-fixes W1)', async () => {
		const trail = await createTestTrail();
		const slug = `same-spec-progress-${randomUUID().slice(0, 8)}`;
		const { spec: firstSpec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'spec', spec: { slug, featureName: 'Feature' } },
			TEST_AUDIT
		);
		assert.equal(firstSpec.currentStage, 'requirements');

		// The spec progresses past requirements while the trail sits completed -- this is
		// exactly the scenario the dead `specs.current_stage` column got wrong (it would
		// still report 'requirements' here).
		await pool.query(`update spec_pipeline.spec_stages set status = 'approved' where spec_id = $1 and stage_name = 'requirements'`, [firstSpec.id]);

		await repository.reopenTrail(trail.id, TEST_AUDIT);

		const { spec: secondSpec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'spec', spec: { slug, featureName: 'Feature' } },
			TEST_AUDIT
		);
		assert.equal(secondSpec.id, firstSpec.id);
		assert.equal(secondSpec.currentStage, 'design', 'reused spec reports its live-derived stage, not a stale stored column');
	});

	test('spec -> reopen -> decision clears outcome_spec_id back to null', async () => {
		const trail = await createTestTrail();
		const specSlug = `to-be-cleared-${randomUUID().slice(0, 8)}`;
		const { spec: firstSpec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'spec', spec: { slug: specSlug, featureName: 'Feature' } },
			TEST_AUDIT
		);

		await repository.reopenTrail(trail.id, TEST_AUDIT);

		const { trail: recompleted, spec } = await repository.completeTrail(trail.id, { outcomeKind: 'decision' }, TEST_AUDIT);
		assert.equal(recompleted.outcomeKind, 'decision');
		assert.equal(recompleted.outcomeSpecId, null);
		assert.equal(spec, null);

		const byOldSpec = await repository.getTrailBySpec(firstSpec.id);
		assert.equal(byOldSpec, null, 'the old spec link is cleared, not left dangling on the trail');
	});

	test('decision -> reopen -> spec assigns a fresh outcome_spec_id where none existed before', async () => {
		const trail = await createTestTrail();
		await repository.completeTrail(trail.id, { outcomeKind: 'decision', outcomeSummary: 'Nothing to build yet.' }, TEST_AUDIT);
		await repository.reopenTrail(trail.id, TEST_AUDIT);

		const specSlug = `later-spec-${randomUUID().slice(0, 8)}`;
		const { trail: recompleted, spec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'spec', spec: { slug: specSlug, featureName: 'Feature' } },
			TEST_AUDIT
		);
		assert.equal(recompleted.outcomeKind, 'spec');
		assert.ok(spec !== null);
		assert.equal(recompleted.outcomeSpecId, spec.id);
	});
});

describe('reopenTrail', () => {
	test('restores a complete trail to active, clears outcomeSummary, and leaves outcomeKind in place', async () => {
		const trail = await createTestTrail();
		await repository.completeTrail(trail.id, { outcomeKind: 'decision', outcomeSummary: 'Decided.' }, TEST_AUDIT);

		const { trail: reopened, specStatus } = await repository.reopenTrail(trail.id, TEST_AUDIT);
		assert.equal(reopened.status, 'active');
		assert.equal(reopened.outcomeKind, 'decision');
		assert.equal(reopened.outcomeSummary, null);
		assert.equal(specStatus, null, 'no spec was linked, so there is nothing to report');
	});

	test('restores an abandoned trail to active (abandon_trail is covered by the same undo path)', async () => {
		const trail = await createTestTrail();
		await repository.abandonTrail(trail.id, 'Dropped for now.', TEST_AUDIT);

		const { trail: reopened } = await repository.reopenTrail(trail.id, TEST_AUDIT);
		assert.equal(reopened.status, 'active');
		assert.equal(reopened.outcomeSummary, null);
	});

	test('rejects reopening a trail that is already active (not_reopenable)', async () => {
		const trail = await createTestTrail();
		await assert.rejects(
			() => repository.reopenTrail(trail.id, TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'not_reopenable'
		);
	});

	test('rejects reopening a trail that does not exist (not_found)', async () => {
		await assert.rejects(
			() => repository.reopenTrail(randomUUID(), TEST_AUDIT),
			(error) => error instanceof SpecRepositoryError && error.rule === 'not_found'
		);
	});

	test('reports the linked spec\'s current stage and per-stage status as specStatus, without touching the spec pipeline', async () => {
		const trail = await createTestTrail();
		const specSlug = `reopen-spec-status-${randomUUID().slice(0, 8)}`;
		const { spec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'spec', spec: { slug: specSlug, featureName: 'Feature' } },
			TEST_AUDIT
		);

		const { specStatus } = await repository.reopenTrail(trail.id, TEST_AUDIT);
		assert.ok(specStatus !== null);
		assert.equal(specStatus.specId, spec.id);
		assert.equal(specStatus.currentStage, 'requirements', 'a freshly created spec starts on the requirements stage');
		assert.deepEqual(
			specStatus.stages.map((stage) => stage.stageName),
			['requirements', 'design', 'tasks'],
			// `stage_name` is a Postgres ENUM (spec_pipeline.spec_stage_name); `order by
			// stage_name asc` sorts by the enum's declared label order, not lexically.
			'the three auto-seeded stage rows, in the enum\'s declared pipeline order'
		);
		for (const stage of specStatus.stages) {
			assert.equal(stage.status, 'not_started', 'reopening never mutates the spec pipeline');
		}

		// specs.current_stage no longer exists (spec-stage-tracking-fixes W2) -- prove the
		// spec pipeline is untouched via the stored spec_stages rows instead: exactly the two
		// seeded rows (requirements/design), both still not_started.
		const stageRows = await pool.query(`select stage_name, status from spec_pipeline.spec_stages where spec_id = $1 order by stage_name asc`, [
			spec.id
		]);
		assert.deepEqual(
			stageRows.rows.map((row) => [row.stage_name, row.status]),
			[
				['requirements', 'not_started'],
				['design', 'not_started']
			],
			'the spec itself is untouched by the reopen'
		);
	});

	test('specStatus reflects the spec\'s real derived progress, including the tasks stage\'s dead spec_stages row (spec-stage-tracking-fixes W1)', async () => {
		const trail = await createTestTrail();
		const specSlug = `reopen-progress-${randomUUID().slice(0, 8)}`;
		const { spec } = await repository.completeTrail(
			trail.id,
			{ outcomeKind: 'spec', spec: { slug: specSlug, featureName: 'Feature' } },
			TEST_AUDIT
		);

		// Advance requirements to approved directly (bypassing the full finalize/approve
		// flow, which isn't this test's concern) -- proving specStatus derives 'design' as
		// currentStage rather than trusting the stored (never-updated) current_stage
		// column, which would still say 'requirements' here.
		await pool.query(`update spec_pipeline.spec_stages set status = 'approved' where spec_id = $1 and stage_name = 'requirements'`, [spec.id]);

		const { specStatus } = await repository.reopenTrail(trail.id, TEST_AUDIT);
		assert.ok(specStatus !== null);
		assert.equal(specStatus.currentStage, 'design');

		const tasksStage = specStatus.stages.find((stage) => stage.stageName === 'tasks');
		assert.equal(tasksStage.status, 'not_started', 'no design components exist yet, so the tasks stage has nothing to derive from');
	});
});

describe('audit log', () => {
	test('trail and waypoint writes each insert a schema-qualified audit_log row', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Audited', question: 'Audited?' }, TEST_AUDIT);

		const trailAudit = await pool.query(
			`select * from spec_pipeline.audit_log where table_name = 'discovery.trails' and row_id = $1`,
			[trail.id]
		);
		assert.equal(trailAudit.rowCount, 1);
		assert.equal(trailAudit.rows[0].actor, TEST_AUDIT.actor);
		assert.equal(trailAudit.rows[0].action, 'insert');

		const waypointAudit = await pool.query(
			`select * from spec_pipeline.audit_log where table_name = 'discovery.waypoints' and row_id = $1`,
			[waypoint.id]
		);
		assert.equal(waypointAudit.rowCount, 1);
		assert.equal(waypointAudit.rows[0].actor, TEST_AUDIT.actor);
	});
});
