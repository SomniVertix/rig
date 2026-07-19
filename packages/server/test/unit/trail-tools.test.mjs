// Unit tests for the two undo tools' MCP-layer wiring (unbypass_waypoint,
// reopen_trail): registerTrailTools' own actor/reason guardrails, exercised
// through the real tool handlers rather than the pure guardrails functions
// guardrails.test.mjs already covers in isolation. Neither new tool threads
// `reason` down to TrailRepository (it's validated-then-discarded, per this
// trail's locked scope), so this is the only layer where "reason is required"
// is actually observable end to end.
//
// Spins up a throwaway Postgres container (matching guardrails.test.mjs /
// trail-repository.test.mjs) and calls `registerTrailTools` against a minimal
// fake `McpServer` that just captures each registered tool's handler, so the
// exact handler wired into the real server is what gets invoked here.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

import { Pool } from 'pg';

import { registerTrailTools } from '../../dist/server/src/mcp/tools/index.js';
import { ensureProject, TrailRepository } from '../../../persistence/dist/index.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const schemaPath = join(repoRoot, 'spec-templates/spec/db/schema.sql');

const TEST_AUDIT = { actor: 'test-actor', projectId: null };
const KNOWN_ACTOR = 'test-actor';

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
	const containerName = `rig-trail-tools-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
 * `registerTrailTools` wired up without going through the MCP protocol. */
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

let postgres;
let pool;
let repository;
let projectId;
let handlers;

before(async () => {
	postgres = await startPostgresContainer();
	pool = new Pool({ connectionString: postgres.connectionString });
	const schemaSql = await readFile(schemaPath, 'utf8');
	await pool.query(schemaSql);
	await pool.query(`insert into spec_pipeline.known_actors (actor, source) values ($1, 'test')`, [KNOWN_ACTOR]);

	repository = new TrailRepository(pool);
	projectId = await ensureProject(pool, `trail-tools-test-${randomUUID().slice(0, 8)}`);

	const fakeServer = createFakeServer();
	registerTrailTools(fakeServer, { pool, projectId, projectSlug: 'test-project' });
	handlers = fakeServer.handlers;
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

describe('unbypass_waypoint', () => {
	test('rejects a blank reason before ever touching the waypoint (empty_field)', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Bypassed', question: 'Q?' }, TEST_AUDIT);
		await repository.bypassWaypoint(waypoint.id, 'Out of scope.', TEST_AUDIT);

		const result = await handlers.get('unbypass_waypoint')({ actor: KNOWN_ACTOR, waypointId: waypoint.id, reason: '   ' });
		assert.equal(result.isError, true);
		assert.equal(parseResult(result).error, 'empty_field');

		const stillBypassed = await pool.query(`select status from discovery.waypoints where id = $1`, [waypoint.id]);
		assert.equal(stillBypassed.rows[0].status, 'bypassed', 'a rejected undo must not have touched the row');
	});

	test('rejects an unregistered actor before checking reason (unknown_actor)', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Bypassed', question: 'Q?' }, TEST_AUDIT);
		await repository.bypassWaypoint(waypoint.id, 'Out of scope.', TEST_AUDIT);

		const result = await handlers.get('unbypass_waypoint')({
			actor: `stranger-${randomUUID()}`,
			waypointId: waypoint.id,
			reason: 'Mistaken bypass.'
		});
		assert.equal(result.isError, true);
		assert.equal(parseResult(result).error, 'unknown_actor');
	});

	test('a known actor with a non-blank reason successfully restores the waypoint', async () => {
		const trail = await createTestTrail();
		const waypoint = await repository.addWaypoint(trail.id, { title: 'Bypassed', question: 'Q?' }, TEST_AUDIT);
		await repository.bypassWaypoint(waypoint.id, 'Out of scope.', TEST_AUDIT);

		const result = await handlers.get('unbypass_waypoint')({ actor: KNOWN_ACTOR, waypointId: waypoint.id, reason: 'Mistaken bypass.' });
		assert.equal(result.isError, undefined);
		const body = parseResult(result);
		assert.equal(body.waypoint.status, 'marked');
		assert.deepEqual(body.progressedDependents, []);
	});
});

describe('reopen_trail', () => {
	test('rejects a blank reason before ever touching the trail (empty_field)', async () => {
		const trail = await createTestTrail();
		await repository.completeTrail(trail.id, { outcomeKind: 'decision', outcomeSummary: 'Decided.' }, TEST_AUDIT);

		const result = await handlers.get('reopen_trail')({ actor: KNOWN_ACTOR, trailId: trail.id, reason: '' });
		assert.equal(result.isError, true);
		assert.equal(parseResult(result).error, 'empty_field');

		const stillComplete = await pool.query(`select status from discovery.trails where id = $1`, [trail.id]);
		assert.equal(stillComplete.rows[0].status, 'complete', 'a rejected undo must not have touched the row');
	});

	test('rejects an unregistered actor before checking reason (unknown_actor)', async () => {
		const trail = await createTestTrail();
		await repository.completeTrail(trail.id, { outcomeKind: 'decision', outcomeSummary: 'Decided.' }, TEST_AUDIT);

		const result = await handlers.get('reopen_trail')({ actor: `stranger-${randomUUID()}`, trailId: trail.id, reason: 'Premature.' });
		assert.equal(result.isError, true);
		assert.equal(parseResult(result).error, 'unknown_actor');
	});

	test('a known actor with a non-blank reason successfully reopens the trail', async () => {
		const trail = await createTestTrail();
		await repository.completeTrail(trail.id, { outcomeKind: 'decision', outcomeSummary: 'Decided.' }, TEST_AUDIT);

		const result = await handlers.get('reopen_trail')({ actor: KNOWN_ACTOR, trailId: trail.id, reason: 'Premature.' });
		assert.equal(result.isError, undefined);
		const body = parseResult(result);
		assert.equal(body.trail.status, 'active');
		assert.equal(body.trail.outcomeKind, 'decision');
		assert.equal(body.specStatus, null);
	});
});
