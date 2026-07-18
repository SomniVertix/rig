/// <reference path="./pg.d.ts" />

import { randomUUID, createHash } from 'node:crypto';
import type { Pool } from 'pg';

import { withTransaction, type JsonValue } from './index.js';

/**
 * DB-backed prompt/agent + workflow library store (Stories 2, 3, 4, 13). Reads
 * and writes `spec_pipeline.prompts`/`prompt_snapshots` and
 * `spec_pipeline.workflows`/`workflow_snapshots` (T1.6/T1.7), replacing the
 * file-based `.rig/{agents,prompts,workflows}` path for normal
 * operation (Story 1.2, 2.3, 3.1). Templates/tools remain file-based --
 * out of scope for this module.
 */

export interface PromptRecord {
	id: string;
	projectId: string | null;
	promptKey: string;
	kind: string;
	body: string;
	description: string | null;
	origin: string;
	currentVersion: number;
	createdAt: string;
	updatedAt: string;
}

export interface PromptSnapshotRecord {
	id: string;
	promptId: string;
	version: number;
	body: string;
	description: string | null;
	createdAt: string;
}

export interface CreatePromptInput {
	projectId?: string | null;
	promptKey: string;
	kind: string;
	body: string;
	description?: string | null;
	origin?: string;
}

export interface UpdatePromptInput {
	body: string;
	description?: string | null;
}

export interface SeedBundledPromptInput {
	promptKey: string;
	kind: string;
	body: string;
	description?: string | null;
}

interface PromptRow {
	id: string;
	project_id: string | null;
	prompt_key: string;
	kind: string;
	body: string;
	description: string | null;
	origin: string;
	current_version: number | string;
	created_at: string | Date;
	updated_at: string | Date;
}

interface PromptSnapshotRow {
	id: string;
	prompt_id: string;
	version: number | string;
	body: string;
	description: string | null;
	created_at: string | Date;
}

function toIsoString(value: string | Date): string {
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToPromptRecord(row: PromptRow): PromptRecord {
	return {
		id: row.id,
		projectId: row.project_id,
		promptKey: row.prompt_key,
		kind: row.kind,
		body: row.body,
		description: row.description,
		origin: row.origin,
		currentVersion: Number(row.current_version),
		createdAt: toIsoString(row.created_at),
		updatedAt: toIsoString(row.updated_at)
	};
}

function rowToPromptSnapshotRecord(row: PromptSnapshotRow): PromptSnapshotRecord {
	return {
		id: row.id,
		promptId: row.prompt_id,
		version: Number(row.version),
		body: row.body,
		description: row.description,
		createdAt: toIsoString(row.created_at)
	};
}

/**
 * Resolves a prompt/agent by key: a project-scoped row shadows the bundled
 * (`project_id IS NULL`) row of the same `prompt_key` for that project only;
 * every other project (and a null `projectId`) still sees the bundled row
 * (Story 4.4). No per-project copy is ever created here (Story 4.5).
 */
export async function resolvePrompt(pool: Pool, projectId: string | null, promptKey: string): Promise<PromptRecord | null> {
	if (projectId !== null) {
		const scoped = await pool.query(`select * from spec_pipeline.prompts where project_id = $1 and prompt_key = $2`, [projectId, promptKey]);
		const scopedRow = (scoped.rows as unknown as PromptRow[])[0];
		if (scopedRow !== undefined) {
			return rowToPromptRecord(scopedRow);
		}
	}
	const bundled = await pool.query(`select * from spec_pipeline.prompts where project_id is null and prompt_key = $1`, [promptKey]);
	const bundledRow = (bundled.rows as unknown as PromptRow[])[0];
	return bundledRow === undefined ? null : rowToPromptRecord(bundledRow);
}

export async function getPrompt(pool: Pool, promptId: string): Promise<PromptRecord | null> {
	const result = await pool.query(`select * from spec_pipeline.prompts where id = $1`, [promptId]);
	const row = (result.rows as unknown as PromptRow[])[0];
	return row === undefined ? null : rowToPromptRecord(row);
}

/**
 * Lists prompts/agents visible to `projectId`: its own project-scoped rows
 * plus every bundled (`project_id IS NULL`) row not shadowed by one of them
 * (Story 4.4). Passing `null` lists bundled rows only.
 */
export async function listPrompts(pool: Pool, projectId: string | null): Promise<PromptRecord[]> {
	const result =
		projectId === null
			? await pool.query(`select * from spec_pipeline.prompts where project_id is null order by prompt_key`)
			: await pool.query(
					`select distinct on (prompt_key) *
					 from spec_pipeline.prompts
					 where project_id = $1 or project_id is null
					 order by prompt_key, project_id nulls last`,
					[projectId]
				);
	return (result.rows as unknown as PromptRow[]).map(rowToPromptRecord);
}

/**
 * Creates a new prompt/agent row, either project-scoped (`projectId` set) or
 * bundled (`projectId` omitted/null). Relies on the T1.6 partial unique
 * indexes (`prompts_project_key`, `prompts_bundled_key`) to enforce
 * uniqueness within each scope.
 */
export async function createPrompt(pool: Pool, input: CreatePromptInput): Promise<PromptRecord> {
	const projectId = input.projectId ?? null;
	const origin = input.origin ?? (projectId === null ? 'bundled' : 'user');
	const result = await pool.query(
		`insert into spec_pipeline.prompts (project_id, prompt_key, kind, body, description, origin)
		 values ($1, $2, $3, $4, $5, $6)
		 returning *`,
		[projectId, input.promptKey, input.kind, input.body, input.description ?? null, origin]
	);
	const row = (result.rows as unknown as PromptRow[])[0];
	if (row === undefined) {
		throw new Error(`createPrompt: insert did not return a row for prompt_key: ${input.promptKey}`);
	}
	return rowToPromptRecord(row);
}

/**
 * Updates a prompt's body/description. Before bumping `current_version`, the
 * prior body/description is captured as a `prompt_snapshots` row (Story 3.2),
 * so `(prompt_id, version)` always recovers the exact prior body (Story 3.3).
 */
export async function updatePrompt(pool: Pool, promptId: string, input: UpdatePromptInput): Promise<PromptRecord> {
	return await withTransaction(pool, async (client) => {
		const currentResult = await client.query(`select * from spec_pipeline.prompts where id = $1 for update`, [promptId]);
		const current = (currentResult.rows as unknown as PromptRow[])[0];
		if (current === undefined) {
			throw new Error(`Prompt not found: ${promptId}`);
		}
		await client.query(
			`insert into spec_pipeline.prompt_snapshots (prompt_id, version, body, description) values ($1, $2, $3, $4)`,
			[promptId, current.current_version, current.body, current.description]
		);
		const updatedResult = await client.query(
			`update spec_pipeline.prompts
			 set body = $2, description = $3, current_version = current_version + 1
			 where id = $1
			 returning *`,
			[promptId, input.body, input.description !== undefined ? input.description : current.description]
		);
		const updated = (updatedResult.rows as unknown as PromptRow[])[0];
		if (updated === undefined) {
			throw new Error(`updatePrompt: update did not return a row for prompt id: ${promptId}`);
		}
		return rowToPromptRecord(updated);
	});
}

export async function getPromptSnapshot(pool: Pool, promptId: string, version: number): Promise<PromptSnapshotRecord | null> {
	const result = await pool.query(`select * from spec_pipeline.prompt_snapshots where prompt_id = $1 and version = $2`, [promptId, version]);
	const row = (result.rows as unknown as PromptSnapshotRow[])[0];
	return row === undefined ? null : rowToPromptSnapshotRecord(row);
}

/**
 * Boot seed-if-absent pass for a single bundled prompt/agent (Story 13.3-13.5):
 * upserts a project-less (`project_id IS NULL`), `origin='bundled'` row via
 * `ON CONFLICT DO NOTHING` so an existing row -- bundled default or a
 * user-modified one -- is never overwritten.
 */
export async function seedBundledPrompt(pool: Pool, input: SeedBundledPromptInput): Promise<void> {
	await pool.query(
		`insert into spec_pipeline.prompts (project_id, prompt_key, kind, body, description, origin)
		 values (null, $1, $2, $3, $4, 'bundled')
		 on conflict (prompt_key) where project_id is null do nothing`,
		[input.promptKey, input.kind, input.body, input.description ?? null]
	);
}

export interface WorkflowRecord {
	id: string;
	definition: JsonValue;
	projectId: string | null;
	origin: string;
	updatedAt: string;
}

export interface WorkflowSnapshotRecord {
	id: string;
	workflowId: string;
	snapshotHash: string;
	definition: JsonValue;
	createdAt: string;
}

export interface CreateWorkflowInput {
	id: string;
	definition: JsonValue;
	projectId?: string | null;
	origin?: string;
}

export interface UpdateWorkflowInput {
	definition: JsonValue;
}

export interface SeedBundledWorkflowInput {
	id: string;
	definition: JsonValue;
}

interface WorkflowRow {
	id: string;
	definition: unknown;
	project_id: string | null;
	origin: string;
	updated_at: string | Date;
}

interface WorkflowSnapshotRow {
	id: string;
	workflow_id: string;
	snapshot_hash: string;
	definition: unknown;
	created_at: string | Date;
}

function parseJsonColumn(value: unknown): JsonValue {
	if (typeof value === 'string') {
		return JSON.parse(value) as JsonValue;
	}
	return value as JsonValue;
}

function jsonColumn(value: JsonValue): string {
	return JSON.stringify(value ?? null);
}

function hashDefinition(definition: JsonValue): string {
	return createHash('sha256').update(jsonColumn(definition)).digest('hex');
}

function rowToWorkflowRecord(row: WorkflowRow): WorkflowRecord {
	return {
		id: row.id,
		definition: parseJsonColumn(row.definition),
		projectId: row.project_id,
		origin: row.origin,
		updatedAt: toIsoString(row.updated_at)
	};
}

function rowToWorkflowSnapshotRecord(row: WorkflowSnapshotRow): WorkflowSnapshotRecord {
	return {
		id: row.id,
		workflowId: row.workflow_id,
		snapshotHash: row.snapshot_hash,
		definition: parseJsonColumn(row.definition),
		createdAt: toIsoString(row.created_at)
	};
}

export async function getWorkflow(pool: Pool, id: string): Promise<WorkflowRecord | null> {
	const result = await pool.query(`select * from spec_pipeline.workflows where id = $1`, [id]);
	const row = (result.rows as unknown as WorkflowRow[])[0];
	return row === undefined ? null : rowToWorkflowRecord(row);
}

/** Lists every workflow definition row (`id` is a single global namespace, unlike prompts). */
export async function listWorkflows(pool: Pool): Promise<WorkflowRecord[]> {
	const result = await pool.query(`select * from spec_pipeline.workflows order by id`);
	return (result.rows as unknown as WorkflowRow[]).map(rowToWorkflowRecord);
}

/**
 * Creates a workflow definition row in `spec_pipeline.workflows`, replacing
 * the file-based `.rig/workflows/*.yaml` write path for normal
 * operation (Story 2.1).
 */
export async function createWorkflow(pool: Pool, input: CreateWorkflowInput): Promise<WorkflowRecord> {
	const projectId = input.projectId ?? null;
	const origin = input.origin ?? (projectId === null ? 'bundled' : 'user');
	const result = await pool.query(
		`insert into spec_pipeline.workflows (id, definition, project_id, origin)
		 values ($1, $2::jsonb, $3, $4)
		 returning *`,
		[input.id, jsonColumn(input.definition), projectId, origin]
	);
	const row = (result.rows as unknown as WorkflowRow[])[0];
	if (row === undefined) {
		throw new Error(`createWorkflow: insert did not return a row for workflow id: ${input.id}`);
	}
	return rowToWorkflowRecord(row);
}

/**
 * Updates a workflow's definition. Before the row is updated, the prior
 * definition is captured as a `workflow_snapshots` row keyed by its content
 * hash, so both the current row and a history row are persisted to Postgres,
 * never to `.rig/workflows/*.yaml` (Story 2.1, 2.2).
 */
export async function updateWorkflow(pool: Pool, id: string, input: UpdateWorkflowInput): Promise<WorkflowRecord> {
	return await withTransaction(pool, async (client) => {
		const currentResult = await client.query(`select * from spec_pipeline.workflows where id = $1 for update`, [id]);
		const current = (currentResult.rows as unknown as WorkflowRow[])[0];
		if (current === undefined) {
			throw new Error(`Workflow not found: ${id}`);
		}
		const priorDefinition = parseJsonColumn(current.definition);
		await client.query(
			`insert into spec_pipeline.workflow_snapshots (id, workflow_id, snapshot_hash, definition)
			 values ($1, $2, $3, $4::jsonb)`,
			[randomUUID(), id, hashDefinition(priorDefinition), jsonColumn(priorDefinition)]
		);
		const updatedResult = await client.query(
			`update spec_pipeline.workflows
			 set definition = $2::jsonb, updated_at = now()
			 where id = $1
			 returning *`,
			[id, jsonColumn(input.definition)]
		);
		const updated = (updatedResult.rows as unknown as WorkflowRow[])[0];
		if (updated === undefined) {
			throw new Error(`updateWorkflow: update did not return a row for workflow id: ${id}`);
		}
		return rowToWorkflowRecord(updated);
	});
}

export async function getWorkflowSnapshot(pool: Pool, workflowId: string, snapshotHash: string): Promise<WorkflowSnapshotRecord | null> {
	const result = await pool.query(
		`select * from spec_pipeline.workflow_snapshots where workflow_id = $1 and snapshot_hash = $2 order by created_at desc limit 1`,
		[workflowId, snapshotHash]
	);
	const row = (result.rows as unknown as WorkflowSnapshotRow[])[0];
	return row === undefined ? null : rowToWorkflowSnapshotRecord(row);
}

/**
 * Boot seed-if-absent pass for a single bundled workflow (Story 13.3-13.5):
 * upserts a project-less (`project_id IS NULL`), `origin='bundled'` row via
 * `ON CONFLICT DO NOTHING` so an existing row is never overwritten.
 */
export async function seedBundledWorkflow(pool: Pool, input: SeedBundledWorkflowInput): Promise<void> {
	await pool.query(
		`insert into spec_pipeline.workflows (id, definition, project_id, origin)
		 values ($1, $2::jsonb, null, 'bundled')
		 on conflict (id) do nothing`,
		[input.id, jsonColumn(input.definition)]
	);
}
