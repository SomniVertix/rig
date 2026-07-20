import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';

import { Pool } from 'pg';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { buildComposition } from '../../dist/server/src/index.js';
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

// Helper to parse tool response content
function parseToolResponse(result) {
  if (!result || !result.content || !Array.isArray(result.content) || result.content.length === 0) {
    throw new Error(`Invalid tool response format: ${JSON.stringify(result)}`);
  }
  const content = result.content[0];
  if (content.type !== 'text') {
    throw new Error(`Expected text content, got ${content.type}`);
  }
  try {
    const parsed = JSON.parse(content.text);
    if (parsed.error) {
      const err = new Error(parsed.message || parsed.error);
      err.rule = parsed.error;
      throw err;
    }
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error('Failed to parse response text:', content.text);
      throw error;
    }
    throw error;
  }
}

// Approve/deny is a human-only action (T6.6) -- deliberately not exposed by any
// MCP tool -- so tests emulate the human's approval directly in the database.
async function humanApprove(connectionString, specId, stage) {
  const pool = new Pool({ connectionString });
  try {
    if (stage === 'tasks') {
      await pool.query(`update spec_pipeline.tasks_docs set status = 'approved' where spec_id = $1`, [specId]);
    }
    await pool.query(`update spec_pipeline.spec_stages set status = 'approved' where spec_id = $1 and stage_name = $2`, [specId, stage]);
  } finally {
    await pool.end();
  }
}

// Helper to create an MCP client and perform proper initialization handshake
async function createAndConnectMcpClient(host, port, bearerToken, projectSlug) {
  const transportUrl = new URL(`http://${host}:${port}/mcp`);

  // Create transport with Bearer token authorization and project ID header
  const transport = new StreamableHTTPClientTransport(transportUrl, {
    requestInit: {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'x-rig-project-id': projectSlug
      }
    }
  });

  // Create client
  const client = new Client({
    name: 'rig-test-client',
    version: '0.1.0'
  });

  // Connect - this performs the MCP initialization handshake
  await client.connect(transport);

  return client;
}

test('MCP end-to-end: bearer auth, project isolation, spec pipeline, CRUD, and finalization', async () => {
  const postgres = await startPostgresContainer();
  const workspaceRoot = repoRoot;
  const mirrorRoot = await mkdtemp(join(tmpdir(), 'rig-mirror-'));
  const mcpBearerToken = 'test-bearer-token';
  const mcpPort = await getFreePort();
  const mcpHost = '127.0.0.1';

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
    configPath: join(workspaceRoot, 'rig.config.ts'),
    mcpBearerToken,
    mcpHost,
    mcpPort
  };

  const composition = await buildComposition(config, { executor });

  try {
    assert(composition.mcpTransport, 'MCP transport should be initialized');

    // Test T4.3: Bearer token auth - invalid token should fail
    let authFailed = false;
    try {
      const invalidClient = await createAndConnectMcpClient(mcpHost, mcpPort, 'wrong-token', 'project-1');
      await invalidClient.close();
    } catch (error) {
      authFailed = true;
    }
    assert(authFailed, 'Should have rejected invalid bearer token');

    // Test T4.4 + T5.2: Create spec in project 1 with proper MCP client
    const client1 = await createAndConnectMcpClient(mcpHost, mcpPort, mcpBearerToken, 'project-1');

    const createSpecResult1 = await client1.callTool({
      name: 'create_spec',
      arguments: {
        actor: 'design-drafter',
        slug: 'auth-flow',
        featureName: 'Authentication Flow'
      }
    });
    const spec1Data = parseToolResponse(createSpecResult1);
    const spec1Id = spec1Data.spec.id;
    assert(spec1Data.spec.projectId, 'Spec should have projectId bound');
    assert.equal(spec1Data.spec.currentStage, 'requirements', 'A fresh spec should derive currentStage as requirements');

    // spec-stage-tracking-fixes W4: get_spec's derived fields, checked at the MCP tool
    // layer (not just the persistence layer) for a freshly-created spec -- nothing
    // approved yet, so every stage (including the synthesized tasks entry) is not_started.
    const getSpecFreshResult = await client1.callTool({
      name: 'get_spec',
      arguments: { specId: spec1Id }
    });
    const getSpecFreshData = parseToolResponse(getSpecFreshResult);
    assert.equal(getSpecFreshData.spec.currentStage, 'requirements');
    const freshStageByName = Object.fromEntries(getSpecFreshData.stages.map((stage) => [stage.stageName, stage.status]));
    assert.deepEqual(freshStageByName, { requirements: 'not_started', design: 'not_started', tasks: 'not_started' });

    // Test project isolation: same slug in project 2
    const client2 = await createAndConnectMcpClient(mcpHost, mcpPort, mcpBearerToken, 'project-2');

    const createSpecResult2 = await client2.callTool({
      name: 'create_spec',
      arguments: {
        actor: 'design-drafter',
        slug: 'auth-flow', // Same slug as project 1
        featureName: 'Authentication Flow - Project 2'
      }
    });
    const spec2Data = parseToolResponse(createSpecResult2);
    const spec2Id = spec2Data.spec.id;
    assert.notEqual(spec1Id, spec2Id, 'Different projects should have different spec IDs');

    // Test list_specs shows only specs for the project
    const listResult1 = await client1.callTool({
      name: 'list_specs',
      arguments: {}
    });
    const listData1 = parseToolResponse(listResult1);
    assert.equal(listData1.specs.length, 1, 'Project 1 should have 1 spec');
    assert.equal(listData1.specs[0].id, spec1Id, 'Listed spec should match created spec');

    const listResult2 = await client2.callTool({
      name: 'list_specs',
      arguments: {}
    });
    const listData2 = parseToolResponse(listResult2);
    assert.equal(listData2.specs.length, 1, 'Project 2 should have 1 spec');
    assert.equal(listData2.specs[0].id, spec2Id, 'Listed spec should match created spec');

    // Test T5.3: Add requirements with append-only ordinals
    const setReqOverviewResult = await client1.callTool({
      name: 'set_requirements_overview',
      arguments: {
        actor: 'requirements-compiler',
        specId: spec1Id,
        featureName: 'Authentication Flow',
        overview: 'Users need to log in securely'
      }
    });
    const reqData = parseToolResponse(setReqOverviewResult);
    const requirementsId = reqData.requirements.id;

    // Add user stories with append-only ordinals
    const userStory1Result = await client1.callTool({
      name: 'add_user_story',
      arguments: {
        actor: 'requirements-compiler',
        requirementsId,
        title: 'User login',
        role: 'user',
        capability: 'log in with email',
        benefit: 'access account',
        rationale: 'security'
      }
    });
    const us1Data = parseToolResponse(userStory1Result);
    assert.equal(us1Data.userStory.storyNumber, 1, 'First user story should have ordinal 1');

    const userStory2Result = await client1.callTool({
      name: 'add_user_story',
      arguments: {
        actor: 'requirements-compiler',
        requirementsId,
        title: 'Password reset',
        role: 'user',
        capability: 'reset forgotten password',
        benefit: 'regain access',
        rationale: 'account recovery'
      }
    });
    const us2Data = parseToolResponse(userStory2Result);
    assert.equal(us2Data.userStory.storyNumber, 2, 'Second user story should have ordinal 2');

    // Add acceptance criteria for user stories (earsPattern must be one of the
    // six EARS enum values -- see requirements.template.md)
    parseToolResponse(await client1.callTool({
      name: 'add_acceptance_criterion',
      arguments: {
        actor: 'requirements-compiler',
        userStoryId: us1Data.userStory.id,
        earsPattern: 'event_driven',
        triggerClause: 'a user submits valid credentials',
        responseClause: 'log them in',
        fullText: 'WHEN a user submits valid credentials, THE SYSTEM SHALL log them in'
      }
    }));

    parseToolResponse(await client1.callTool({
      name: 'add_acceptance_criterion',
      arguments: {
        actor: 'requirements-compiler',
        userStoryId: us2Data.userStory.id,
        earsPattern: 'event_driven',
        triggerClause: 'a user requests a reset',
        responseClause: 'send a password reset email link',
        fullText: 'WHEN a user requests a reset, THE SYSTEM SHALL send a password reset email link'
      }
    }));

    // Test T5.4: Add design components with kebab-case validation
    const setDesignOverviewResult = await client1.callTool({
      name: 'set_design_overview',
      arguments: {
        actor: 'design-drafter',
        specId: spec1Id,
        featureName: 'Authentication Flow',
        overview: 'Multi-tier auth architecture'
      }
    });
    const designData = parseToolResponse(setDesignOverviewResult);
    const designId = designData.design.id;

    const component1Result = await client1.callTool({
      name: 'add_design_component',
      arguments: {
        actor: 'design-drafter',
        designId,
        slug: 'auth-gateway',
        displayName: 'Authentication Gateway'
      }
    });
    const comp1Data = parseToolResponse(component1Result);
    assert.equal(comp1Data.designComponent.ordinal, 1, 'First component should have ordinal 1');

    const component2Result = await client1.callTool({
      name: 'add_design_component',
      arguments: {
        actor: 'design-drafter',
        designId,
        slug: 'token-service',
        displayName: 'Token Service'
      }
    });
    const comp2Data = parseToolResponse(component2Result);
    assert.equal(comp2Data.designComponent.ordinal, 2, 'Second component should have ordinal 2');

    // Test T5.7: get_next_stage before finalization
    const nextStage1Result = await client1.callTool({
      name: 'get_next_stage',
      arguments: {
        specId: spec1Id
      }
    });
    const nextStageData1 = parseToolResponse(nextStage1Result);
    assert.equal(nextStageData1.actionableStage, 'requirements', 'Should be at requirements stage');

    // Test T5.6: Finalize requirements
    const finalizeReqResult = await client1.callTool({
      name: 'finalize_stage',
      arguments: {
        actor: 'design-drafter',
        specId: spec1Id,
        stage: 'requirements'
      }
    });
    const finalReqData = parseToolResponse(finalizeReqResult);
    assert.equal(finalReqData.stage, 'requirements', 'Should finalize requirements stage');
    assert.equal(finalReqData.status, 'in_review', 'Status should be in_review');

    // Design finalization gates on requirements being approved (predecessor_not_approved)
    await humanApprove(postgres.connectionString, spec1Id, 'requirements');

    // Test T5.6: Finalize design (this creates task documents for each component)
    const finalizeDesignResult = await client1.callTool({
      name: 'finalize_stage',
      arguments: {
        actor: 'design-drafter',
        specId: spec1Id,
        stage: 'design'
      }
    });
    const finalDesignData = parseToolResponse(finalizeDesignResult);
    assert.equal(finalDesignData.stage, 'design', 'Should finalize design stage');

    // Tasks finalization gates on design being approved (predecessor_not_approved)
    await humanApprove(postgres.connectionString, spec1Id, 'design');

    // spec-stage-tracking-fixes W4: get_spec's derived fields for a partially-approved
    // spec -- requirements/design both approved (so currentStage advances to tasks
    // immediately, per the locked "capped at tasks" rule) but neither component's
    // tasks_docs row has been finalized/approved yet, so the derived tasks status is
    // still not_started.
    const getSpecPartialResult = await client1.callTool({
      name: 'get_spec',
      arguments: { specId: spec1Id }
    });
    const getSpecPartialData = parseToolResponse(getSpecPartialResult);
    assert.equal(getSpecPartialData.spec.currentStage, 'tasks', 'currentStage advances to tasks once design is approved');
    const partialStageByName = Object.fromEntries(getSpecPartialData.stages.map((stage) => [stage.stageName, stage.status]));
    assert.deepEqual(partialStageByName, { requirements: 'approved', design: 'approved', tasks: 'not_started' });

    // Test T5.5: Add tasks for components (after finalization creates task documents)
    const taskItem1Result = await client1.callTool({
      name: 'add_task_item',
      arguments: {
        actor: 'tasks-drafter',
        componentSlug: 'auth-gateway',
        specId: spec1Id,
        title: 'Implement OAuth2',
        traceability: 'Auth flow requirement',
        acceptanceCheck: 'OAuth2 endpoints respond with tokens',
        description: 'Build OAuth2 provider'
      }
    });
    const task1Data = parseToolResponse(taskItem1Result);
    assert.equal(task1Data.taskItem.executionOrder, 1, 'First task should have execution order 1');
    assert.equal(task1Data.taskItem.itemId, '1', 'First task should have derived item id "1"');
    const taskItem1Id = task1Data.taskItem.id;

    // Finalizing tasks requires every top-level item to declare files touched
    parseToolResponse(await client1.callTool({
      name: 'add_task_file_touched',
      arguments: {
        actor: 'tasks-drafter',
        taskItemId: taskItem1Id,
        filePath: 'src/auth/oauth2-provider.ts'
      }
    }));

    // Test T5.5: Cross-component dependency should succeed instantly (no cycle check yet)
    const taskItem2Result = await client1.callTool({
      name: 'add_task_item',
      arguments: {
        actor: 'tasks-drafter',
        componentSlug: 'token-service',
        specId: spec1Id,
        title: 'Implement token signing',
        traceability: 'Token issuance',
        acceptanceCheck: 'Tokens can be verified',
        description: 'Add JWT signing'
      }
    });
    const task2Data = parseToolResponse(taskItem2Result);
    const taskItem2Id = task2Data.taskItem.id;

    parseToolResponse(await client1.callTool({
      name: 'add_task_file_touched',
      arguments: {
        actor: 'tasks-drafter',
        taskItemId: taskItem2Id,
        filePath: 'src/auth/jwt-signing.ts'
      }
    }));

    const edgeResult = await client1.callTool({
      name: 'add_task_dependency_edge',
      arguments: {
        actor: 'tasks-drafter',
        specId: spec1Id,
        fromTaskItemId: taskItem1Id,
        toTaskItemId: taskItem2Id
      }
    });
    const edgeData = parseToolResponse(edgeResult);
    assert(edgeData.taskDependencyEdge, 'Cross-component edge should be created');

    // Test T5.6: Finalize tasks for each component
    const finalizeTasks1Result = await client1.callTool({
      name: 'finalize_stage',
      arguments: {
        actor: 'tasks-drafter',
        specId: spec1Id,
        stage: 'tasks',
        component: 'auth-gateway'
      }
    });
    const finalTasks1Data = parseToolResponse(finalizeTasks1Result);
    assert.equal(finalTasks1Data.stage, 'tasks', 'Should finalize tasks stage');
    assert.equal(finalTasks1Data.componentSlug, 'auth-gateway', 'Should target component');

    const finalizeTasks2Result = await client1.callTool({
      name: 'finalize_stage',
      arguments: {
        actor: 'tasks-drafter',
        specId: spec1Id,
        stage: 'tasks',
        component: 'token-service'
      }
    });
    const finalTasks2Data = parseToolResponse(finalizeTasks2Result);
    assert.equal(finalTasks2Data.componentSlug, 'token-service', 'Should target second component');

    // get_next_stage only reports null once every stage/component is approved
    await humanApprove(postgres.connectionString, spec1Id, 'tasks');

    // spec-stage-tracking-fixes W4: get_spec's derived fields for a fully-approved
    // spec -- matches what get_next_stage independently confirms below (actionableStage: null).
    const getSpecApprovedResult = await client1.callTool({
      name: 'get_spec',
      arguments: { specId: spec1Id }
    });
    const getSpecApprovedData = parseToolResponse(getSpecApprovedResult);
    assert.equal(getSpecApprovedData.spec.currentStage, 'tasks');
    const approvedStageByName = Object.fromEntries(getSpecApprovedData.stages.map((stage) => [stage.stageName, stage.status]));
    assert.deepEqual(approvedStageByName, { requirements: 'approved', design: 'approved', tasks: 'approved' });

    // Test T5.7: get_next_stage after all finalization
    const nextStage2Result = await client1.callTool({
      name: 'get_next_stage',
      arguments: {
        specId: spec1Id
      }
    });
    const nextStageData2 = parseToolResponse(nextStage2Result);
    assert.equal(nextStageData2.actionableStage, null, 'Should have no next stage when all approved');

    // Test T5.8: Render documents
    const renderReqResult = await client1.callTool({
      name: 'render_document',
      arguments: {
        specId: spec1Id,
        stage: 'requirements'
      }
    });
    const renderReqData = parseToolResponse(renderReqResult);
    assert(renderReqData.markdown, 'Should render requirements markdown');
    assert(renderReqData.markdown.includes('User Story') || renderReqData.markdown.includes('Story'),
      'Should include user story section');

    // Test T5.8: Render design document
    const renderDesignResult = await client1.callTool({
      name: 'render_document',
      arguments: {
        specId: spec1Id,
        stage: 'design'
      }
    });
    const renderDesignData = parseToolResponse(renderDesignResult);
    assert(renderDesignData.markdown, 'Should render design markdown');
    assert(renderDesignData.markdown.includes('auth-gateway'), 'Should include component slug');

    // Test T5.8: Render tasks index document
    const renderTasksIndexResult = await client1.callTool({
      name: 'render_document',
      arguments: {
        specId: spec1Id,
        stage: 'tasks'
        // component omitted = index
      }
    });
    const renderTasksIndexData = parseToolResponse(renderTasksIndexResult);
    assert(renderTasksIndexData.markdown, 'Should render tasks index markdown');
    assert(renderTasksIndexData.markdown.includes('auth-gateway'), 'Should list components');

    // Test T5.8: Render component-specific tasks document
    const renderTasksComponentResult = await client1.callTool({
      name: 'render_document',
      arguments: {
        specId: spec1Id,
        stage: 'tasks',
        component: 'auth-gateway'
      }
    });
    const renderTasksComponentData = parseToolResponse(renderTasksComponentResult);
    assert(renderTasksComponentData.markdown, 'Should render component tasks markdown');
    assert(renderTasksComponentData.markdown.includes('Implement OAuth2'), 'Should include component tasks');

    // Test T6.6: Approve/deny exclusion - try to call a non-existent approve tool
    // (the SDK may surface an unknown tool as a thrown error or as an isError result)
    let approveFailed = false;
    try {
      const approveResult = await client1.callTool({
        name: 'approve_spec',
        arguments: {
          actor: 'reviewer',
          specId: spec1Id
        }
      });
      if (approveResult.isError === true) {
        approveFailed = true;
      } else {
        try {
          parseToolResponse(approveResult);
        } catch {
          approveFailed = true;
        }
      }
    } catch (error) {
      approveFailed = true;
    }
    assert(approveFailed, 'Should not have approve_spec tool');

    await client1.close();
    await client2.close();

  } finally {
    await composition.close().catch(() => {});
    await postgres.stop().catch(() => {});
  }
});

test('MCP error handling: missing x-rig-project-id header returns 400 missing_project_id', async () => {
  const postgres = await startPostgresContainer();
  const workspaceRoot = repoRoot;
  const mirrorRoot = await mkdtemp(join(tmpdir(), 'rig-mirror-'));
  const mcpBearerToken = 'test-bearer-token';
  const mcpPort = await getFreePort();
  const mcpHost = '127.0.0.1';

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
    configPath: join(workspaceRoot, 'rig.config.ts'),
    mcpBearerToken,
    mcpHost,
    mcpPort
  };

  const composition = await buildComposition(config, { executor });

  try {
    const transportUrl = new URL(`http://${mcpHost}:${mcpPort}/mcp`);

    // Create transport without x-rig-project-id header (only Authorization)
    const transport = new StreamableHTTPClientTransport(transportUrl, {
      requestInit: {
        headers: {
          'Authorization': `Bearer ${mcpBearerToken}`
        }
      }
    });

    const client = new Client({
      name: 'rig-test-client',
      version: '0.1.0'
    });

    let connectionFailed = false;
    let errorMessage = '';
    try {
      await client.connect(transport);
    } catch (error) {
      connectionFailed = true;
      errorMessage = error.message;
    }

    assert(connectionFailed, 'Should reject connection without x-rig-project-id header');
    assert(errorMessage.includes('missing_project_id') || errorMessage.includes('400'),
      `Error should reference missing_project_id or 400 status, got: ${errorMessage}`);

  } finally {
    await composition.close().catch(() => {});
    await postgres.stop().catch(() => {});
  }
});

test('MCP error handling: invalid x-rig-project-id header returns 400 invalid_project_id', async () => {
  const postgres = await startPostgresContainer();
  const workspaceRoot = repoRoot;
  const mirrorRoot = await mkdtemp(join(tmpdir(), 'rig-mirror-'));
  const mcpBearerToken = 'test-bearer-token';
  const mcpPort = await getFreePort();
  const mcpHost = '127.0.0.1';

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
    configPath: join(workspaceRoot, 'rig.config.ts'),
    mcpBearerToken,
    mcpHost,
    mcpPort
  };

  const composition = await buildComposition(config, { executor });

  try {
    const transportUrl = new URL(`http://${mcpHost}:${mcpPort}/mcp`);

    // Create transport with invalid project ID (not kebab-case)
    const transport = new StreamableHTTPClientTransport(transportUrl, {
      requestInit: {
        headers: {
          'Authorization': `Bearer ${mcpBearerToken}`,
          'x-rig-project-id': 'Not_Valid!'
        }
      }
    });

    const client = new Client({
      name: 'rig-test-client',
      version: '0.1.0'
    });

    let connectionFailed = false;
    let errorMessage = '';
    try {
      await client.connect(transport);
    } catch (error) {
      connectionFailed = true;
      errorMessage = error.message;
    }

    assert(connectionFailed, 'Should reject connection with invalid x-rig-project-id header');
    assert(errorMessage.includes('invalid_project_id') || errorMessage.includes('400'),
      `Error should reference invalid_project_id or 400 status, got: ${errorMessage}`);

  } finally {
    await composition.close().catch(() => {});
    await postgres.stop().catch(() => {});
  }
});

test('MCP error handling: old /mcp/<slug> path format returns 404', async () => {
  const postgres = await startPostgresContainer();
  const workspaceRoot = repoRoot;
  const mirrorRoot = await mkdtemp(join(tmpdir(), 'rig-mirror-'));
  const mcpBearerToken = 'test-bearer-token';
  const mcpPort = await getFreePort();
  const mcpHost = '127.0.0.1';

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
    configPath: join(workspaceRoot, 'rig.config.ts'),
    mcpBearerToken,
    mcpHost,
    mcpPort
  };

  const composition = await buildComposition(config, { executor });

  try {
    // Try to connect with old URL format that includes the slug in the path
    const transportUrl = new URL(`http://${mcpHost}:${mcpPort}/mcp/development`);

    const transport = new StreamableHTTPClientTransport(transportUrl, {
      requestInit: {
        headers: {
          'Authorization': `Bearer ${mcpBearerToken}`,
          'x-rig-project-id': 'development'
        }
      }
    });

    const client = new Client({
      name: 'rig-test-client',
      version: '0.1.0'
    });

    let connectionFailed = false;
    let errorMessage = '';
    try {
      await client.connect(transport);
    } catch (error) {
      connectionFailed = true;
      errorMessage = error.message;
    }

    assert(connectionFailed, 'Should reject connection with old /mcp/<slug> path format');
    assert(errorMessage.includes('404') || errorMessage.includes('not_found') || errorMessage.includes('not found'),
      `Error should reference 404 or not_found, got: ${errorMessage}`);

  } finally {
    await composition.close().catch(() => {});
    await postgres.stop().catch(() => {});
  }
});

test('MCP cycle detection in task dependencies', async () => {
  const postgres = await startPostgresContainer();
  const workspaceRoot = repoRoot;
  const mirrorRoot = await mkdtemp(join(tmpdir(), 'rig-mirror-'));
  const mcpBearerToken = 'test-bearer-token';
  const mcpPort = await getFreePort();
  const mcpHost = '127.0.0.1';

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
    configPath: join(workspaceRoot, 'rig.config.ts'),
    mcpBearerToken,
    mcpHost,
    mcpPort
  };

  const composition = await buildComposition(config, { executor });

  try {
    // Initialize MCP client with proper handshake
    const client = await createAndConnectMcpClient(mcpHost, mcpPort, mcpBearerToken, 'cycle-test');

    // Create a spec with components and tasks to test cycle detection
    const createSpecResult = await client.callTool({
      name: 'create_spec',
      arguments: {
        actor: 'design-drafter',
        slug: 'cycle-detection',
        featureName: 'Cycle Detection Test'
      }
    });
    const specData = parseToolResponse(createSpecResult);
    const specId = specData.spec.id;

    // Set up design with components
    const designResult = await client.callTool({
      name: 'set_design_overview',
      arguments: {
        actor: 'design-drafter',
        specId,
        featureName: 'Cycle Detection Test',
        overview: 'Test architecture'
      }
    });
    const designData = parseToolResponse(designResult);
    const designId = designData.design.id;

    // Add two components
    await client.callTool({
      name: 'add_design_component',
      arguments: {
        actor: 'design-drafter',
        designId,
        slug: 'component-a',
        displayName: 'Component A'
      }
    });

    await client.callTool({
      name: 'add_design_component',
      arguments: {
        actor: 'design-drafter',
        designId,
        slug: 'component-b',
        displayName: 'Component B'
      }
    });

    // Add requirements to finalize (needs >=1 story with >=1 criterion)
    const cycleReqResult = await client.callTool({
      name: 'set_requirements_overview',
      arguments: {
        actor: 'requirements-compiler',
        specId,
        featureName: 'Cycle Detection',
        overview: 'Testing cycle detection'
      }
    });
    const cycleReqData = parseToolResponse(cycleReqResult);

    const cycleStoryResult = await client.callTool({
      name: 'add_user_story',
      arguments: {
        actor: 'requirements-compiler',
        requirementsId: cycleReqData.requirements.id,
        title: 'Ordering safety',
        role: 'drafter',
        capability: 'declare task dependencies',
        benefit: 'safe execution order',
        rationale: 'cycles would deadlock implementation'
      }
    });
    const cycleStoryData = parseToolResponse(cycleStoryResult);

    parseToolResponse(await client.callTool({
      name: 'add_acceptance_criterion',
      arguments: {
        actor: 'requirements-compiler',
        userStoryId: cycleStoryData.userStory.id,
        earsPattern: 'unwanted_behavior',
        conditionClause: 'a dependency cycle exists',
        responseClause: 'reject finalization',
        fullText: 'IF a dependency cycle exists, THEN THE SYSTEM SHALL reject finalization'
      }
    }));

    // Finalize requirements and design first (this creates task documents);
    // approve/deny between stages is human-only, emulated via SQL.
    parseToolResponse(await client.callTool({
      name: 'finalize_stage',
      arguments: {
        actor: 'design-drafter',
        specId,
        stage: 'requirements'
      }
    }));
    await humanApprove(postgres.connectionString, specId, 'requirements');

    parseToolResponse(await client.callTool({
      name: 'finalize_stage',
      arguments: {
        actor: 'design-drafter',
        specId,
        stage: 'design'
      }
    }));
    await humanApprove(postgres.connectionString, specId, 'design');

    // Add tasks to components (after finalization creates task documents)
    const taskAResult = await client.callTool({
      name: 'add_task_item',
      arguments: {
        actor: 'tasks-drafter',
        componentSlug: 'component-a',
        specId,
        title: 'Task A',
        traceability: 'Requirement A',
        acceptanceCheck: 'Task A done',
        description: 'Do A'
      }
    });
    const taskAData = parseToolResponse(taskAResult);
    const taskAId = taskAData.taskItem.id;

    parseToolResponse(await client.callTool({
      name: 'add_task_file_touched',
      arguments: { actor: 'tasks-drafter', taskItemId: taskAId, filePath: 'src/component-a.ts' }
    }));

    const taskBResult = await client.callTool({
      name: 'add_task_item',
      arguments: {
        actor: 'tasks-drafter',
        componentSlug: 'component-b',
        specId,
        title: 'Task B',
        traceability: 'Requirement B',
        acceptanceCheck: 'Task B done',
        description: 'Do B'
      }
    });
    const taskBData = parseToolResponse(taskBResult);
    const taskBId = taskBData.taskItem.id;

    parseToolResponse(await client.callTool({
      name: 'add_task_file_touched',
      arguments: { actor: 'tasks-drafter', taskItemId: taskBId, filePath: 'src/component-b.ts' }
    }));

    // Create a cycle: A -> B -> A
    await client.callTool({
      name: 'add_task_dependency_edge',
      arguments: {
        actor: 'tasks-drafter',
        specId,
        fromTaskItemId: taskAId,
        toTaskItemId: taskBId
      }
    });

    await client.callTool({
      name: 'add_task_dependency_edge',
      arguments: {
        actor: 'tasks-drafter',
        specId,
        fromTaskItemId: taskBId,
        toTaskItemId: taskAId
      }
    });

    // Test T5.6: Trying to finalize tasks with a cycle should fail
    let cycleError = null;
    try {
      parseToolResponse(await client.callTool({
        name: 'finalize_stage',
        arguments: {
          actor: 'tasks-drafter',
          specId,
          stage: 'tasks',
          component: 'component-a'
        }
      }));
    } catch (error) {
      cycleError = error;
    }
    assert(cycleError !== null, 'Should reject finalization with cycle present');
    assert.equal(cycleError.rule, 'cycle_detected', `Rejection should be cycle_detected, got: ${cycleError.rule ?? cycleError.message}`);

    await client.close();

  } finally {
    await composition.close().catch(() => {});
    await postgres.stop().catch(() => {});
  }
});
