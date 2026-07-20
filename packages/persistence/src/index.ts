/// <reference path="./pg.d.ts" />

import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient, type PoolConfig } from 'pg';

export { Pool };
export type { PoolClient, PoolConfig };

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

export type RunStatus = 'pending' | 'running' | 'waiting_human' | 'interrupted' | 'succeeded' | 'failed' | 'aborted';

export interface RunEventBase {
	seq: number;
	type: string;
	ts: string;
	payload: Record<string, JsonValue>;
}

export interface PendingHumanInteraction {
	runId: string;
	nodeId: string;
	prompt: string;
	allowedSignals: string[];
	payloadSchema?: JsonValue;
	deadline?: string | null;
	resolvedAt?: string | null;
	resolvedSignal?: string | null;
	resolvedPayload?: JsonValue;
}

export interface RunState {
	id: string;
	workflowId: string;
	snapshotHash: string;
	status: RunStatus;
	currentNodeId: string;
	context: Record<string, JsonValue>;
	startedAt: string;
	endedAt?: string | null;
	endedAtNode?: string | null;
	inputs?: Record<string, JsonValue>;
	workspacePath?: string;
	claim?: { claimedBy: string; claimedAt: string } | null;
	pendingHuman?: PendingHumanInteraction | null;
	history?: RunEventBase[];
	workflowSnapshotYaml?: string | null;
}

export interface RunCreateInput {
	id: string;
	workflowId: string;
	snapshotHash: string;
	currentNodeId: string;
	context?: Record<string, JsonValue>;
	inputs?: Record<string, JsonValue>;
	workspacePath: string;
	status?: RunStatus;
	workflowSnapshotYaml?: string | null;
}

export interface RunStore {
	create(run: RunCreateInput): Promise<RunState>;
	load(runId: string): Promise<RunState>;
	save(runState: RunState): Promise<void>;
	appendEvent(runId: string, event: Omit<RunEventBase, 'seq'>): Promise<{ seq: number }>;
	claimRunnable(cap: number): Promise<RunState | null>;
	listInterrupted(): Promise<RunState[]>;
	putPendingHuman(...args: unknown[]): Promise<void>;
	takePendingHuman(runId: string, submission: { signal: string; payload?: JsonValue }): Promise<{ signal: string; output?: unknown }>;
}

export interface ArtifactMeta {
	runId: string;
	name: string;
	path: string;
	contentHash: string;
	version: number;
	authoringNode: string;
	ts: string;
}

export interface ArtifactStore {
	read(runId: string, name: string): Promise<string>;
	write(runId: string, name: string, contents: string): Promise<void>;
	exists(runId: string, name: string): Promise<boolean>;
	metadata(runId: string, name: string): Promise<ArtifactMeta>;
}

export interface Clock {
	now(): Date;
}

export class PostgresClock implements Clock {
	now(): Date {
		return new Date();
	}
}

export class ConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConflictError';
	}
}

export interface PersistenceOptions extends PoolConfig {
	connectionString?: string;
	mirrorRoot?: string;
	claimOwner?: string;
	workspaceRoot?: string;
}

interface RunRow {
	id: string;
	workflow_id: string;
	snapshot_hash: string;
	status: RunStatus;
	current_node_id: string;
	context: unknown;
	started_at: string | Date;
	ended_at: string | Date | null;
	ended_at_node: string | null;
	inputs: unknown;
	workspace_path: string | null;
	claimed_by: string | null;
	claimed_at: string | Date | null;
	workflow_snapshot_yaml: string | null;
}

interface EventRow {
	seq: string | number;
	type: string;
	ts: string | Date;
	payload: unknown;
}

interface PendingRow {
	run_id: string;
	node_id: string;
	prompt: string;
	allowed_signals: unknown;
	payload_schema: unknown;
	deadline: string | Date | null;
	resolved_at: string | Date | null;
	resolved_signal: string | null;
	resolved_payload: unknown;
}

interface SequenceRow {
	seq: string | number;
}

interface ArtifactRow {
	run_id: string;
	name: string;
	path: string;
	content_hash: string;
	version: string | number;
	authoring_node: string;
	ts: string | Date;
}

function cloneValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function sha256Like(contents: string): string {
	return Buffer.from(contents, 'utf8').toString('hex');
}

function jsonColumn(value: unknown): string {
	return JSON.stringify(value ?? null);
}

function parseJson<T>(value: unknown, fallback: T): T {
	if (value === null || value === undefined) {
		return fallback;
	}
	if (typeof value === 'string') {
		return JSON.parse(value) as T;
	}
	return value as T;
}

function toIso(value: unknown): string {
	if (value instanceof Date) {
		return value.toISOString();
	}
	return new Date(String(value)).toISOString();
}

async function ensureParentDirectory(filePath: string): Promise<void> {
	await fs.mkdir(dirname(filePath), { recursive: true });
}

async function ensureDirectory(directoryPath: string): Promise<void> {
	await fs.mkdir(directoryPath, { recursive: true });
}

function runMirrorDirectory(mirrorRoot: string, runId: string): string {
	return join(mirrorRoot, 'runs', runId);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
	await ensureParentDirectory(filePath);
	await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsonLines(filePath: string, lines: unknown[]): Promise<void> {
	await ensureParentDirectory(filePath);
	await fs.writeFile(filePath, `${lines.map((line) => JSON.stringify(line)).join('\n')}${lines.length > 0 ? '\n' : ''}`, 'utf8');
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function applyMirrorState(mirrorRoot: string | undefined, runState: RunState, history: RunEventBase[]): Promise<void> {
	if (mirrorRoot === undefined) {
		return;
	}
	const directory = runMirrorDirectory(mirrorRoot, runState.id);
	await ensureDirectory(join(directory, 'workspace'));
	await writeJson(join(directory, 'run.json'), runState);
	await writeJsonLines(join(directory, 'history.jsonl'), history);
	await writeJson(join(directory, 'pending.json'), runState.pendingHuman ?? null);
	if (runState.workflowSnapshotYaml !== undefined && runState.workflowSnapshotYaml !== null) {
		await fs.writeFile(join(directory, 'workflow.snapshot.yaml'), runState.workflowSnapshotYaml, 'utf8');
	}
}

async function loadPendingHuman(queryable: Pool | PoolClient, runId: string): Promise<PendingHumanInteraction | null> {
	const pendingResult = await queryable.query(
		`select run_id, node_id, prompt, allowed_signals, payload_schema, deadline, resolved_at, resolved_signal, resolved_payload
		 from pending_human_interactions where run_id = $1 limit 1`,
		[runId]
	);
	const pendingRows = pendingResult.rows as unknown as PendingRow[];
	const pendingRow = pendingRows[0];
	if (pendingResult.rowCount === 0 || pendingRow === undefined) {
		return null;
	}
	return {
		runId: pendingRow.run_id,
		nodeId: pendingRow.node_id,
		prompt: pendingRow.prompt,
		allowedSignals: parseJson<string[]>(pendingRow.allowed_signals, []),
		payloadSchema: pendingRow.payload_schema as JsonValue | undefined,
		deadline: pendingRow.deadline === null ? null : toIso(pendingRow.deadline),
		resolvedAt: pendingRow.resolved_at === null ? null : toIso(pendingRow.resolved_at),
		resolvedSignal: pendingRow.resolved_signal,
		resolvedPayload: pendingRow.resolved_payload as JsonValue | undefined
	};
}

async function loadHistory(queryable: Pool | PoolClient, runId: string): Promise<RunEventBase[]> {
	const eventResult = await queryable.query('select seq, type, ts, payload from run_events where run_id = $1 order by seq asc', [runId]);
	return (eventResult.rows as unknown as EventRow[]).map((row) => ({
		seq: Number(row.seq),
		type: row.type,
		ts: toIso(row.ts),
		payload: parseJson<Record<string, JsonValue>>(row.payload, {})
	}));
}

function rowToRunState(row: RunRow, history: RunEventBase[], pendingHuman: PendingHumanInteraction | null): RunState {
	return {
		id: row.id,
		workflowId: row.workflow_id,
		snapshotHash: row.snapshot_hash,
		status: row.status,
		currentNodeId: row.current_node_id,
		context: parseJson<Record<string, JsonValue>>(row.context, {}),
		startedAt: toIso(row.started_at),
		endedAt: row.ended_at === null ? null : toIso(row.ended_at),
		endedAtNode: row.ended_at_node ?? null,
		inputs: parseJson<Record<string, JsonValue>>(row.inputs, {}),
		workspacePath: row.workspace_path ?? undefined,
		claim: row.claimed_by === null ? null : { claimedBy: row.claimed_by, claimedAt: toIso(row.claimed_at) },
		pendingHuman,
		history,
		workflowSnapshotYaml: row.workflow_snapshot_yaml ?? null
	};
}

export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await work(client);
		await client.query('COMMIT');
		return result;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

/**
 * Resolves a project row by slug, auto-provisioning it if absent (Story 4.2).
 * Never an explicit tool call itself -- callers (e.g. MCP session binding)
 * invoke this once per session bind. Calling this twice with the same slug
 * returns the same project id both times without erroring.
 */
export async function ensureProject(pool: Pool, slug: string): Promise<string> {
	const insertResult = await pool.query<{ id: string }>(
		`insert into spec_pipeline.projects (slug) values ($1)
		 on conflict (slug) do nothing
		 returning id`,
		[slug]
	);
	const insertedRow = insertResult.rows[0];
	if (insertResult.rowCount > 0 && insertedRow !== undefined) {
		return insertedRow.id;
	}
	const selectResult = await pool.query<{ id: string }>(`select id from spec_pipeline.projects where slug = $1`, [slug]);
	const existingRow = selectResult.rows[0];
	if (existingRow === undefined) {
		throw new Error(`ensureProject: project not found after insert conflict for slug: ${slug}`);
	}
	return existingRow.id;
}

export interface ProjectRecord {
	id: string;
	slug: string;
	displayName: string | null;
	createdAt: string;
}

/**
 * Lists every project known to the server, newest-created last. Plain and
 * unscoped by design -- for troubleshooting/orientation across projects, not
 * for a session's own bound project (that's `ensureProject`).
 */
export async function listProjects(pool: Pool): Promise<ProjectRecord[]> {
	const result = await pool.query<{ id: string; slug: string; display_name: string | null; created_at: Date }>(
		`select id, slug, display_name, created_at from spec_pipeline.projects order by created_at asc`
	);
	return result.rows.map((row) => ({
		id: row.id,
		slug: row.slug,
		displayName: row.display_name,
		createdAt: row.created_at.toISOString()
	}));
}

export class PostgresRunStore implements RunStore {
	private readonly pool: Pool;
	private readonly mirrorRoot?: string;
	private readonly claimOwner: string;

	constructor(options: PersistenceOptions) {
		this.pool = new Pool(options);
		this.mirrorRoot = options.mirrorRoot;
		this.claimOwner = options.claimOwner ?? randomUUID();
	}

	async create(run: RunCreateInput): Promise<RunState> {
		const createdAt = new Date().toISOString();
		const status = run.status ?? 'pending';
		const state: RunState = {
			id: run.id,
			workflowId: run.workflowId,
			snapshotHash: run.snapshotHash,
			status,
			currentNodeId: run.currentNodeId,
			context: cloneValue(run.context ?? {}),
			startedAt: createdAt,
			endedAt: null,
			endedAtNode: null,
			inputs: cloneValue(run.inputs ?? {}),
			workspacePath: run.workspacePath,
			claim: null,
			pendingHuman: null,
			history: [],
			workflowSnapshotYaml: run.workflowSnapshotYaml ?? null
		};

		await withTransaction(this.pool, async (client) => {
			await client.query(
				`insert into runs (
					id, workflow_id, snapshot_hash, status, current_node_id, context, inputs, started_at,
					ended_at, ended_at_node, workspace_path, claimed_by, claimed_at, workflow_snapshot_yaml
				) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::timestamptz,$9::timestamptz,$10,$11,$12,$13,$14)`,
				[
					state.id,
					state.workflowId,
					state.snapshotHash,
					state.status,
					state.currentNodeId,
					jsonColumn(state.context),
					jsonColumn(state.inputs),
					state.startedAt,
					state.endedAt,
					state.endedAtNode,
					state.workspacePath,
					null,
					null,
					state.workflowSnapshotYaml
				]
			);
			await client.query(`delete from run_locks where run_id = $1`, [state.id]);
			await client.query(`insert into run_events (run_id, seq, type, ts, payload) values ($1, 0, 'run_created', $2::timestamptz, $3::jsonb)`, [state.id, createdAt, jsonColumn({})]);
		});

		if (run.workspacePath !== undefined) {
			await ensureDirectory(run.workspacePath);
		}
		await applyMirrorState(this.mirrorRoot, state, []);
		return state;
	}

	async load(runId: string): Promise<RunState> {
		const runResult = await this.pool.query('select * from runs where id = $1', [runId]);
		if (runResult.rowCount === 0) {
			throw new Error(`Run not found: ${runId}`);
		}
		const history = await loadHistory(this.pool, runId);
		const pending = await loadPendingHuman(this.pool, runId);
		const runRow = runResult.rows[0] as RunRow | undefined;
		if (runRow === undefined) {
			throw new Error(`Run not found: ${runId}`);
		}
		return rowToRunState(runRow, history, pending);
	}

	async save(runState: RunState): Promise<void> {
		await withTransaction(this.pool, async (client) => {
			await client.query(
				`update runs set
					workflow_id = $2,
					snapshot_hash = $3,
					status = $4,
					current_node_id = $5,
					context = $6::jsonb,
					ended_at = $7::timestamptz,
					ended_at_node = $8,
					inputs = $9::jsonb,
					workspace_path = $10,
					claimed_by = $11,
					claimed_at = $12::timestamptz,
					workflow_snapshot_yaml = $13
				where id = $1`,
				[
					runState.id,
					runState.workflowId,
					runState.snapshotHash,
					runState.status,
					runState.currentNodeId,
					jsonColumn(runState.context),
					runState.endedAt ?? null,
					runState.endedAtNode ?? null,
					jsonColumn(runState.inputs ?? {}),
					runState.workspacePath ?? null,
					runState.claim?.claimedBy ?? null,
					runState.claim?.claimedAt ?? null,
					runState.workflowSnapshotYaml ?? null
				]
			);
			await client.query('delete from run_locks where run_id = $1', [runState.id]);
		});
		const reloaded = await this.load(runState.id);
		await applyMirrorState(this.mirrorRoot, reloaded, reloaded.history ?? []);
	}

	async appendEvent(runId: string, event: Omit<RunEventBase, 'seq'>): Promise<{ seq: number }> {
		return await withTransaction(this.pool, async (client) => {
			const result = await client.query('select coalesce(max(seq), 0) as seq from run_events where run_id = $1', [runId]);
			const sequenceRow = result.rows[0] as SequenceRow | undefined;
			const nextSeq = Number(sequenceRow?.seq ?? 0) + 1;
			await client.query('insert into run_events (run_id, seq, type, ts, payload) values ($1, $2, $3, $4::timestamptz, $5::jsonb)', [runId, nextSeq, event.type, event.ts, jsonColumn(event.payload)]);
			return { seq: nextSeq };
		});
	}

	async claimRunnable(cap: number): Promise<RunState | null> {
		if (cap <= 0) {
			return null;
		}
		return await withTransaction(this.pool, async (client) => {
			const claimResult = await client.query(
				`select r.*
				 from runs r
				 left join run_locks l on l.run_id = r.id
				 where r.status in ('pending', 'interrupted')
				   and l.run_id is null
				 order by r.started_at asc
				 for update of r skip locked
				 limit 1`
			);
			if (claimResult.rowCount === 0) {
				return null;
			}
			const row = claimResult.rows[0] as RunRow | undefined;
			if (row === undefined) {
				return null;
			}
			const claimedAt = new Date().toISOString();
			await client.query('insert into run_locks (run_id, claimed_by, claimed_at) values ($1, $2, $3::timestamptz)', [row.id, this.claimOwner, claimedAt]);
			await client.query('update runs set status = $2, claimed_by = $3, claimed_at = $4::timestamptz where id = $1', [row.id, 'running', this.claimOwner, claimedAt]);
			const history = await loadHistory(client, row.id);
			const pending = await loadPendingHuman(client, row.id);
			return rowToRunState({ ...row, status: 'running', claimed_by: this.claimOwner, claimed_at: claimedAt } as RunRow, history, pending);
		});
	}

	async listInterrupted(): Promise<RunState[]> {
		const result = await this.pool.query(
			`select r.*
			 from runs r
			 left join run_locks l on l.run_id = r.id
			 where r.status = 'running' and l.run_id is null
			 order by r.started_at asc`
		);
		return (result.rows as unknown as RunRow[]).map((row) => rowToRunState(row, [], null));
	}

	async putPendingHuman(...args: unknown[]): Promise<void> {
		const [runId, nodeId, prompt, allowedSignals, payloadSchema, deadline] = args as [
			string,
			string,
			string,
			string[],
			JsonValue | undefined,
			string | undefined
		];
		await withTransaction(this.pool, async (client) => {
			await client.query(
				`insert into pending_human_interactions (
					run_id, node_id, prompt, allowed_signals, payload_schema, deadline, resolved_at, resolved_signal, resolved_payload
				) values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::timestamptz, null, null, null)
				on conflict (run_id) do update set
					node_id = excluded.node_id,
					prompt = excluded.prompt,
					allowed_signals = excluded.allowed_signals,
					payload_schema = excluded.payload_schema,
					deadline = excluded.deadline,
					resolved_at = null,
					resolved_signal = null,
					resolved_payload = null`,
				[runId, nodeId, prompt, jsonColumn(allowedSignals), jsonColumn(payloadSchema ?? null), deadline ?? null]
			);
			await client.query('update runs set status = $2, current_node_id = $3 where id = $1', [runId, 'waiting_human', nodeId]);
		});
	}

	async takePendingHuman(runId: string, submission: { signal: string; payload?: JsonValue }): Promise<{ signal: string; output?: unknown }> {
		return await withTransaction(this.pool, async (client) => {
			const pendingResult = await client.query(
				`select * from pending_human_interactions where run_id = $1 for update`,
				[runId]
			);
			if (pendingResult.rowCount === 0) {
				throw new Error(`Pending human interaction not found: ${runId}`);
			}
			const pending = pendingResult.rows[0] as PendingRow | undefined;
			if (pending === undefined) {
				throw new Error(`Pending human interaction not found: ${runId}`);
			}
			if (pending.resolved_at !== null) {
				throw new ConflictError(`Pending human interaction already resolved: ${runId}`);
			}
			const allowedSignals = parseJson<string[]>(pending.allowed_signals, []);
			if (!allowedSignals.includes(submission.signal)) {
				throw new Error(`Signal not allowed: ${submission.signal}`);
			}
			const resolvedAt = new Date().toISOString();
			await client.query(
				`update pending_human_interactions set resolved_at = $2::timestamptz, resolved_signal = $3, resolved_payload = $4::jsonb where run_id = $1`,
				[runId, resolvedAt, submission.signal, jsonColumn(submission.payload ?? null)]
			);
			await client.query('update runs set status = $2 where id = $1', [runId, 'interrupted']);
			return { signal: submission.signal, output: submission.payload };
		});
	}

	async close(): Promise<void> {
		await this.pool.end();
	}
}

export class PostgresArtifactStore implements ArtifactStore {
	constructor(private readonly pool: Pool, private readonly options: { mirrorRoot?: string } = {}) {}

	private async workspacePath(runId: string): Promise<string> {
		const result = await this.pool.query('select workspace_path from runs where id = $1', [runId]);
		if (result.rowCount === 0) {
			throw new Error(`Run not found: ${runId}`);
		}
		const workspaceRow = result.rows[0] as { workspace_path?: string | null } | undefined;
		const workspacePath = workspaceRow?.workspace_path;
		if (typeof workspacePath !== 'string' || workspacePath.length === 0) {
			throw new Error(`Run workspace path is missing: ${runId}`);
		}
		return workspacePath;
	}

	async read(runId: string, name: string): Promise<string> {
		const workspacePath = await this.workspacePath(runId);
		return await fs.readFile(join(workspacePath, name), 'utf8');
	}

	async write(runId: string, name: string, contents: string): Promise<void> {
		const workspacePath = await this.workspacePath(runId);
		const filePath = join(workspacePath, name);
		await ensureParentDirectory(filePath);
		await fs.writeFile(filePath, contents, 'utf8');
		const metadata: ArtifactMeta = {
			runId,
			name,
			path: filePath,
			contentHash: sha256Like(contents),
			version: 1,
			authoringNode: 'unknown',
			ts: new Date().toISOString()
		};
		await this.pool.query(
			`insert into artifacts_meta (run_id, name, path, content_hash, version, authoring_node, ts)
			 values ($1,$2,$3,$4,$5,$6,$7::timestamptz)
			 on conflict (run_id, name) do update set
				path = excluded.path,
				content_hash = excluded.content_hash,
				version = artifacts_meta.version + 1,
				authoring_node = excluded.authoring_node,
				ts = excluded.ts`,
			[
				runId,
				name,
				metadata.path,
				metadata.contentHash,
				metadata.version,
				metadata.authoringNode,
				metadata.ts
			]
		);
		if (this.options.mirrorRoot !== undefined) {
			await ensureDirectory(join(this.options.mirrorRoot, 'runs', runId, 'workspace'));
		}
	}

	async exists(runId: string, name: string): Promise<boolean> {
		const workspacePath = await this.workspacePath(runId);
		return await fileExists(join(workspacePath, name));
	}

	async metadata(runId: string, name: string): Promise<ArtifactMeta> {
		const result = await this.pool.query('select * from artifacts_meta where run_id = $1 and name = $2', [runId, name]);
		if (result.rowCount === 0) {
			throw new Error(`Artifact metadata not found: ${name}`);
		}
		const row = result.rows[0] as ArtifactRow | undefined;
		if (row === undefined) {
			throw new Error(`Artifact metadata not found: ${name}`);
		}
		return {
			runId: row.run_id,
			name: row.name,
			path: row.path,
			contentHash: row.content_hash,
			version: Number(row.version),
			authoringNode: row.authoring_node,
			ts: toIso(row.ts)
		};
	}
}

export interface PersistenceBundle {
	runStore: PostgresRunStore;
	artifactStore: PostgresArtifactStore;
	clock: Clock;
	pool: Pool;
}

export function createPersistenceBundle(options: PersistenceOptions): PersistenceBundle {
	const pool = new Pool(options);
	return {
		runStore: new PostgresRunStore(options),
		artifactStore: new PostgresArtifactStore(pool, { mirrorRoot: options.mirrorRoot }),
		clock: new PostgresClock(),
		pool
	};
}

export async function createEphemeralDatabaseName(prefix = 'rig'): Promise<string> {
	return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export * from './library-store.js';
export * from './spec-repository.js';
export * from './trail-repository.js';
export * from './spec-change-emitter.js';
