/// <reference path="./pg.d.ts" />
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
export class PostgresClock {
    now() {
        return new Date();
    }
}
export class ConflictError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ConflictError';
    }
}
function cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
}
function sha256Like(contents) {
    return Buffer.from(contents, 'utf8').toString('hex');
}
function jsonColumn(value) {
    return JSON.stringify(value ?? null);
}
function parseJson(value, fallback) {
    if (value === null || value === undefined) {
        return fallback;
    }
    if (typeof value === 'string') {
        return JSON.parse(value);
    }
    return value;
}
function toIso(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }
    return new Date(String(value)).toISOString();
}
async function ensureParentDirectory(filePath) {
    await fs.mkdir(dirname(filePath), { recursive: true });
}
async function ensureDirectory(directoryPath) {
    await fs.mkdir(directoryPath, { recursive: true });
}
function runMirrorDirectory(mirrorRoot, runId) {
    return join(mirrorRoot, 'runs', runId);
}
async function writeJson(filePath, value) {
    await ensureParentDirectory(filePath);
    await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
async function writeJsonLines(filePath, lines) {
    await ensureParentDirectory(filePath);
    await fs.writeFile(filePath, `${lines.map((line) => JSON.stringify(line)).join('\n')}${lines.length > 0 ? '\n' : ''}`, 'utf8');
}
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function applyMirrorState(mirrorRoot, runState, history) {
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
function rowToRunState(row, history, pendingHuman) {
    return {
        id: row.id,
        workflowId: row.workflow_id,
        snapshotHash: row.snapshot_hash,
        status: row.status,
        currentNodeId: row.current_node_id,
        context: parseJson(row.context, {}),
        startedAt: toIso(row.started_at),
        endedAt: row.ended_at === null ? null : toIso(row.ended_at),
        endedAtNode: row.ended_at_node ?? null,
        inputs: parseJson(row.inputs, {}),
        workspacePath: row.workspace_path ?? undefined,
        claim: row.claimed_by === null ? null : { claimedBy: row.claimed_by, claimedAt: toIso(row.claimed_at) },
        pendingHuman,
        history,
        workflowSnapshotYaml: row.workflow_snapshot_yaml ?? null
    };
}
async function withTransaction(pool, work) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
export async function applyMigrations(pool, migrationsDir) {
    const migrationFiles = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of migrationFiles) {
        const sql = await fs.readFile(join(migrationsDir, file), 'utf8');
        await pool.query(sql);
    }
}
export class PostgresRunStore {
    constructor(options) {
        Object.defineProperty(this, "pool", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "mirrorRoot", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "claimOwner", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.pool = new Pool(options);
        this.mirrorRoot = options.mirrorRoot;
        this.claimOwner = options.claimOwner ?? randomUUID();
    }
    async create(run) {
        const createdAt = new Date().toISOString();
        const status = run.status ?? 'pending';
        const state = {
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
            await client.query(`insert into runs (
					id, workflow_id, snapshot_hash, status, current_node_id, context, inputs, started_at,
					ended_at, ended_at_node, workspace_path, claimed_by, claimed_at, workflow_snapshot_yaml
				) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::timestamptz,$9::timestamptz,$10,$11,$12,$13,$14)`, [
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
            ]);
            await client.query(`delete from run_locks where run_id = $1`, [state.id]);
            await client.query(`insert into run_events (run_id, seq, type, ts, payload) values ($1, 0, 'run_created', $2::timestamptz, $3::jsonb)`, [state.id, createdAt, jsonColumn({})]);
        });
        if (run.workspacePath !== undefined) {
            await ensureDirectory(run.workspacePath);
        }
        await applyMirrorState(this.mirrorRoot, state, []);
        return state;
    }
    async load(runId) {
        const runResult = await this.pool.query('select * from runs where id = $1', [runId]);
        if (runResult.rowCount === 0) {
            throw new Error(`Run not found: ${runId}`);
        }
        const eventResult = await this.pool.query('select seq, type, ts, payload from run_events where run_id = $1 order by seq asc', [runId]);
        const pendingResult = await this.pool.query(`select run_id, node_id, prompt, allowed_signals, payload_schema, deadline, resolved_at, resolved_signal, resolved_payload
			 from pending_human_interactions where run_id = $1 limit 1`, [runId]);
        const pendingRows = pendingResult.rows;
        const pending = pendingResult.rowCount === 0 || pendingRows[0] === undefined
            ? null
            : {
                runId: pendingRows[0].run_id,
                nodeId: pendingRows[0].node_id,
                prompt: pendingRows[0].prompt,
                allowedSignals: parseJson(pendingRows[0].allowed_signals, []),
                payloadSchema: pendingRows[0].payload_schema,
                deadline: pendingRows[0].deadline === null ? null : toIso(pendingRows[0].deadline),
                resolvedAt: pendingRows[0].resolved_at === null ? null : toIso(pendingRows[0].resolved_at),
                resolvedSignal: pendingRows[0].resolved_signal,
                resolvedPayload: pendingRows[0].resolved_payload
            };
        const history = eventResult.rows.map((row) => ({
            seq: Number(row.seq),
            type: row.type,
            ts: toIso(row.ts),
            payload: parseJson(row.payload, {})
        }));
        const runRow = runResult.rows[0];
        if (runRow === undefined) {
            throw new Error(`Run not found: ${runId}`);
        }
        return rowToRunState(runRow, history, pending);
    }
    async save(runState) {
        await withTransaction(this.pool, async (client) => {
            await client.query(`update runs set
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
				where id = $1`, [
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
            ]);
            await client.query('delete from run_locks where run_id = $1', [runState.id]);
        });
        const reloaded = await this.load(runState.id);
        await applyMirrorState(this.mirrorRoot, reloaded, reloaded.history ?? []);
    }
    async appendEvent(runId, event) {
        return await withTransaction(this.pool, async (client) => {
            const result = await client.query('select coalesce(max(seq), 0) as seq from run_events where run_id = $1', [runId]);
            const sequenceRow = result.rows[0];
            const nextSeq = Number(sequenceRow?.seq ?? 0) + 1;
            await client.query('insert into run_events (run_id, seq, type, ts, payload) values ($1, $2, $3, $4::timestamptz, $5::jsonb)', [runId, nextSeq, event.type, event.ts, jsonColumn(event.payload)]);
            return { seq: nextSeq };
        });
    }
    async claimRunnable(cap) {
        if (cap <= 0) {
            return null;
        }
        return await withTransaction(this.pool, async (client) => {
            const claimResult = await client.query(`select r.*
				 from runs r
				 left join run_locks l on l.run_id = r.id
				 where r.status in ('pending', 'interrupted')
				   and l.run_id is null
				 order by r.started_at asc
				 for update skip locked
				 limit 1`);
            if (claimResult.rowCount === 0) {
                return null;
            }
            const row = claimResult.rows[0];
            if (row === undefined) {
                return null;
            }
            const claimedAt = new Date().toISOString();
            await client.query('insert into run_locks (run_id, claimed_by, claimed_at) values ($1, $2, $3::timestamptz)', [row.id, this.claimOwner, claimedAt]);
            await client.query('update runs set status = $2, claimed_by = $3, claimed_at = $4::timestamptz where id = $1', [row.id, 'running', this.claimOwner, claimedAt]);
            return rowToRunState({ ...row, status: 'running', claimed_by: this.claimOwner, claimed_at: claimedAt }, [], null);
        });
    }
    async listInterrupted() {
        const result = await this.pool.query(`select r.*
			 from runs r
			 left join run_locks l on l.run_id = r.id
			 where r.status = 'running' and l.run_id is null
			 order by r.started_at asc`);
        return result.rows.map((row) => rowToRunState(row, [], null));
    }
    async putPendingHuman(...args) {
        const [runId, nodeId, prompt, allowedSignals, payloadSchema, deadline] = args;
        await withTransaction(this.pool, async (client) => {
            await client.query(`insert into pending_human_interactions (
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
					resolved_payload = null`, [runId, nodeId, prompt, jsonColumn(allowedSignals), jsonColumn(payloadSchema ?? null), deadline ?? null]);
            await client.query('update runs set status = $2, current_node_id = $3 where id = $1', [runId, 'waiting_human', nodeId]);
        });
    }
    async takePendingHuman(runId, submission) {
        return await withTransaction(this.pool, async (client) => {
            const pendingResult = await client.query(`select * from pending_human_interactions where run_id = $1 for update`, [runId]);
            if (pendingResult.rowCount === 0) {
                throw new Error(`Pending human interaction not found: ${runId}`);
            }
            const pending = pendingResult.rows[0];
            if (pending === undefined) {
                throw new Error(`Pending human interaction not found: ${runId}`);
            }
            if (pending.resolved_at !== null) {
                throw new ConflictError(`Pending human interaction already resolved: ${runId}`);
            }
            const allowedSignals = parseJson(pending.allowed_signals, []);
            if (!allowedSignals.includes(submission.signal)) {
                throw new Error(`Signal not allowed: ${submission.signal}`);
            }
            const resolvedAt = new Date().toISOString();
            await client.query(`update pending_human_interactions set resolved_at = $2::timestamptz, resolved_signal = $3, resolved_payload = $4::jsonb where run_id = $1`, [runId, resolvedAt, submission.signal, jsonColumn(submission.payload ?? null)]);
            await client.query('update runs set status = $2 where id = $1', [runId, 'running']);
            return { signal: submission.signal, output: submission.payload };
        });
    }
    async close() {
        await this.pool.end();
    }
}
export class PostgresArtifactStore {
    constructor(pool, options = {}) {
        Object.defineProperty(this, "pool", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: pool
        });
        Object.defineProperty(this, "options", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: options
        });
    }
    async workspacePath(runId) {
        const result = await this.pool.query('select workspace_path from runs where id = $1', [runId]);
        if (result.rowCount === 0) {
            throw new Error(`Run not found: ${runId}`);
        }
        const workspaceRow = result.rows[0];
        const workspacePath = workspaceRow?.workspace_path;
        if (typeof workspacePath !== 'string' || workspacePath.length === 0) {
            throw new Error(`Run workspace path is missing: ${runId}`);
        }
        return workspacePath;
    }
    async read(runId, name) {
        const workspacePath = await this.workspacePath(runId);
        return await fs.readFile(join(workspacePath, name), 'utf8');
    }
    async write(runId, name, contents) {
        const workspacePath = await this.workspacePath(runId);
        const filePath = join(workspacePath, name);
        await ensureParentDirectory(filePath);
        await fs.writeFile(filePath, contents, 'utf8');
        const metadata = {
            runId,
            name,
            path: filePath,
            contentHash: sha256Like(contents),
            version: 1,
            authoringNode: 'unknown',
            ts: new Date().toISOString()
        };
        await this.pool.query(`insert into artifacts_meta (run_id, name, path, content_hash, version, authoring_node, ts)
			 values ($1,$2,$3,$4,$5,$6,$7::timestamptz)
			 on conflict (run_id, name) do update set
				path = excluded.path,
				content_hash = excluded.content_hash,
				version = artifacts_meta.version + 1,
				authoring_node = excluded.authoring_node,
				ts = excluded.ts`, [
            runId,
            name,
            metadata.path,
            metadata.contentHash,
            metadata.version,
            metadata.authoringNode,
            metadata.ts
        ]);
        if (this.options.mirrorRoot !== undefined) {
            await ensureDirectory(join(this.options.mirrorRoot, 'runs', runId, 'workspace'));
        }
    }
    async exists(runId, name) {
        const workspacePath = await this.workspacePath(runId);
        return await fileExists(join(workspacePath, name));
    }
    async metadata(runId, name) {
        const result = await this.pool.query('select * from artifacts_meta where run_id = $1 and name = $2', [runId, name]);
        if (result.rowCount === 0) {
            throw new Error(`Artifact metadata not found: ${name}`);
        }
        const row = result.rows[0];
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
export function createPersistenceBundle(options) {
    const pool = new Pool(options);
    return {
        runStore: new PostgresRunStore(options),
        artifactStore: new PostgresArtifactStore(pool, { mirrorRoot: options.mirrorRoot }),
        clock: new PostgresClock(),
        pool
    };
}
export async function createEphemeralDatabaseName(prefix = 'rig') {
    return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}
