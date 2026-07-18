import { promises as fs } from 'node:fs';
import { join } from 'node:path';

import { validateWorkflow } from '@rig/engine';
import { createWorkflow as createWorkflowRow, updateWorkflow as updateWorkflowRow, listWorkflows, listPrompts, type JsonValue } from '@rig/persistence';
import type {
	ArtifactMetadataResponse,
	ArtifactReadResponse,
	PromptGetResponse,
	PromptListResponse,
	PromptValidateResponse,
	RunEvent,
	RunSummary,
	RunsSignalResponse,
	WorkflowDocument,
	WorkflowGetResponse,
	WorkflowListResponse,
	WorkflowSnapshotDiffResponse,
	WorkflowSummary,
	WorkflowValidateResponse
} from '@rig/proto';

import type { ServerComposition } from '../composition/index.js';

interface RunInputBinding {
	path?: string;
	contents?: string;
}

interface StartRunRequest {
	workflowId: string;
	inputs: Record<string, RunInputBinding>;
}

interface HumanSignalRequest {
	runId: string;
	signal: string;
	payloadJson?: string;
}

interface EventsRequest {
	runId: string;
	sinceOffset: bigint | number;
}

function parseJsonMaybe(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function serializeWorkflow(workflow: unknown): string {
	return `${JSON.stringify(workflow, null, 2)}\n`;
}

function runWorkspaceRoot(composition: ServerComposition, runId: string): string {
	return join(composition.config.workspaceRoot, '.rig', 'runs', runId, 'workspace');
}

async function ensureDirectory(filePath: string): Promise<void> {
	await fs.mkdir(filePath, { recursive: true });
}

async function writeFile(filePath: string, contents: string): Promise<void> {
	await ensureDirectory(join(filePath, '..'));
	await fs.writeFile(filePath, contents, 'utf8');
}

function summaryFromWorkflowDocument(document: WorkflowDocument): WorkflowSummary {
	return {
		id: document.id,
		name: document.id,
		version: undefined,
		description: undefined
	};
}

function summaryFromRun(row: { id: string; workflow_id: string; status: string; current_node_id: string; started_at: string; ended_at?: string | null; ended_at_node?: string | null }): RunSummary {
	return {
		id: row.id,
		workflowId: row.workflow_id,
		status: row.status,
		currentNodeId: row.current_node_id,
		startedAt: row.started_at,
		endedAt: row.ended_at ?? undefined,
		endedAtNode: row.ended_at_node ?? undefined
	};
}

async function loadWorkflowDocument(composition: ServerComposition, workflowId: string): Promise<WorkflowDocument | null> {
	const entry = await composition.libraryResolver.resolveWorkflow(workflowId);
	if (entry === null) {
		return null;
	}
	return {
		id: entry.id,
		yaml: serializeWorkflow(entry.workflow)
	};
}

async function queryRuns(composition: ServerComposition): Promise<Array<{ id: string; workflow_id: string; status: string; current_node_id: string; started_at: string; ended_at: string | null; ended_at_node: string | null }>> {
	const result = await composition.pool.query('select id, workflow_id, status, current_node_id, started_at::text as started_at, ended_at::text as ended_at, ended_at_node from runs order by started_at desc');
	return result.rows as Array<{ id: string; workflow_id: string; status: string; current_node_id: string; started_at: string; ended_at: string | null; ended_at_node: string | null }>;
}

async function queryRun(composition: ServerComposition, runId: string): Promise<RunSummary | null> {
	const result = await composition.pool.query('select id, workflow_id, status, current_node_id, started_at::text as started_at, ended_at::text as ended_at, ended_at_node from runs where id = $1', [runId]);
	const row = result.rows[0] as { id: string; workflow_id: string; status: string; current_node_id: string; started_at: string; ended_at: string | null; ended_at_node: string | null } | undefined;
	return row === undefined ? null : summaryFromRun(row);
}

async function queryEvents(composition: ServerComposition, runId: string, sinceOffset: bigint | number): Promise<RunEvent[]> {
	const result = await composition.pool.query('select seq, type, ts::text as ts, payload from run_events where run_id = $1 and seq > $2 order by seq asc', [runId, sinceOffset]);
	return result.rows.map((row) => ({
		seq: Number(row.seq),
		kind: String(row.type),
		payloadJson: JSON.stringify(row.payload)
	})) as RunEvent[];
}

async function* streamEvents(composition: ServerComposition, request: EventsRequest): AsyncGenerator<RunEvent, void, void> {
	let offset = request.sinceOffset;
	while (true) {
		const events = await queryEvents(composition, request.runId, offset);
		if (events.length > 0) {
			for (const event of events) {
				offset = event.seq;
				yield event;
			}
			continue;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

export interface RpcFacade {
	workflows: {
		list(): Promise<WorkflowListResponse>;
		get(id: string): Promise<WorkflowGetResponse>;
		validate(yaml: string): Promise<WorkflowValidateResponse>;
		create(workflow: WorkflowDocument): Promise<WorkflowSummary>;
		update(workflow: WorkflowDocument): Promise<WorkflowSummary>;
		snapshotDiff(id: string, snapshotHash: string): Promise<WorkflowSnapshotDiffResponse>;
	};
	prompts: {
		list(): Promise<PromptListResponse>;
		get(id: string): Promise<PromptGetResponse>;
		validate(id: string, body: string): Promise<PromptValidateResponse>;
	};
	runs: {
		start(request: StartRunRequest): Promise<RunSummary>;
		get(runId: string): Promise<RunSummary | null>;
		list(): Promise<RunSummary[]>;
		abort(runId: string): Promise<RunSummary>;
		delete(runId: string): Promise<void>;
		signal(request: HumanSignalRequest): Promise<RunsSignalResponse>;
		events(request: EventsRequest): AsyncGenerator<RunEvent, void, void>;
	};
	artifacts: {
		read(runId: string, name: string): Promise<ArtifactReadResponse>;
		metadata(runId: string, name: string): Promise<ArtifactMetadataResponse>;
	};
}

function parseWorkflowInput(yaml: string): unknown {
	const trimmed = yaml.trim();
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		return JSON.parse(trimmed);
	}
	throw new Error('YAML parsing is not available in the server RPC facade; provide JSON-shaped workflow content');
}

export function createRpcFacade(composition: ServerComposition): RpcFacade {
	return {
		workflows: {
			async list() {
				const records = await listWorkflows(composition.pool);
				return { workflows: records.map((record) => ({ id: record.id, name: record.id, version: undefined, description: undefined })) };
			},
			async get(id: string) {
				const workflow = await loadWorkflowDocument(composition, id);
				if (workflow === null) {
					throw new Error(`Workflow not found: ${id}`);
				}
				return { workflow };
			},
			async validate(yaml: string) {
				const parsed = parseWorkflowInput(yaml);
				const result = validateWorkflow(parsed);
				return {
					valid: result.ok,
					warnings: result.warnings.map((entry: { message: string }) => entry.message),
					issues: result.issues.map((issue) => ({
						rule: issue.rule,
						nodeId: issue.nodeId ?? '',
						field: issue.field ?? '',
						message: issue.message
					}))
				};
			},
			async create(workflow: WorkflowDocument) {
				await createWorkflowRow(composition.pool, { id: workflow.id, definition: parseWorkflowInput(workflow.yaml) as JsonValue, projectId: null, origin: 'user' });
				return summaryFromWorkflowDocument(workflow);
			},
			async update(workflow: WorkflowDocument) {
				await updateWorkflowRow(composition.pool, workflow.id, { definition: parseWorkflowInput(workflow.yaml) as JsonValue });
				return summaryFromWorkflowDocument(workflow);
			},
			async snapshotDiff(id: string, snapshotHash: string) {
				const current = await loadWorkflowDocument(composition, id);
				if (current === null) {
					throw new Error(`Workflow not found: ${id}`);
				}
				const diff = snapshotHash === current.yaml ? '' : `snapshot ${snapshotHash} differs from current workflow ${id}`;
				return { diff };
			}
		},
		prompts: {
			async list() {
				const records = await listPrompts(composition.pool, null);
				return { prompts: records.map((record) => ({ id: record.promptKey, description: record.description ?? undefined })) };
			},
			async get(id: string) {
				const prompt = await composition.libraryResolver.resolvePrompt(id);
				if (prompt === null) {
					throw new Error(`Prompt not found: ${id}`);
				}
				return { id: prompt.id, body: prompt.body, description: prompt.description };
			},
			async validate(id: string, body: string) {
				const prompt = await composition.libraryResolver.resolvePrompt(id);
				const valid = prompt !== null && prompt.body.trim().length > 0 && body.trim().length > 0;
				return { valid, issues: valid ? [] : [{ rule: 'prompt', nodeId: id, field: 'body', message: 'Prompt body is empty' }] };
			}
		},
		runs: {
			async start(request: StartRunRequest) {
				const workflow = await composition.libraryResolver.resolveWorkflow(request.workflowId);
				if (workflow === null) {
					throw new Error(`Workflow not found: ${request.workflowId}`);
				}
				for (const inputDecl of workflow.workflow.inputs) {
					if (inputDecl.required === true && request.inputs[inputDecl.name] === undefined) {
						throw new Error(`Missing required input: ${inputDecl.name}`);
					}
				}
				const runId = `run-${Date.now()}`;
				const workspacePath = runWorkspaceRoot(composition, runId);
				await ensureDirectory(workspacePath);
				for (const [name, binding] of Object.entries(request.inputs)) {
					const filePath = join(workspacePath, binding.path ?? name);
					await writeFile(filePath, binding.contents ?? '');
				}
				const runState = await composition.runStore.create({
					id: runId,
					workflowId: workflow.id,
					snapshotHash: serializeWorkflow(workflow.workflow),
					currentNodeId: workflow.workflow.entry,
					context: {},
					inputs: Object.fromEntries(Object.entries(request.inputs).map(([key, value]) => [key, value.contents ?? ''])),
					workspacePath,
					status: 'pending'
				});
				await composition.pool.query('update runs set workflow_snapshot_yaml = $2 where id = $1', [runState.id, serializeWorkflow(workflow.workflow)]);
				await composition.runStore.appendEvent(runState.id, {
					type: 'run_created',
					ts: new Date().toISOString(),
					payload: { workflowId: workflow.id }
				});
				return summaryFromRun({
					id: runState.id,
					workflow_id: runState.workflowId,
					status: runState.status,
					current_node_id: runState.currentNodeId,
					started_at: runState.startedAt,
					ended_at: null,
					ended_at_node: null
				});
			},
			async get(runId: string) {
				const run = await queryRun(composition, runId);
				if (run === null) {
					throw new Error(`Run not found: ${runId}`);
				}
				return run;
			},
			async list() {
				return await Promise.all((await queryRuns(composition)).map(async (row) => summaryFromRun(row)));
			},
			async abort(runId: string) {
				const run = await composition.runStore.load(runId);
				run.status = 'aborted';
				run.endedAt = new Date().toISOString();
				await composition.runStore.save(run);
				return summaryFromRun({
					id: run.id,
					workflow_id: run.workflowId,
					status: run.status,
					current_node_id: run.currentNodeId,
					started_at: run.startedAt,
					ended_at: run.endedAt ?? null,
					ended_at_node: run.endedAtNode ?? null
				});
			},
			async delete(runId: string) {
				await composition.pool.query('delete from run_events where run_id = $1', [runId]);
				await composition.pool.query('delete from pending_human_interactions where run_id = $1', [runId]);
				await composition.pool.query('delete from run_locks where run_id = $1', [runId]);
				await composition.pool.query('delete from artifacts_meta where run_id = $1', [runId]);
				await composition.pool.query('delete from runs where id = $1 and status <> $2', [runId, 'running']);
			},
			async signal(request: HumanSignalRequest) {
				const signal = await composition.runStore.takePendingHuman(request.runId, {
					signal: request.signal,
					payload: request.payloadJson === undefined ? undefined : parseJsonMaybe(request.payloadJson) as never
				});
				return { signal: signal.signal, payloadJson: JSON.stringify(signal.output ?? null) };
			},
			events(request: EventsRequest) {
				return streamEvents(composition, request);
			}
		},
		artifacts: {
			async read(runId: string, name: string) {
				const contents = await composition.artifactStore.read(runId, name);
				return { contents };
			},
			async metadata(runId: string, name: string) {
				return await composition.artifactStore.metadata(runId, name);
			}
		}
	};
}