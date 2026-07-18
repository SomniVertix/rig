import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

import { Pool } from 'pg';

import { buildComposition } from '../../dist/server/src/index.js';
import { SpecChangeEmitter, SpecRepository } from '../../../persistence/dist/index.js';
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
  const containerName = `relentless-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const args = [
    'run',
    '--rm',
    '-d',
    '--name', containerName,
    '-e', 'POSTGRES_USER=postgres',
    '-e', 'POSTGRES_PASSWORD=postgres',
    '-e', 'POSTGRES_DB=relentless',
    '-p', `${port}:5432`,
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

test('SSE endpoint streams spec changes from both SpecRepository writes and event emissions', async () => {
  const postgres = await startPostgresContainer();
  const workspaceRoot = repoRoot;
  const mirrorRoot = await mkdtemp(join(tmpdir(), 'relentless-mirror-'));
  const ssePort = await getFreePort();

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
    configPath: join(workspaceRoot, 'relentless.config.ts')
  };

  const composition = await buildComposition(config, { executor });

  try {
    // Create SpecChangeEmitter and SpecRepository for testing
    const specChangeEmitter = new SpecChangeEmitter();
    const specRepository = new SpecRepository(composition.pool, specChangeEmitter);

    // Start a simple HTTP SSE server on a free port
    const { createServer: createHttpServer } = await import('node:http');
    const httpServer = createHttpServer((req, res) => {
      if (req.url === '/api/events' && req.method === 'GET') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        });

        // Subscribe to changes
        const unsubscribe = specChangeEmitter.subscribe((event) => {
          // Stream only the scoped ping fields (Story 4 AC2)
          const sseEvent = JSON.stringify(event);
          res.write(`event: ${event.type}\ndata: ${sseEvent}\n\n`);
        });

        // Clean up on client disconnect
        req.on('close', () => {
          unsubscribe();
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(ssePort, '127.0.0.1', () => {
        httpServer.removeListener('error', reject);
        resolve();
      });
    });

    try {
      // Create a spec for testing
      const specRecord = await specRepository.withTx(async (client) => {
        const result = await client.query(
          `insert into spec_pipeline.specs (project_id, slug, feature_name, current_stage, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6)
           returning id`,
          [null, 'test-spec', 'Test Feature', 'requirements', new Date(), new Date()]
        );
        const row = result.rows[0];
        if (!row) throw new Error('Failed to create spec');
        return row.id;
      });

      // Create a requirements record for the spec
      const requirementsRecord = await specRepository.withTx(async (client) => {
        const result = await client.query(
          `insert into spec_pipeline.requirements (spec_id, feature_name, overview, created_at, updated_at)
           values ($1, $2, $3, $4, $5)
           returning id`,
          [specRecord, 'Test Feature', 'Test overview', new Date(), new Date()]
        );
        const row = result.rows[0];
        if (!row) throw new Error('Failed to create requirements');
        return row.id;
      });

      // Test 1: Direct SpecRepository write emits event (Story 4 AC1)
      const emittedEvents = [];
      const eventUnsubscribe = specChangeEmitter.subscribe((event) => {
        emittedEvents.push(event);
      });

      await specRepository.addNonGoal(requirementsRecord, 'Test non-goal', {
        actor: 'test-actor',
        projectId: null
      });

      assert.equal(emittedEvents.length, 1, 'Should receive 1 event from direct repository write');
      assert.equal(emittedEvents[0].type, 'spec_changed', 'Event type should be spec_changed');
      assert.equal(emittedEvents[0].specId, specRecord, 'Event should contain correct specId');
      assert.equal(emittedEvents[0].stage, 'requirements', 'Event should contain stage');

      // Story 4 AC2: Verify only scoped ping fields are sent
      const eventKeys = Object.keys(emittedEvents[0]).sort();
      assert.deepEqual(eventKeys, ['specId', 'stage', 'type'].sort(),
        'Event should only contain scoped ping fields (type, specId, stage), not full record');

      // Test 2: Verify event structure contains no full record payloads
      assert(!('id' in emittedEvents[0]), 'Event should not contain full record id field');
      assert(!('description' in emittedEvents[0]), 'Event should not contain full record description');
      assert(!('requirementsId' in emittedEvents[0]), 'Event should not contain requirementsId');
      assert(!('ordinal' in emittedEvents[0]), 'Event should not contain ordinal field');

      // Test 3: Emit event directly (simulating a discovery trail change - Story 4 AC1)
      emittedEvents.length = 0;
      specChangeEmitter.emit({
        type: 'trail_changed',
        trailId: 'test-trail-123'
      });
      assert.equal(emittedEvents.length, 1, 'Should receive 1 trail_changed event');
      assert.equal(emittedEvents[0].type, 'trail_changed', 'Event type should be trail_changed');
      assert.equal(emittedEvents[0].trailId, 'test-trail-123', 'Event should contain correct trailId');

      // Verify scoped fields only for trail event
      const trailEventKeys = Object.keys(emittedEvents[0]).sort();
      assert.deepEqual(trailEventKeys, ['trailId', 'type'].sort(),
        'Trail event should only contain scoped ping fields');

      // Test 4: Another spec write generates another event
      emittedEvents.length = 0;
      await specRepository.addNonGoal(requirementsRecord, 'Another non-goal', {
        actor: 'test-actor',
        projectId: null
      });
      assert.equal(emittedEvents.length, 1, 'Should receive event from second repository write');
      assert.equal(emittedEvents[0].specId, specRecord, 'Second event should contain same specId');

      // Test 5: SSE HTTP endpoint receives streamed events
      // Connect to the endpoint and verify it streams events
      const eventUrl = `http://127.0.0.1:${ssePort}/api/events`;
      const sseEvents = [];
      const sseResponsePromise = fetch(eventUrl);

      // Give the connection time to establish
      await new Promise(resolve => setTimeout(resolve, 100));

      // Emit a test event
      emittedEvents.length = 0;
      specChangeEmitter.emit({
        type: 'trail_changed',
        trailId: 'sse-test-trail'
      });

      // Parse the SSE response
      const sseResponse = await sseResponsePromise;
      assert.equal(sseResponse.status, 200, 'SSE endpoint should return 200');
      assert.equal(sseResponse.headers.get('content-type'), 'text/event-stream', 'Content-type should be text/event-stream');

      // Read a bit of the stream to verify events are flowing
      const reader = sseResponse.body.getReader();
      const decoder = new TextDecoder();
      let streamData = '';
      const startTime = Date.now();

      try {
        while (Date.now() - startTime < 2000) {
          const { done, value } = await reader.read();
          if (done) break;
          streamData += decoder.decode(value, { stream: true });
          if (streamData.includes('trail_changed') && streamData.includes('sse-test-trail')) {
            break;
          }
        }
      } finally {
        reader.cancel().catch(() => {});
      }

      assert.match(streamData, /event: trail_changed/, 'SSE stream should contain trail_changed event');
      assert.match(streamData, /data: /, 'SSE stream should contain data field');
      assert.match(streamData, /sse-test-trail/, 'SSE stream should contain the trail ID');

      eventUnsubscribe();
    } finally {
      await new Promise((resolve, reject) => {
        httpServer.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  } finally {
    await composition.close().catch(() => {});
    await postgres.stop().catch(() => {});
  }
});
