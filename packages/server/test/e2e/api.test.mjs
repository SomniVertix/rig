import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

import { Pool } from 'pg';

import { buildComposition, createRpcFacade, createServerScheduler } from '../../dist/server/src/index.js';
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

async function collectUntil(iterator, stopKind) {
  const events = [];
  while (true) {
    const next = await iterator.next();
    assert.equal(next.done, false);
    events.push(next.value);
    if (next.value.kind === stopKind) {
      return events;
    }
  }
}

test('server API drives the default workflow through restart and live event streaming', async () => {
  const postgres = await startPostgresContainer();
  const workspaceRoot = repoRoot;
  const mirrorRoot = await mkdtemp(join(tmpdir(), 'relentless-mirror-'));

  const executor = new FakeAgentExecutor('pi');
  executor.setPlan('compile-requirements', { status: 'ok', text: 'requirements draft v1\n' });
  executor.setPlan('draft-design', { status: 'ok', text: 'design draft v1\n' });
  executor.setPlan('draft-tasks', { status: 'ok', text: 'tasks draft v1\n' });

  const config = {
    workspaceRoot,
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
  const scheduler = createServerScheduler(composition, { pollIntervalMs: 25 });
  const rpc = createRpcFacade(composition);

  try {
    const started = await rpc.runs.start({
      workflowId: 'relentless-default',
      inputs: {
        'decisions.md': {
          path: 'decisions.md',
          contents: 'decision 1\ndecision 2\n'
        }
      }
    });

    const stream1 = rpc.runs.events({ runId: started.id, sinceOffset: 0n });
    await scheduler.runOnce();
    const phase1Events = await collectUntil(stream1, 'human_pending');
    const phase1Kinds = phase1Events.map((event) => event.kind);
    assert.deepEqual(phase1Kinds, [
      'run_created',
      'node_enter',
      'node_exit',
      'node_enter',
      'human_pending'
    ]);

    const firstGate = await rpc.runs.get(started.id);
    assert.equal(firstGate.status, 'waiting_human');
    assert.equal(await rpc.artifacts.read(started.id, 'requirements.md').then((result) => result.contents), 'requirements draft v1\n');

    const lastSeenSeq = phase1Events.at(-1).seq;
    await composition.close();

    const restartedComposition = await buildComposition(config, { executor });
    const restartedScheduler = createServerScheduler(restartedComposition, { pollIntervalMs: 25 });
    const restartedRpc = createRpcFacade(restartedComposition);

    try {
      const parked = await restartedRpc.runs.get(started.id);
      assert.equal(parked.status, 'waiting_human');
      assert.equal(parked.currentNodeId, 'review-requirements');

      const stream2 = restartedRpc.runs.events({ runId: started.id, sinceOffset: lastSeenSeq });

      await restartedRpc.runs.signal({
        runId: started.id,
        signal: 'approve'
      });
      await restartedScheduler.runOnce();
      const phase2Events = await collectUntil(stream2, 'human_pending');
      assert.deepEqual(phase2Events.map((event) => event.kind), [
        'signal_received',
        'node_enter',
        'node_exit',
        'node_enter',
        'node_exit',
        'node_enter',
        'human_pending'
      ]);
      assert(phase2Events[0].seq > lastSeenSeq);

      await restartedRpc.runs.signal({
        runId: started.id,
        signal: 'approve'
      });
      await restartedScheduler.runOnce();
      const phase3Events = await collectUntil(stream2, 'human_pending');
      assert.deepEqual(phase3Events.map((event) => event.kind), [
        'signal_received',
        'node_enter',
        'node_exit',
        'node_enter',
        'node_exit',
        'node_enter',
        'human_pending'
      ]);

      await restartedRpc.runs.signal({
        runId: started.id,
        signal: 'approve'
      });
      await restartedScheduler.runOnce();
      const phase4Events = await collectUntil(stream2, 'run_ended');
      assert.deepEqual(phase4Events.map((event) => event.kind), [
        'signal_received',
        'node_enter',
        'node_exit',
        'node_enter',
        'node_exit',
        'node_enter',
        'node_exit',
        'run_ended'
      ]);

      const completed = await restartedRpc.runs.get(started.id);
      assert.equal(completed.status, 'succeeded');
      assert.equal(completed.endedAtNode, 'done');
      assert.equal(await restartedRpc.artifacts.read(started.id, 'tasks.md').then((result) => result.contents), 'tasks draft v1\n');
    } finally {
      await restartedComposition.close();
    }
  } finally {
    await composition.close().catch(() => {});
    await postgres.stop().catch(() => {});
  }
});
