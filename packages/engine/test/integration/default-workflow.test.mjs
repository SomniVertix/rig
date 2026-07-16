import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { createFileSystemLibraryResolver } from '../../../library/dist/index.js';
import { createInterpreter } from '../../dist/index.js';
import {
  FakeAgentExecutor,
  FakeArtifactStore,
  FakeClock,
  FakeRunStore,
  buildRelentlessDefaultWorkflowShape
} from '../../../test-support/dist/index.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const bundledRoot = join(repoRoot, 'packages', 'library', 'bundled', 'global');
const libraryResolver = createFileSystemLibraryResolver({
  projectRoot: repoRoot,
  globalRoot: bundledRoot
});

function countNodeEnters(history, nodeId) {
  return history.filter((event) => event.type === 'node_enter' && event.payload.nodeId === nodeId).length;
}

test('default workflow reaches done through a deny loop and writes artifacts', async () => {
  const workflow = buildRelentlessDefaultWorkflowShape();
  const runStore = new FakeRunStore();
  const artifactStore = new FakeArtifactStore();
  const clock = new FakeClock(new Date('2026-01-01T00:00:00.000Z'));
  const executor = new FakeAgentExecutor('pi');

  executor.setPlan('compile-requirements', {
    status: 'ok',
    text: 'requirements draft v1\n'
  });
  executor.setPlan('draft-design', {
    status: 'ok',
    text: 'design draft v1\n'
  });
  executor.setPlan('draft-tasks', {
    status: 'ok',
    text: 'tasks draft v1\n'
  });

  const engine = createInterpreter({
    runStore,
    artifactStore,
    libraryResolver,
    executor,
    clock,
    maxNodeExecutions: 50,
    scriptHandlers: {
      noop: async () => ({ status: 'ok' })
    }
  });

  const initialState = await runStore.create({
    id: 'run-default',
    workflowId: workflow.id,
    snapshotHash: 'snapshot-1',
    currentNodeId: workflow.entry,
    workspacePath: '/tmp/relentless-default-workflow'
  });

  let action = await engine.interpret(workflow, initialState);
  assert.equal(action.kind, 'suspended');
  assert.equal(action.runState.currentNodeId, 'review-requirements');
  assert.equal(await artifactStore.read('run-default', 'requirements.md'), 'requirements draft v1\n');
  assert.equal(countNodeEnters(action.runState.history, 'compile-requirements'), 1);

  action = await engine.resumeHuman(workflow, action.runState, { signal: 'deny' });
  assert.equal(action.kind, 'suspended');
  assert.equal(action.runState.currentNodeId, 'review-requirements');
  assert.equal(countNodeEnters(action.runState.history, 'compile-requirements'), 2);

  action = await engine.resumeHuman(workflow, action.runState, { signal: 'approve' });
  assert.equal(action.kind, 'suspended');
  assert.equal(action.runState.currentNodeId, 'review-design');
  assert.equal(await artifactStore.read('run-default', 'design.md'), 'design draft v1\n');

  action = await engine.resumeHuman(workflow, action.runState, { signal: 'approve' });
  assert.equal(action.kind, 'suspended');
  assert.equal(action.runState.currentNodeId, 'review-tasks');
  assert.equal(await artifactStore.read('run-default', 'tasks.md'), 'tasks draft v1\n');

  action = await engine.resumeHuman(workflow, action.runState, { signal: 'approve' });
  assert.equal(action.kind, 'succeeded');
  assert.equal(action.runState.status, 'succeeded');
  assert.equal(action.runState.endedAtNode, 'done');
  assert.equal(countNodeEnters(action.runState.history, 'compile-requirements'), 2);
});

test('agent failure without onError ends the run failed with last-error context', async () => {
  const workflow = {
    id: 'failure-workflow',
    name: 'Failure Workflow',
    entry: 'failing-agent',
    inputs: [],
    artifacts: ['output.md'],
    nodes: [
      {
        kind: 'agent',
        id: 'failing-agent',
        reads: [],
        writes: ['output.md'],
        prompt: 'Prompt'
      },
      {
        kind: 'script',
        id: 'done',
        reads: ['output.md'],
        writes: [],
        handler: './scripts/done.ts#run'
      }
    ],
    edges: [{ from: 'failing-agent', to: 'done' }]
  };

  const runStore = new FakeRunStore();
  const artifactStore = new FakeArtifactStore();
  const executor = new FakeAgentExecutor('pi');
  executor.setPlan('failing-agent', {
    status: 'failed',
    error: new Error('boom')
  });

  const engine = createInterpreter({
    runStore,
    artifactStore,
    executor,
    clock: new FakeClock(),
    maxNodeExecutions: 10
  });

  const initialState = await runStore.create({
    id: 'run-failure',
    workflowId: workflow.id,
    snapshotHash: 'snapshot-2',
    currentNodeId: workflow.entry,
    workspacePath: '/tmp/relentless-failure-workflow'
  });

  const action = await engine.interpret(workflow, initialState);
  assert.equal(action.kind, 'failed');
  assert.equal(action.runState.status, 'failed');
  assert.equal(action.runState.endedAtNode, 'failing-agent');
  assert.equal(action.runState.context._lastError.nodeId, 'failing-agent');
  assert.match(String(action.runState.context._lastError.reason), /boom/);
});
