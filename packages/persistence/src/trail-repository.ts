/// <reference path="./pg.d.ts" />

import type { Pool, PoolClient } from 'pg';

import { withTransaction } from './index.js';
import {
	SpecRepositoryError,
	deriveCurrentStage,
	deriveTasksAggregateStatus,
	insertAuditLogRow,
	toIso,
	wrapConstraintViolation,
	type AuditInfo
} from './spec-repository.js';
import type { SpecRecord } from './spec-repository.js';
import type { SpecChangeEmitter, SpecChangeEvent } from './spec-change-emitter.js';

/**
 * `TrailRepository`: the persistence query layer for the `discovery` schema — the
 * trails domain the grilling and wayfinder skills both write into. A TRAIL is one
 * effort to turn a loose idea into a destination; a WAYPOINT is one question being
 * driven to a decision. See spec-templates/spec/db/schema.sql PART 2 for the DDL
 * and the design model this implements.
 *
 * Mirrors `SpecRepository`'s conventions exactly: every mutation runs inside
 * `withTransaction` and inserts one `spec_pipeline.audit_log` row per mutated row
 * in that same transaction (`table_name` schema-qualified, e.g.
 * 'discovery.waypoints'); rejections callers must distinguish throw
 * `SpecRepositoryError` with a stable `rule`; change events are emitted only
 * after commit.
 *
 * The claim TTL is *not* schema: `claimed_at` is the only stored fact, and the
 * claim/frontier queries treat a claim older than `claimTtlHours`
 * (RIG_CLAIM_TTL, default 24) as reclaimable inside the same atomic
 * UPDATE — no separate steal step.
 */

export const DEFAULT_CLAIM_TTL_HOURS = 24;

export type TrailStatus = 'active' | 'complete' | 'abandoned';
export type TrailOutcomeKind = 'spec' | 'decision' | 'change';
export type WaypointStatus = 'sighted' | 'marked' | 'claimed' | 'reached' | 'bypassed';
export type WaypointApproach = 'grilling' | 'research' | 'prototype' | 'task';

// =============================================================================
// Record / row types
// =============================================================================

export interface TrailRecord {
	id: string;
	projectId: string;
	slug: string;
	title: string;
	trailheadPrompt: string;
	destination: string | null;
	notes: string | null;
	status: TrailStatus;
	outcomeKind: TrailOutcomeKind | null;
	outcomeSpecId: string | null;
	outcomeSummary: string | null;
	sessionId: string | null;
	createdAt: string;
	updatedAt: string;
}

interface TrailRow extends Record<string, unknown> {
	id: string;
	project_id: string;
	slug: string;
	title: string;
	trailhead_prompt: string;
	destination: string | null;
	notes: string | null;
	status: TrailStatus;
	outcome_kind: TrailOutcomeKind | null;
	outcome_spec_id: string | null;
	outcome_summary: string | null;
	session_id: string | null;
	created_at: string | Date;
	updated_at: string | Date;
}

function rowToTrail(row: TrailRow): TrailRecord {
	return {
		id: row.id,
		projectId: row.project_id,
		slug: row.slug,
		title: row.title,
		trailheadPrompt: row.trailhead_prompt,
		destination: row.destination,
		notes: row.notes,
		status: row.status,
		outcomeKind: row.outcome_kind,
		outcomeSpecId: row.outcome_spec_id,
		outcomeSummary: row.outcome_summary,
		sessionId: row.session_id,
		createdAt: toIso(row.created_at),
		updatedAt: toIso(row.updated_at)
	};
}

/** One row per wayfinder/grilling invocation (wayfinder-trail-lineage), stamped
 * explicitly by `start_session` -- no implicit/inferred session boundaries. */
export interface SessionRecord {
	id: string;
	actor: string;
	label: string | null;
	createdAt: string;
}

interface SessionRow extends Record<string, unknown> {
	id: string;
	actor: string;
	label: string | null;
	created_at: string | Date;
}

function rowToSession(row: SessionRow): SessionRecord {
	return {
		id: row.id,
		actor: row.actor,
		label: row.label,
		createdAt: toIso(row.created_at)
	};
}

export interface WaypointRecord {
	id: string;
	trailId: string;
	waypointNumber: number;
	title: string;
	question: string;
	approach: WaypointApproach | null;
	status: WaypointStatus;
	claimedBy: string | null;
	claimedAt: string | null;
	resolution: string | null;
	resolutionGist: string | null;
	rationale: string | null;
	bypassReason: string | null;
	previousStatus: WaypointStatus | null;
	reachedIn: string | null;
	reachedAt: string | null;
	spurredToTrailId: string | null;
	createdAt: string;
	updatedAt: string;
}

interface WaypointRow extends Record<string, unknown> {
	id: string;
	trail_id: string;
	waypoint_number: number | string;
	title: string;
	question: string;
	approach: WaypointApproach | null;
	status: WaypointStatus;
	claimed_by: string | null;
	claimed_at: string | Date | null;
	resolution: string | null;
	resolution_gist: string | null;
	rationale: string | null;
	bypass_reason: string | null;
	previous_status: WaypointStatus | null;
	reached_in: string | null;
	reached_at: string | Date | null;
	spurred_to_trail_id: string | null;
	created_at: string | Date;
	updated_at: string | Date;
}

function rowToWaypoint(row: WaypointRow): WaypointRecord {
	return {
		id: row.id,
		trailId: row.trail_id,
		waypointNumber: Number(row.waypoint_number),
		title: row.title,
		question: row.question,
		approach: row.approach,
		status: row.status,
		claimedBy: row.claimed_by,
		claimedAt: row.claimed_at === null ? null : toIso(row.claimed_at),
		resolution: row.resolution,
		resolutionGist: row.resolution_gist,
		rationale: row.rationale,
		bypassReason: row.bypass_reason,
		previousStatus: row.previous_status,
		reachedIn: row.reached_in,
		reachedAt: row.reached_at === null ? null : toIso(row.reached_at),
		spurredToTrailId: row.spurred_to_trail_id,
		createdAt: toIso(row.created_at),
		updatedAt: toIso(row.updated_at)
	};
}

export interface WaypointDependencyEdgeRecord {
	id: string;
	fromWaypointId: string;
	toWaypointId: string;
	createdAt: string;
}

interface WaypointDependencyEdgeRow extends Record<string, unknown> {
	id: string;
	from_waypoint_id: string;
	to_waypoint_id: string;
	created_at: string | Date;
}

function rowToWaypointDependencyEdge(row: WaypointDependencyEdgeRow): WaypointDependencyEdgeRecord {
	return {
		id: row.id,
		fromWaypointId: row.from_waypoint_id,
		toWaypointId: row.to_waypoint_id,
		createdAt: toIso(row.created_at)
	};
}

export interface WaypointAssetRecord {
	id: string;
	waypointId: string;
	ordinal: number;
	kind: string;
	title: string;
	contentMarkdown: string | null;
	repoPath: string | null;
	commitSha: string | null;
	createdAt: string;
}

interface WaypointAssetRow extends Record<string, unknown> {
	id: string;
	waypoint_id: string;
	ordinal: number | string;
	kind: string;
	title: string;
	content_markdown: string | null;
	repo_path: string | null;
	commit_sha: string | null;
	created_at: string | Date;
}

function rowToWaypointAsset(row: WaypointAssetRow): WaypointAssetRecord {
	return {
		id: row.id,
		waypointId: row.waypoint_id,
		ordinal: Number(row.ordinal),
		kind: row.kind,
		title: row.title,
		contentMarkdown: row.content_markdown,
		repoPath: row.repo_path,
		commitSha: row.commit_sha,
		createdAt: toIso(row.created_at)
	};
}

export interface TrailTermRecord {
	id: string;
	trailId: string;
	term: string;
	definition: string;
	createdAt: string;
	updatedAt: string;
}

interface TrailTermRow extends Record<string, unknown> {
	id: string;
	trail_id: string;
	term: string;
	definition: string;
	created_at: string | Date;
	updated_at: string | Date;
}

function rowToTrailTerm(row: TrailTermRow): TrailTermRecord {
	return {
		id: row.id,
		trailId: row.trail_id,
		term: row.term,
		definition: row.definition,
		createdAt: toIso(row.created_at),
		updatedAt: toIso(row.updated_at)
	};
}

/** The linked spec's downstream state, surfaced (never mutated) by `reopenTrail`
 * so the caller can see what's built on top of a completion before undoing it. */
export interface TrailSpecStatus {
	specId: string;
	currentStage: string;
	stages: { stageName: string; status: string; updatedAt: string }[];
}

/**
 * The whole picture of a trail in one read: the computed map sections the old
 * wayfinder map file maintained by hand. Every section is a query over waypoint
 * status — stored once, never able to drift.
 */
export interface TrailMap {
	trail: TrailRecord;
	/** Decisions so far: reached waypoints in the order they were reached. */
	decisions: WaypointRecord[];
	/** The frontier: marked (or stale-claimed) waypoints with every blocker terminated. */
	frontier: WaypointRecord[];
	/** Fog of war: sighted waypoints — questions too loose to claim yet. */
	fog: WaypointRecord[];
	/** Out of scope: bypassed waypoints, each with its reason. */
	outOfScope: WaypointRecord[];
	/** Currently live (non-stale) claims. */
	claimed: WaypointRecord[];
	terms: TrailTermRecord[];
	edges: WaypointDependencyEdgeRecord[];
}

// =============================================================================
// TrailRepository
// =============================================================================

export interface TrailRepositoryOptions {
	/** Hours after which a claim is considered stale and reclaimable (RIG_CLAIM_TTL). */
	claimTtlHours?: number;
}

export class TrailRepository {
	private readonly pool: Pool;
	private readonly emitter: SpecChangeEmitter | undefined;
	private readonly claimTtlHours: number;

	constructor(pool: Pool, emitter?: SpecChangeEmitter, options?: TrailRepositoryOptions) {
		this.pool = pool;
		this.emitter = emitter;
		this.claimTtlHours = options?.claimTtlHours ?? DEFAULT_CLAIM_TTL_HOURS;
	}

	private async withTx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
		return await withTransaction(this.pool, work);
	}

	/** Always called *after* the mutation's `withTx` has resolved (i.e. committed),
	 * never from inside the transaction callback, so a rolled-back mutation never emits. */
	private emitChange(event: SpecChangeEvent): void {
		this.emitter?.emit(event);
	}

	private async requireWaypoint(client: PoolClient, waypointId: string): Promise<WaypointRow> {
		const result = await client.query<WaypointRow>(`select * from discovery.waypoints where id = $1`, [waypointId]);
		const row = result.rows[0];
		if (row === undefined) {
			throw new SpecRepositoryError('not_found', `waypoint not found: ${waypointId}`);
		}
		return row;
	}

	// ---------------------------------------------------------------------------
	// Sessions (one row per wayfinder/grilling invocation)
	// ---------------------------------------------------------------------------

	/** Stamps one row for this invocation, explicitly -- no implicit/inferred session
	 * boundaries. The wayfinder skill calls this once per invocation and threads the
	 * returned id into every `createTrail` call that conversation makes. */
	async startSession(label: string | undefined, audit: AuditInfo): Promise<SessionRecord> {
		return await this.withTx(async (client) => {
			const result = await client.query<SessionRow>(
				`insert into discovery.sessions (actor, label) values ($1, $2) returning *`,
				[audit.actor, label ?? null]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new Error('startSession: insert did not return a row');
			}
			await insertAuditLogRow(client, audit, 'insert', 'discovery.sessions', row.id);
			return rowToSession(row);
		});
	}

	// ---------------------------------------------------------------------------
	// Trails
	// ---------------------------------------------------------------------------

	async createTrail(
		input: {
			projectId: string;
			slug: string;
			title: string;
			trailheadPrompt: string;
			destination?: string;
			notes?: string;
			/** Which wayfinder/grilling invocation (start_session) chartered this trail; NULL for
			 * trails predating wayfinder-trail-lineage (no backfill). */
			sessionId?: string;
		},
		audit: AuditInfo
	): Promise<TrailRecord> {
		const trail = await this.withTx(async (client) => {
			try {
				const result = await client.query<TrailRow>(
					`insert into discovery.trails (project_id, slug, title, trailhead_prompt, destination, notes, session_id)
					 values ($1, $2, $3, $4, $5, $6, $7) returning *`,
					[input.projectId, input.slug, input.title, input.trailheadPrompt, input.destination ?? null, input.notes ?? null, input.sessionId ?? null]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('createTrail: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'discovery.trails', row.id);
				return rowToTrail(row);
			} catch (error) {
				wrapConstraintViolation(error, 'create_trail');
			}
		});
		this.emitChange({ type: 'trail_changed', trailId: trail.id });
		return trail;
	}

	async getTrail(trailId: string): Promise<TrailRecord | null> {
		const result = await this.pool.query<TrailRow>(`select * from discovery.trails where id = $1`, [trailId]);
		const row = result.rows[0];
		return row === undefined ? null : rowToTrail(row);
	}

	async getTrailBySlug(projectId: string, slug: string): Promise<TrailRecord | null> {
		const result = await this.pool.query<TrailRow>(
			`select * from discovery.trails where project_id = $1 and slug = $2`,
			[projectId, slug]
		);
		const row = result.rows[0];
		return row === undefined ? null : rowToTrail(row);
	}

	/** Resolves a spec's discovery provenance through `outcome_spec_id`
	 * (`trails_one_per_spec` guarantees at most one row) — the requirements-compiler
	 * read path: its decisions transcript is this trail's reached waypoints. */
	async getTrailBySpec(specId: string): Promise<TrailRecord | null> {
		const result = await this.pool.query<TrailRow>(`select * from discovery.trails where outcome_spec_id = $1`, [specId]);
		const row = result.rows[0];
		return row === undefined ? null : rowToTrail(row);
	}

	async listTrails(projectId: string): Promise<TrailRecord[]> {
		const result = await this.pool.query<TrailRow>(
			`select * from discovery.trails where project_id = $1 order by created_at asc`,
			[projectId]
		);
		return result.rows.map(rowToTrail);
	}

	async updateTrail(
		trailId: string,
		input: Partial<{ title: string; destination: string | null; notes: string | null }>,
		audit: AuditInfo
	): Promise<TrailRecord> {
		const trail = await this.withTx(async (client) => {
			const result = await client.query<TrailRow>(
				`update discovery.trails
				 set title = coalesce($2, title),
				     destination = case when $4 then $3 else destination end,
				     notes = case when $6 then $5 else notes end
				 where id = $1 returning *`,
				[trailId, input.title ?? null, input.destination ?? null, 'destination' in input, input.notes ?? null, 'notes' in input]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `trail not found: ${trailId}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'discovery.trails', row.id);
			return rowToTrail(row);
		});
		this.emitChange({ type: 'trail_changed', trailId: trail.id });
		return trail;
	}

	/**
	 * Completes an active trail with its outcome. For `outcomeKind = 'spec'` this is
	 * the handoff (cross-schema touchpoint 2): the spec is created AND
	 * `outcome_spec_id` linked in this same transaction — the only write that crosses
	 * the schema boundary. requirements-compiler then reads back through
	 * `getTrailBySpec` and never mutates trails.
	 */
	async completeTrail(
		trailId: string,
		input: { outcomeKind: TrailOutcomeKind; outcomeSummary?: string; spec?: { slug: string; featureName: string } },
		audit: AuditInfo
	): Promise<{ trail: TrailRecord; spec: SpecRecord | null }> {
		if (input.outcomeKind === 'spec' && input.spec === undefined) {
			throw new SpecRepositoryError('spec_input_required', "complete_trail: outcomeKind 'spec' requires specSlug and featureName");
		}
		if (input.outcomeKind !== 'spec' && input.spec !== undefined) {
			throw new SpecRepositoryError('spec_input_forbidden', `complete_trail: spec creation only applies to outcomeKind 'spec', got '${input.outcomeKind}'`);
		}
		// `currentStage` is derived live (spec-stage-tracking-fixes W1), never read off
		// the row's `current_stage` column -- that column is written once at spec
		// creation and never updated again, and this mapper runs both for a spec freshly
		// inserted here AND for one being reused on re-completion (which may be well past
		// 'requirements' by now).
		const mapSpecRow = async (client: PoolClient, specRow: Record<string, unknown>): Promise<SpecRecord> => ({
			id: specRow.id as string,
			projectId: specRow.project_id as string | null,
			slug: specRow.slug as string,
			featureName: specRow.feature_name as string,
			currentStage: await deriveCurrentStage(client, specRow.id as string),
			createdAt: toIso(specRow.created_at as string | Date),
			updatedAt: toIso(specRow.updated_at as string | Date)
		});
		const completed = await this.withTx(async (client) => {
			try {
				let spec: SpecRecord | null = null;
				if (input.spec !== undefined) {
					const trailResult = await client.query<{ project_id: string; status: TrailStatus; outcome_spec_id: string | null }>(
						`select project_id, status, outcome_spec_id from discovery.trails where id = $1`,
						[trailId]
					);
					const trailRow = trailResult.rows[0];
					if (trailRow === undefined) {
						throw new SpecRepositoryError('not_found', `trail not found: ${trailId}`);
					}
					// Re-completing a trail that was reopened after a prior spec handoff must not try to
					// re-create that same spec (its slug is already taken) — reuse it instead of inserting.
					if (trailRow.outcome_spec_id !== null) {
						const existingSpecResult = await client.query<Record<string, unknown>>(
							`select * from spec_pipeline.specs where id = $1`,
							[trailRow.outcome_spec_id]
						);
						const existingSpecRow = existingSpecResult.rows[0];
						if (existingSpecRow !== undefined && existingSpecRow.slug === input.spec.slug) {
							spec = await mapSpecRow(client, existingSpecRow);
						}
					}
					if (spec === null) {
						const specResult = await client.query<{ id: string } & Record<string, unknown>>(
							`insert into spec_pipeline.specs (project_id, slug, feature_name) values ($1, $2, $3) returning *`,
							[trailRow.project_id, input.spec.slug, input.spec.featureName]
						);
						const specRow = specResult.rows[0];
						if (specRow === undefined) {
							throw new Error('completeTrail: spec insert did not return a row');
						}
						await insertAuditLogRow(client, audit, 'insert', 'specs', specRow.id);
						spec = await mapSpecRow(client, specRow);
					}
				}
				const result = await client.query<TrailRow>(
					`update discovery.trails
					 set status = 'complete', outcome_kind = $2, outcome_spec_id = $3, outcome_summary = coalesce($4, outcome_summary)
					 where id = $1 and status = 'active' returning *`,
					[trailId, input.outcomeKind, spec?.id ?? null, input.outcomeSummary ?? null]
				);
				const row = result.rows[0];
				if (row === undefined) {
					const existing = await client.query<{ status: TrailStatus }>(`select status from discovery.trails where id = $1`, [trailId]);
					if (existing.rows[0] === undefined) {
						throw new SpecRepositoryError('not_found', `trail not found: ${trailId}`);
					}
					throw new SpecRepositoryError('not_active', `complete_trail: trail is '${existing.rows[0].status}', only an active trail can be completed`);
				}
				await insertAuditLogRow(client, audit, 'update', 'discovery.trails', row.id);
				return { trail: rowToTrail(row), spec };
			} catch (error) {
				wrapConstraintViolation(error, 'complete_trail');
			}
		});
		this.emitChange({ type: 'trail_changed', trailId: completed.trail.id });
		return completed;
	}

	async abandonTrail(trailId: string, outcomeSummary: string | undefined, audit: AuditInfo): Promise<TrailRecord> {
		const trail = await this.withTx(async (client) => {
			const result = await client.query<TrailRow>(
				`update discovery.trails
				 set status = 'abandoned', outcome_summary = coalesce($2, outcome_summary)
				 where id = $1 and status = 'active' returning *`,
				[trailId, outcomeSummary ?? null]
			);
			const row = result.rows[0];
			if (row === undefined) {
				const existing = await client.query<{ status: TrailStatus }>(`select status from discovery.trails where id = $1`, [trailId]);
				if (existing.rows[0] === undefined) {
					throw new SpecRepositoryError('not_found', `trail not found: ${trailId}`);
				}
				throw new SpecRepositoryError('not_active', `abandon_trail: trail is '${existing.rows[0].status}', only an active trail can be abandoned`);
			}
			await insertAuditLogRow(client, audit, 'update', 'discovery.trails', row.id);
			return rowToTrail(row);
		});
		this.emitChange({ type: 'trail_changed', trailId: trail.id });
		return trail;
	}

	/**
	 * Reverses a mistaken completion or abandonment: restores the trail to
	 * 'active' and clears `outcome_summary` (stale prose about a completion
	 * that's no longer final), but deliberately does NOT null `outcome_kind` /
	 * `outcome_spec_id` — those persist as the record of the prior completion,
	 * per this trail's locked design. That's what required W1's schema change:
	 * dropping `trails_outcome_only_when_complete`, the constraint that used to
	 * forbid an active trail from carrying an outcome_kind. `completeTrail` is
	 * re-runnable afterward and will overwrite these fields with the new
	 * completion (still bound by `trails_one_per_spec`'s partial-unique index).
	 *
	 * Only legal on a 'complete' or 'abandoned' trail. Doesn't block on
	 * downstream state that already moved while the trail sat completed: if
	 * `outcome_spec_id` is set, the linked spec's current stage and per-stage
	 * status are looked up (read-only, outside the transaction) and returned as
	 * `specStatus` so the caller can see what's downstream without the reopen
	 * itself being blocked by it — the spec pipeline is untouched either way.
	 */
	async reopenTrail(trailId: string, audit: AuditInfo): Promise<{ trail: TrailRecord; specStatus: TrailSpecStatus | null }> {
		const trail = await this.withTx(async (client) => {
			const result = await client.query<TrailRow>(
				`update discovery.trails
				 set status = 'active', outcome_summary = null
				 where id = $1 and status in ('complete', 'abandoned') returning *`,
				[trailId]
			);
			const row = result.rows[0];
			if (row === undefined) {
				const existing = await client.query<{ status: TrailStatus }>(`select status from discovery.trails where id = $1`, [trailId]);
				if (existing.rows[0] === undefined) {
					throw new SpecRepositoryError('not_found', `trail not found: ${trailId}`);
				}
				throw new SpecRepositoryError(
					'not_reopenable',
					`reopen_trail: trail is '${existing.rows[0].status}', only a complete or abandoned trail can be reopened`
				);
			}
			await insertAuditLogRow(client, audit, 'update', 'discovery.trails', row.id);
			return rowToTrail(row);
		});

		let specStatus: TrailSpecStatus | null = null;
		if (trail.outcomeSpecId !== null) {
			const specExistsResult = await this.pool.query<{ id: string }>(`select id from spec_pipeline.specs where id = $1`, [trail.outcomeSpecId]);
			if (specExistsResult.rows[0] !== undefined) {
				// spec_pipeline.spec_stages only has rows for 'requirements'/'design'
				// (spec-stage-tracking-fixes W2 dropped the seeded 'tasks' row) -- the tasks
				// entry is always synthesized from deriveTasksAggregateStatus, same as
				// SpecRepository.getSpecStages.
				const stagesResult = await this.pool.query<{ stage_name: string; status: string; updated_at: string | Date }>(
					`select stage_name, status, updated_at from spec_pipeline.spec_stages where spec_id = $1 order by stage_name asc`,
					[trail.outcomeSpecId]
				);
				const tasksAggregate = await deriveTasksAggregateStatus(this.pool, trail.outcomeSpecId);
				specStatus = {
					specId: trail.outcomeSpecId,
					currentStage: await deriveCurrentStage(this.pool, trail.outcomeSpecId),
					stages: [
						...stagesResult.rows.map((stageRow) => ({
							stageName: stageRow.stage_name,
							status: stageRow.status,
							updatedAt: toIso(stageRow.updated_at)
						})),
						{
							stageName: 'tasks',
							status: tasksAggregate.status,
							updatedAt: tasksAggregate.lastUpdatedAt ?? new Date().toISOString()
						}
					]
				};
			}
		}

		this.emitChange({ type: 'trail_changed', trailId: trail.id });
		return { trail, specStatus };
	}

	/** One read for the whole computed map — every section the old map file stored
	 * by hand, derived live from waypoint status. */
	async getTrailMap(trailId: string): Promise<TrailMap | null> {
		const trail = await this.getTrail(trailId);
		if (trail === null) {
			return null;
		}
		const [waypoints, frontier, terms, edges] = await Promise.all([
			this.listWaypoints(trailId),
			this.getFrontier(trailId),
			this.listTrailTerms(trailId),
			this.listWaypointDependencies(trailId)
		]);
		const decisions = waypoints
			.filter((w) => w.status === 'reached')
			.sort((a, b) => (a.reachedAt ?? '').localeCompare(b.reachedAt ?? ''));
		const staleCutoff = Date.now() - this.claimTtlHours * 3600_000;
		return {
			trail,
			decisions,
			frontier,
			fog: waypoints.filter((w) => w.status === 'sighted'),
			outOfScope: waypoints.filter((w) => w.status === 'bypassed'),
			claimed: waypoints.filter((w) => w.status === 'claimed' && w.claimedAt !== null && Date.parse(w.claimedAt) >= staleCutoff),
			terms,
			edges
		};
	}

	// ---------------------------------------------------------------------------
	// Waypoints
	// ---------------------------------------------------------------------------

	/**
	 * Marks (or sights, or — the grilling rhythm — immediately reaches) a new
	 * waypoint. `waypoint_number` is assigned max+1 within the trail; callers never
	 * pass one. `sighted: true` inserts into the fog; passing `resolution` inserts
	 * directly at 'reached' (one call per grilling Q&A). The two are mutually
	 * exclusive — fog is by definition unresolved.
	 */
	async addWaypoint(
		trailId: string,
		input: {
			title: string;
			question: string;
			approach?: WaypointApproach;
			sighted?: boolean;
			resolution?: { resolution: string; resolutionGist: string; rationale?: string; reachedIn?: string };
		},
		audit: AuditInfo
	): Promise<WaypointRecord> {
		if (input.sighted === true && input.resolution !== undefined) {
			throw new SpecRepositoryError('sighted_cannot_resolve', 'add_waypoint: a sighted (fog) waypoint cannot carry a resolution');
		}
		const status: WaypointStatus = input.resolution !== undefined ? 'reached' : input.sighted === true ? 'sighted' : 'marked';
		const waypoint = await this.withTx(async (client) => {
			try {
				const result = await client.query<WaypointRow>(
					`insert into discovery.waypoints
					     (trail_id, waypoint_number, title, question, approach, status, resolution, resolution_gist, rationale, reached_in, reached_at)
					 select $1, coalesce(max(waypoint_number), 0) + 1, $2, $3, $4, $5::discovery.waypoint_status, $6, $7, $8, $9,
					        case when $5::text = 'reached' then now() end
					 from discovery.waypoints where trail_id = $1
					 returning *`,
					[
						trailId,
						input.title,
						input.question,
						input.approach ?? null,
						status,
						input.resolution?.resolution ?? null,
						input.resolution?.resolutionGist ?? null,
						input.resolution?.rationale ?? null,
						input.resolution?.reachedIn ?? null
					]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addWaypoint: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'discovery.waypoints', row.id);
				return rowToWaypoint(row);
			} catch (error) {
				wrapConstraintViolation(error, 'add_waypoint');
			}
		});
		this.emitChange({ type: 'waypoint_changed', trailId, waypointId: waypoint.id });
		return waypoint;
	}

	async getWaypoint(waypointId: string): Promise<WaypointRecord | null> {
		const result = await this.pool.query<WaypointRow>(`select * from discovery.waypoints where id = $1`, [waypointId]);
		const row = result.rows[0];
		return row === undefined ? null : rowToWaypoint(row);
	}

	async listWaypoints(trailId: string): Promise<WaypointRecord[]> {
		const result = await this.pool.query<WaypointRow>(
			`select * from discovery.waypoints where trail_id = $1 order by waypoint_number asc`,
			[trailId]
		);
		return result.rows.map(rowToWaypoint);
	}

	/**
	 * Edits a waypoint's title/question/approach in place, and optionally graduates
	 * fog: `mark: true` is the sighted -> marked transition (sharpening a fog patch
	 * into a claimable question). The only status this method will change is
	 * sighted -> marked; every other transition has its own verb.
	 */
	async updateWaypoint(
		waypointId: string,
		input: Partial<{ title: string; question: string; approach: WaypointApproach | null; mark: boolean }>,
		audit: AuditInfo
	): Promise<WaypointRecord> {
		const waypoint = await this.withTx(async (client) => {
			const current = await this.requireWaypoint(client, waypointId);
			if (input.mark === true && current.status !== 'sighted') {
				throw new SpecRepositoryError('invalid_transition', `update_waypoint: mark graduates sighted -> marked, but waypoint is '${current.status}'`);
			}
			const result = await client.query<WaypointRow>(
				`update discovery.waypoints
				 set title = coalesce($2, title),
				     question = coalesce($3, question),
				     approach = case when $5 then $4 else approach end,
				     status = case when $6 then 'marked'::discovery.waypoint_status else status end
				 where id = $1 returning *`,
				[waypointId, input.title ?? null, input.question ?? null, input.approach ?? null, 'approach' in input, input.mark === true]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new Error(`updateWaypoint: update did not return a row: ${waypointId}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'discovery.waypoints', row.id);
			return rowToWaypoint(row);
		});
		this.emitChange({ type: 'waypoint_changed', trailId: waypoint.trailId, waypointId: waypoint.id });
		return waypoint;
	}

	/**
	 * The canonical atomic claim: the WHERE clause is the whole concurrency story,
	 * replacing wayfinder's racy read-then-edit frontmatter claim. A stale claim
	 * (older than the TTL) is reclaimable in the same statement; zero rows updated
	 * is diagnosed into `not_found` / `already_claimed` / `not_claimable`.
	 */
	async claimWaypoint(waypointId: string, claimedBy: string, audit: AuditInfo): Promise<WaypointRecord> {
		const waypoint = await this.withTx(async (client) => {
			const result = await client.query<WaypointRow>(
				`update discovery.waypoints
				 set status = 'claimed', claimed_by = $2, claimed_at = now()
				 where id = $1
				   and (status = 'marked'
				        or (status = 'claimed' and claimed_at < now() - ($3 * interval '1 hour')))
				 returning *`,
				[waypointId, claimedBy, this.claimTtlHours]
			);
			const row = result.rows[0];
			if (row !== undefined) {
				await insertAuditLogRow(client, audit, 'update', 'discovery.waypoints', row.id);
				return rowToWaypoint(row);
			}
			const current = await this.requireWaypoint(client, waypointId);
			if (current.status === 'claimed') {
				throw new SpecRepositoryError('already_claimed', `claim_waypoint: live claim held by '${current.claimed_by ?? 'unknown'}' since ${toIso(current.claimed_at ?? new Date())}`);
			}
			throw new SpecRepositoryError('not_claimable', `claim_waypoint: waypoint is '${current.status}', only marked (or stale-claimed) waypoints are claimable`);
		});
		this.emitChange({ type: 'waypoint_changed', trailId: waypoint.trailId, waypointId: waypoint.id });
		return waypoint;
	}

	/** Manual claim recovery, usable any time — the human override the old dashboard
	 * Release button would have wrapped. Returns the waypoint to 'marked'. */
	async releaseWaypoint(waypointId: string, audit: AuditInfo): Promise<WaypointRecord> {
		const waypoint = await this.withTx(async (client) => {
			const result = await client.query<WaypointRow>(
				`update discovery.waypoints
				 set status = 'marked', claimed_by = null, claimed_at = null
				 where id = $1 and status = 'claimed' returning *`,
				[waypointId]
			);
			const row = result.rows[0];
			if (row === undefined) {
				const current = await this.requireWaypoint(client, waypointId);
				throw new SpecRepositoryError('not_claimed', `release_waypoint: waypoint is '${current.status}', only a claimed waypoint can be released`);
			}
			await insertAuditLogRow(client, audit, 'update', 'discovery.waypoints', row.id);
			return rowToWaypoint(row);
		});
		this.emitChange({ type: 'waypoint_changed', trailId: waypoint.trailId, waypointId: waypoint.id });
		return waypoint;
	}

	/**
	 * Resolves a waypoint into a decision. Legal from 'marked' (the grilling rhythm —
	 * no claim step) or 'claimed' (the wayfinder rhythm). The reached CHECK requires
	 * resolution + gist; `reachedIn` stamps which conversation resolved it.
	 */
	async reachWaypoint(
		waypointId: string,
		input: { resolution: string; resolutionGist: string; rationale?: string; reachedIn?: string },
		audit: AuditInfo
	): Promise<WaypointRecord> {
		const waypoint = await this.withTx(async (client) => {
			const result = await client.query<WaypointRow>(
				`update discovery.waypoints
				 set status = 'reached', resolution = $2, resolution_gist = $3,
				     rationale = coalesce($4, rationale), reached_in = $5, reached_at = now()
				 where id = $1 and status in ('marked', 'claimed') returning *`,
				[waypointId, input.resolution, input.resolutionGist, input.rationale ?? null, input.reachedIn ?? null]
			);
			const row = result.rows[0];
			if (row === undefined) {
				const current = await this.requireWaypoint(client, waypointId);
				throw new SpecRepositoryError('not_reachable', `reach_waypoint: waypoint is '${current.status}'; sharpen sighted fog with update_waypoint first, and terminal waypoints stay put`);
			}
			await insertAuditLogRow(client, audit, 'update', 'discovery.waypoints', row.id);
			return rowToWaypoint(row);
		});
		this.emitChange({ type: 'waypoint_changed', trailId: waypoint.trailId, waypointId: waypoint.id });
		return waypoint;
	}

	/**
	 * Consciously routes around a waypoint — out of scope, with a required reason.
	 * Legal from any non-terminal status, including 'sighted': fog can turn out to
	 * lie beyond the destination without ever being sharpened. Bypassed is terminal
	 * and unblocks dependents just like reached — a scope ruling never deadlocks
	 * the frontier.
	 */
	async bypassWaypoint(waypointId: string, bypassReason: string, audit: AuditInfo): Promise<WaypointRecord> {
		const waypoint = await this.withTx(async (client) => {
			const result = await client.query<WaypointRow>(
				`update discovery.waypoints
				 set status = 'bypassed', bypass_reason = $2, previous_status = status
				 where id = $1 and status in ('sighted', 'marked', 'claimed') returning *`,
				[waypointId, bypassReason]
			);
			const row = result.rows[0];
			if (row === undefined) {
				const current = await this.requireWaypoint(client, waypointId);
				throw new SpecRepositoryError('already_terminal', `bypass_waypoint: waypoint is already '${current.status}'`);
			}
			await insertAuditLogRow(client, audit, 'update', 'discovery.waypoints', row.id);
			return rowToWaypoint(row);
		});
		this.emitChange({ type: 'waypoint_changed', trailId: waypoint.trailId, waypointId: waypoint.id });
		return waypoint;
	}

	/**
	 * Reverses a mistaken bypass: restores the waypoint to its exact pre-bypass
	 * status (`previous_status`, captured by `bypassWaypoint`) and clears both
	 * `bypass_reason` and `previous_status`. Only legal on a currently-bypassed
	 * waypoint that has a recorded `previous_status` — a waypoint bypassed before
	 * this column existed has no pre-bypass status to restore and must be recovered
	 * manually with `updateWaypoint`. `reason` is required at the tool layer (the
	 * same deliberate-friction convention as `bypassWaypoint`'s `bypassReason`) but,
	 * per this trail's locked scope (targeted undo, no general-purpose history
	 * table), has nowhere durable to live — `audit_log` carries no free-text column
	 * — so it is validated by the caller and not threaded down here.
	 *
	 * Unbypassing doesn't block on downstream state that already moved while the
	 * waypoint sat bypassed, so the caller can see the blast radius without the
	 * undo itself being blocked by it: `progressedDependents` lists the direct
	 * dependents (edges from this waypoint) that are already reached, bypassed, or
	 * claimed.
	 */
	async unbypassWaypoint(waypointId: string, audit: AuditInfo): Promise<{ waypoint: WaypointRecord; progressedDependents: WaypointRecord[] }> {
		const waypoint = await this.withTx(async (client) => {
			const result = await client.query<WaypointRow>(
				`update discovery.waypoints
				 set status = previous_status, bypass_reason = null, previous_status = null
				 where id = $1 and status = 'bypassed' and previous_status is not null
				 returning *`,
				[waypointId]
			);
			const row = result.rows[0];
			if (row === undefined) {
				const current = await this.requireWaypoint(client, waypointId);
				if (current.status !== 'bypassed') {
					throw new SpecRepositoryError('not_bypassed', `unbypass_waypoint: waypoint is '${current.status}', only a bypassed waypoint can be unbypassed`);
				}
				throw new SpecRepositoryError(
					'no_previous_status',
					'unbypass_waypoint: this waypoint was bypassed before previous_status tracking existed, so its pre-bypass status cannot be recovered automatically — restore it manually with update_waypoint'
				);
			}
			await insertAuditLogRow(client, audit, 'update', 'discovery.waypoints', row.id);
			return rowToWaypoint(row);
		});
		const dependents = await this.pool.query<WaypointRow>(
			`select w.*
			 from discovery.waypoint_dependency_edges e
			 join discovery.waypoints w on w.id = e.to_waypoint_id
			 where e.from_waypoint_id = $1 and w.status in ('reached', 'bypassed', 'claimed')
			 order by w.waypoint_number`,
			[waypointId]
		);
		this.emitChange({ type: 'waypoint_changed', trailId: waypoint.trailId, waypointId: waypoint.id });
		return { waypoint, progressedDependents: dependents.rows.map(rowToWaypoint) };
	}

	/**
	 * Spins a waypoint off into its own trail (wayfinder-trail-lineage): atomically
	 * reaches the origin waypoint (legal from the same 'marked'/'claimed' states as
	 * `reachWaypoint`) with an auto-generated resolution referencing the new trail,
	 * AND creates the child trail plus its `trail_lineage` edge, all in one
	 * transaction -- mirroring `completeTrail`'s spec-creation atomicity so there is
	 * never a bare pointer to a trail that doesn't exist yet (the exact incident that
	 * motivated this feature). `slug`/`title`/`destination`/`notes` seed the child
	 * trail directly; its `trailheadPrompt` is auto-derived from the origin
	 * waypoint's own question, since spinning off is inherently "this question, on
	 * its own". If the origin waypoint isn't in a reachable state, the whole
	 * transaction rolls back -- no orphan trail is left behind.
	 */
	async spurWaypoint(
		waypointId: string,
		input: { slug: string; title: string; destination?: string; notes?: string; rationale?: string; reachedIn?: string },
		audit: AuditInfo
	): Promise<{ waypoint: WaypointRecord; trail: TrailRecord }> {
		return await this.withTx(async (client) => {
			try {
				const origin = await this.requireWaypoint(client, waypointId);
				const originTrailResult = await client.query<{ project_id: string; title: string }>(
					`select project_id, title from discovery.trails where id = $1`,
					[origin.trail_id]
				);
				const originTrail = originTrailResult.rows[0];
				if (originTrail === undefined) {
					throw new SpecRepositoryError('not_found', `trail not found: ${origin.trail_id}`);
				}

				const trailheadPrompt = `Spun off from waypoint "${origin.title}" (W${origin.waypoint_number}) in trail "${originTrail.title}": ${origin.question}`;
				const trailResult = await client.query<TrailRow>(
					`insert into discovery.trails (project_id, slug, title, trailhead_prompt, destination, notes)
					 values ($1, $2, $3, $4, $5, $6) returning *`,
					[originTrail.project_id, input.slug, input.title, trailheadPrompt, input.destination ?? null, input.notes ?? null]
				);
				const trailRow = trailResult.rows[0];
				if (trailRow === undefined) {
					throw new Error('spurWaypoint: trail insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'discovery.trails', trailRow.id);

				const lineageResult = await client.query<{ id: string }>(
					`insert into discovery.trail_lineage (child_trail_id, parent_kind, parent_waypoint_id)
					 values ($1, 'waypoint', $2) returning id`,
					[trailRow.id, waypointId]
				);
				const lineageRow = lineageResult.rows[0];
				if (lineageRow === undefined) {
					throw new Error('spurWaypoint: trail_lineage insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'discovery.trail_lineage', lineageRow.id);

				const resolution = `Spun off into a new trail: "${input.title}" (${input.slug}).`;
				const resolutionGist = `Spun off to trail "${input.title}".`;
				const waypointResult = await client.query<WaypointRow>(
					`update discovery.waypoints
					 set status = 'reached', resolution = $2, resolution_gist = $3, rationale = coalesce($4, rationale),
					     reached_in = $5, reached_at = now(), spurred_to_trail_id = $6
					 where id = $1 and status in ('marked', 'claimed') returning *`,
					[waypointId, resolution, resolutionGist, input.rationale ?? null, input.reachedIn ?? null, trailRow.id]
				);
				const waypointRow = waypointResult.rows[0];
				if (waypointRow === undefined) {
					throw new SpecRepositoryError(
						'not_spurrable',
						`spur_waypoint: waypoint is '${origin.status}', only marked or claimed waypoints can be spurred`
					);
				}
				await insertAuditLogRow(client, audit, 'update', 'discovery.waypoints', waypointRow.id);

				const waypoint = rowToWaypoint(waypointRow);
				const trail = rowToTrail(trailRow);
				this.emitChange({ type: 'trail_changed', trailId: trail.id });
				this.emitChange({ type: 'waypoint_changed', trailId: waypoint.trailId, waypointId: waypoint.id });
				return { waypoint, trail };
			} catch (error) {
				wrapConstraintViolation(error, 'spur_waypoint');
			}
		});
	}

	/**
	 * Reverses a mistaken `spurWaypoint`: restores the origin waypoint to 'marked'
	 * (clearing everything the spur wrote -- resolution, resolutionGist, rationale,
	 * reachedIn/reachedAt, spurredToTrailId) and removes the `trail_lineage` edge,
	 * mirroring `unbypassWaypoint`/`reopenTrail`'s "warn, don't block" philosophy:
	 * the now-parentless child trail is left completely untouched (not deleted, not
	 * re-parented), just reported back as `childTrail` so the caller can see it
	 * before deciding what to do about it. Legal only on a waypoint that actually has
	 * `spurredToTrailId` set.
	 *
	 * Unlike `unbypassWaypoint`, this doesn't restore from a dedicated
	 * `previous_status` column -- `previous_status`'s CHECK constraint
	 * (`waypoints_previous_status_only_when_bypassed`) ties it exclusively to
	 * `status = 'bypassed'`, so a 'reached' waypoint (which is what `spurWaypoint`
	 * produces) can never carry a value there. Since only 'marked'/'claimed'
	 * waypoints are spurrable in the first place, and a stale 'claimed' status
	 * shouldn't silently reappear (claims are re-established fresh, same as
	 * `releaseWaypoint`'s target), restoring unconditionally to 'marked' is the
	 * correct and only sensible undo target here.
	 */
	async unspurWaypoint(waypointId: string, audit: AuditInfo): Promise<{ waypoint: WaypointRecord; childTrail: TrailRecord | null }> {
		const { waypoint, childTrailId } = await this.withTx(async (client) => {
			const current = await this.requireWaypoint(client, waypointId);
			const result = await client.query<WaypointRow>(
				`update discovery.waypoints
				 set status = 'marked', resolution = null, resolution_gist = null, rationale = null,
				     reached_in = null, reached_at = null, spurred_to_trail_id = null
				 where id = $1 and status = 'reached' and spurred_to_trail_id is not null
				 returning *`,
				[waypointId]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError(
					'not_spurred',
					`unspur_waypoint: waypoint is '${current.status}' with no spurred_to_trail_id set -- nothing to unspur`
				);
			}
			const lineageDelete = await client.query<{ id: string }>(
				`delete from discovery.trail_lineage where parent_waypoint_id = $1 returning id`,
				[waypointId]
			);
			if (lineageDelete.rows[0] !== undefined) {
				await insertAuditLogRow(client, audit, 'delete', 'discovery.trail_lineage', lineageDelete.rows[0].id);
			}
			await insertAuditLogRow(client, audit, 'update', 'discovery.waypoints', row.id);
			return { waypoint: rowToWaypoint(row), childTrailId: current.spurred_to_trail_id };
		});
		const childTrail = childTrailId !== null ? await this.getTrail(childTrailId) : null;
		this.emitChange({ type: 'waypoint_changed', trailId: waypoint.trailId, waypointId: waypoint.id });
		return { waypoint, childTrail };
	}

	/**
	 * The canonical frontier — the edge of the known: marked (or stale-claimed)
	 * waypoints whose blockers have all terminated (reached or bypassed), in
	 * waypoint_number order. What a fresh conversation asks for when it says
	 * "what should I work on next?"
	 */
	async getFrontier(trailId: string): Promise<WaypointRecord[]> {
		const result = await this.pool.query<WaypointRow>(
			`select w.*
			 from discovery.waypoints w
			 where w.trail_id = $1
			   and (w.status = 'marked'
			        or (w.status = 'claimed' and w.claimed_at < now() - ($2 * interval '1 hour')))
			   and not exists (
			       select 1
			       from discovery.waypoint_dependency_edges e
			       join discovery.waypoints blocker on blocker.id = e.from_waypoint_id
			       where e.to_waypoint_id = w.id
			         and blocker.status not in ('reached', 'bypassed'))
			 order by w.waypoint_number`,
			[trailId, this.claimTtlHours]
		);
		return result.rows.map(rowToWaypoint);
	}

	// ---------------------------------------------------------------------------
	// Dependency edges ("from" blocks "to"; always within one trail)
	// ---------------------------------------------------------------------------

	async addWaypointDependency(fromWaypointId: string, toWaypointId: string, audit: AuditInfo): Promise<WaypointDependencyEdgeRecord> {
		const edge = await this.withTx(async (client) => {
			try {
				const from = await this.requireWaypoint(client, fromWaypointId);
				const to = await this.requireWaypoint(client, toWaypointId);
				if (from.trail_id !== to.trail_id) {
					throw new SpecRepositoryError('cross_trail', 'add_waypoint_dependency: both waypoints must belong to the same trail');
				}
				// Same WITH RECURSIVE walk as task_dependency_edges' finalize check, run
				// eagerly here instead: would this edge close a cycle? (Does `to` already
				// reach `from`?)
				const cycle = await client.query(
					`with recursive reach(id) as (
					     select to_waypoint_id from discovery.waypoint_dependency_edges where from_waypoint_id = $2
					   union
					     select e.to_waypoint_id from reach r
					     join discovery.waypoint_dependency_edges e on e.from_waypoint_id = r.id
					 )
					 select 1 from reach where id = $1 limit 1`,
					[fromWaypointId, toWaypointId]
				);
				if (cycle.rows.length > 0) {
					throw new SpecRepositoryError('cycle', 'add_waypoint_dependency: this edge would create a dependency cycle');
				}
				const result = await client.query<WaypointDependencyEdgeRow>(
					`insert into discovery.waypoint_dependency_edges (from_waypoint_id, to_waypoint_id)
					 values ($1, $2) returning *`,
					[fromWaypointId, toWaypointId]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addWaypointDependency: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'discovery.waypoint_dependency_edges', row.id);
				return { record: rowToWaypointDependencyEdge(row), trailId: from.trail_id };
			} catch (error) {
				wrapConstraintViolation(error, 'add_waypoint_dependency');
			}
		});
		this.emitChange({ type: 'waypoint_changed', trailId: edge.trailId, waypointId: edge.record.toWaypointId });
		return edge.record;
	}

	async removeWaypointDependency(edgeId: string, audit: AuditInfo): Promise<void> {
		const removed = await this.withTx(async (client) => {
			const result = await client.query<{ id: string; to_waypoint_id: string; trail_id: string }>(
				`delete from discovery.waypoint_dependency_edges e
				 using discovery.waypoints w
				 where e.id = $1 and w.id = e.to_waypoint_id
				 returning e.id, e.to_waypoint_id, w.trail_id`,
				[edgeId]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `waypoint_dependency_edge not found: ${edgeId}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'discovery.waypoint_dependency_edges', row.id);
			return row;
		});
		this.emitChange({ type: 'waypoint_changed', trailId: removed.trail_id, waypointId: removed.to_waypoint_id });
	}

	async listWaypointDependencies(trailId: string): Promise<WaypointDependencyEdgeRecord[]> {
		const result = await this.pool.query<WaypointDependencyEdgeRow>(
			`select e.* from discovery.waypoint_dependency_edges e
			 join discovery.waypoints w on w.id = e.from_waypoint_id
			 where w.trail_id = $1 order by e.created_at asc`,
			[trailId]
		);
		return result.rows.map(rowToWaypointDependencyEdge);
	}

	// ---------------------------------------------------------------------------
	// Assets (documents stored whole; prototype code referenced by path + commit
	// on main — no branches, no worktrees, ever)
	// ---------------------------------------------------------------------------

	async addWaypointAsset(
		waypointId: string,
		input: { kind: string; title: string; contentMarkdown?: string; repoPath?: string; commitSha?: string },
		audit: AuditInfo
	): Promise<WaypointAssetRecord> {
		const isDocument = input.contentMarkdown !== undefined;
		const isReference = input.repoPath !== undefined;
		if (isDocument === isReference) {
			throw new SpecRepositoryError('asset_shape', 'add_waypoint_asset: provide exactly one of contentMarkdown (document) or repoPath (prototype reference)');
		}
		if (input.commitSha !== undefined && !isReference) {
			throw new SpecRepositoryError('asset_shape', 'add_waypoint_asset: commitSha only applies to repoPath references');
		}
		const asset = await this.withTx(async (client) => {
			try {
				const waypoint = await this.requireWaypoint(client, waypointId);
				const result = await client.query<WaypointAssetRow>(
					`insert into discovery.waypoint_assets (waypoint_id, ordinal, kind, title, content_markdown, repo_path, commit_sha)
					 select $1, coalesce(max(ordinal), 0) + 1, $2, $3, $4, $5, $6
					 from discovery.waypoint_assets where waypoint_id = $1
					 returning *`,
					[waypointId, input.kind, input.title, input.contentMarkdown ?? null, input.repoPath ?? null, input.commitSha ?? null]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addWaypointAsset: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'discovery.waypoint_assets', row.id);
				return { record: rowToWaypointAsset(row), trailId: waypoint.trail_id };
			} catch (error) {
				wrapConstraintViolation(error, 'add_waypoint_asset');
			}
		});
		this.emitChange({ type: 'waypoint_changed', trailId: asset.trailId, waypointId });
		return asset.record;
	}

	async listWaypointAssets(waypointId: string): Promise<WaypointAssetRecord[]> {
		const result = await this.pool.query<WaypointAssetRow>(
			`select * from discovery.waypoint_assets where waypoint_id = $1 order by ordinal asc`,
			[waypointId]
		);
		return result.rows.map(rowToWaypointAsset);
	}

	// ---------------------------------------------------------------------------
	// Trail terms (per-trail terminology; project-level glossary consciously deferred)
	// ---------------------------------------------------------------------------

	async addTrailTerm(trailId: string, term: string, definition: string, audit: AuditInfo): Promise<TrailTermRecord> {
		const record = await this.withTx(async (client) => {
			try {
				const result = await client.query<TrailTermRow>(
					`insert into discovery.trail_terms (trail_id, term, definition) values ($1, $2, $3) returning *`,
					[trailId, term, definition]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addTrailTerm: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'discovery.trail_terms', row.id);
				return rowToTrailTerm(row);
			} catch (error) {
				wrapConstraintViolation(error, 'add_trail_term');
			}
		});
		this.emitChange({ type: 'trail_changed', trailId });
		return record;
	}

	async updateTrailTerm(id: string, definition: string, audit: AuditInfo): Promise<TrailTermRecord> {
		const record = await this.withTx(async (client) => {
			const result = await client.query<TrailTermRow>(
				`update discovery.trail_terms set definition = $2 where id = $1 returning *`,
				[id, definition]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `trail_term not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'discovery.trail_terms', row.id);
			return rowToTrailTerm(row);
		});
		this.emitChange({ type: 'trail_changed', trailId: record.trailId });
		return record;
	}

	async listTrailTerms(trailId: string): Promise<TrailTermRecord[]> {
		const result = await this.pool.query<TrailTermRow>(
			`select * from discovery.trail_terms where trail_id = $1 order by term asc`,
			[trailId]
		);
		return result.rows.map(rowToTrailTerm);
	}
}
