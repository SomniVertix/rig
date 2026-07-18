/// <reference path="./pg.d.ts" />

import type { Pool, PoolClient } from 'pg';

import { withTransaction } from './index.js';
import type { SpecChangeEmitter, SpecChangeEvent } from './spec-change-emitter.js';

/**
 * `SpecRepository` (T5.1): the persistence query layer for the whole spec pipeline --
 * specs/requirements/design/tasks_docs and every child table declared by the evolved
 * schema (T1). Reused alongside the existing `PostgresRunStore`/`PostgresArtifactStore`,
 * on the same `pg` `Pool` and `withTransaction` helper.
 *
 * Every mutation method wraps its work in `withTransaction` so it commits atomically as
 * a single transaction -- this is deliberate setup for T6.3, which will add a shared
 * `audit_log` INSERT sharing that same transaction. Reads are plain `pool.query` calls
 * with no write side effects.
 *
 * Rejections that need to be distinguishable by callers (missing parents, finalize-stage
 * rule violations, same-component dependency edges, etc.) throw `SpecRepositoryError`
 * with a stable machine-readable `rule` string, so the MCP tool layer (and T6's
 * guardrails) can surface a rule-naming error rather than a generic failure.
 */

/**
 * A rejection with a stable, machine-readable `rule` identifier -- distinct from a
 * generic thrown `Error`, so tool handlers can surface which specific rule was violated
 * (Story 7.6, 12.3) rather than a bare failure message.
 */
export class SpecRepositoryError extends Error {
	public readonly rule: string;

	constructor(rule: string, message: string) {
		super(message);
		this.name = 'SpecRepositoryError';
		this.rule = rule;
	}
}

function isForeignKeyViolation(error: unknown): boolean {
	return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23503';
}

function isUniqueViolation(error: unknown): boolean {
	return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505';
}

/** Rewraps a raw Postgres FK/unique violation as a rule-naming `SpecRepositoryError`. */
export function wrapConstraintViolation(error: unknown, context: string): never {
	if (isForeignKeyViolation(error)) {
		throw new SpecRepositoryError('parent_not_found', `${context}: referenced parent row does not exist`);
	}
	if (isUniqueViolation(error)) {
		throw new SpecRepositoryError('duplicate', `${context}: a row with this identity already exists`);
	}
	throw error;
}

export function toIso(value: string | Date): string {
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * T6.3: attribution carried into every mutation so its `audit_log` INSERT can share
 * the exact same transaction/commit as the underlying mutation (Story 11.2). `actor`
 * is the write tool's required argument (T6.2); `projectId` is the MCP session's
 * bound project (T4.4) -- both already in hand at the tool layer, so no extra query
 * is needed here to derive them. The INSERT itself deliberately lives in this file
 * (not in `packages/server/src/mcp/guardrails/`) because only the code already
 * holding the mutation's `PoolClient` -- these `withTx` callbacks -- can guarantee
 * the audit row commits atomically with the row it records; a separate post-hoc
 * insert from the MCP layer would reopen that atomicity gap.
 */
export interface AuditInfo {
	actor: string;
	projectId: string | null;
}

/** Append-only by construction: this is the only function in the codebase that
 * writes to `spec_pipeline.audit_log` (shared by `SpecRepository` and
 * `TrailRepository`), and it only ever INSERTs (Story 11.3). */
export async function insertAuditLogRow(
	client: PoolClient,
	audit: AuditInfo,
	action: 'insert' | 'update' | 'delete' | 'finalize' | 'approve' | 'deny',
	tableName: string,
	rowId: string
): Promise<void> {
	await client.query(
		`insert into spec_pipeline.audit_log (actor, action, table_name, row_id, project_id) values ($1, $2, $3, $4, $5)`,
		[audit.actor, action, tableName, rowId, audit.projectId]
	);
}

/**
 * Shared append-only ordinal helper (T5.9): every add tool across the requirements/
 * design/tasks child tables calls this instead of duplicating "insert at
 * max(existing ordinal)+1" logic per table. No add method ever accepts an explicit
 * ordinal/position argument (Story 6.3, 6.4).
 */
export async function nextOrdinal(
	client: PoolClient,
	table: string,
	ordinalColumn: string,
	whereColumn: string,
	whereValue: string
): Promise<number> {
	const result = await client.query<{ next_ordinal: string | number }>(
		`select coalesce(max(${ordinalColumn}), 0) + 1 as next_ordinal from spec_pipeline.${table} where ${whereColumn} = $1`,
		[whereValue]
	);
	const row = result.rows[0];
	return Number(row?.next_ordinal ?? 1);
}

// =============================================================================
// Record / row types
// =============================================================================

export interface SpecRecord {
	id: string;
	projectId: string | null;
	slug: string;
	featureName: string;
	currentStage: string;
	createdAt: string;
	updatedAt: string;
}

interface SpecRow extends Record<string, unknown> {
	id: string;
	project_id: string | null;
	slug: string;
	feature_name: string;
	current_stage: string;
	created_at: string | Date;
	updated_at: string | Date;
}

function rowToSpec(row: SpecRow): SpecRecord {
	return {
		id: row.id,
		projectId: row.project_id,
		slug: row.slug,
		featureName: row.feature_name,
		currentStage: row.current_stage,
		createdAt: toIso(row.created_at),
		updatedAt: toIso(row.updated_at)
	};
}

export interface SpecStageRecord {
	id: string;
	specId: string;
	stageName: string;
	status: string;
	updatedAt: string;
}

interface SpecStageRow extends Record<string, unknown> {
	id: string;
	spec_id: string;
	stage_name: string;
	status: string;
	updated_at: string | Date;
}

function rowToSpecStage(row: SpecStageRow): SpecStageRecord {
	return {
		id: row.id,
		specId: row.spec_id,
		stageName: row.stage_name,
		status: row.status,
		updatedAt: toIso(row.updated_at)
	};
}

export interface RequirementsRecord {
	id: string;
	specId: string;
	featureName: string;
	overview: string;
	createdAt: string;
	updatedAt: string;
}

interface RequirementsRow extends Record<string, unknown> {
	id: string;
	spec_id: string;
	feature_name: string;
	overview: string;
	created_at: string | Date;
	updated_at: string | Date;
}

function rowToRequirements(row: RequirementsRow): RequirementsRecord {
	return {
		id: row.id,
		specId: row.spec_id,
		featureName: row.feature_name,
		overview: row.overview,
		createdAt: toIso(row.created_at),
		updatedAt: toIso(row.updated_at)
	};
}

export interface UserStoryRecord {
	id: string;
	requirementsId: string;
	storyNumber: number;
	title: string;
	role: string;
	capability: string;
	benefit: string;
	rationale: string;
}

interface UserStoryRow extends Record<string, unknown> {
	id: string;
	requirements_id: string;
	story_number: number | string;
	title: string;
	role: string;
	capability: string;
	benefit: string;
	rationale: string;
}

function rowToUserStory(row: UserStoryRow): UserStoryRecord {
	return {
		id: row.id,
		requirementsId: row.requirements_id,
		storyNumber: Number(row.story_number),
		title: row.title,
		role: row.role,
		capability: row.capability,
		benefit: row.benefit,
		rationale: row.rationale
	};
}

export interface AcceptanceCriterionRecord {
	id: string;
	userStoryId: string;
	criterionNumber: number;
	earsPattern: string;
	triggerClause: string | null;
	conditionClause: string | null;
	stateClause: string | null;
	responseClause: string;
	fullText: string;
}

interface AcceptanceCriterionRow extends Record<string, unknown> {
	id: string;
	user_story_id: string;
	criterion_number: number | string;
	ears_pattern: string;
	trigger_clause: string | null;
	condition_clause: string | null;
	state_clause: string | null;
	response_clause: string;
	full_text: string;
}

function rowToAcceptanceCriterion(row: AcceptanceCriterionRow): AcceptanceCriterionRecord {
	return {
		id: row.id,
		userStoryId: row.user_story_id,
		criterionNumber: Number(row.criterion_number),
		earsPattern: row.ears_pattern,
		triggerClause: row.trigger_clause,
		conditionClause: row.condition_clause,
		stateClause: row.state_clause,
		responseClause: row.response_clause,
		fullText: row.full_text
	};
}

export interface GlossaryTermRecord {
	id: string;
	requirementsId: string;
	term: string;
	definition: string | null;
	externalReference: string | null;
}

interface GlossaryTermRow extends Record<string, unknown> {
	id: string;
	requirements_id: string;
	term: string;
	definition: string | null;
	external_reference: string | null;
}

function rowToGlossaryTerm(row: GlossaryTermRow): GlossaryTermRecord {
	return {
		id: row.id,
		requirementsId: row.requirements_id,
		term: row.term,
		definition: row.definition,
		externalReference: row.external_reference
	};
}

export interface DesignRecord {
	id: string;
	specId: string;
	featureName: string;
	overview: string;
	architecture: string;
	dataModelOverview: string | null;
	createdAt: string;
	updatedAt: string;
}

interface DesignRow extends Record<string, unknown> {
	id: string;
	spec_id: string;
	feature_name: string;
	overview: string;
	architecture: string;
	data_model_overview: string | null;
	created_at: string | Date;
	updated_at: string | Date;
}

function rowToDesign(row: DesignRow): DesignRecord {
	return {
		id: row.id,
		specId: row.spec_id,
		featureName: row.feature_name,
		overview: row.overview,
		architecture: row.architecture,
		dataModelOverview: row.data_model_overview,
		createdAt: toIso(row.created_at),
		updatedAt: toIso(row.updated_at)
	};
}

export interface DesignComponentRecord {
	id: string;
	designId: string;
	slug: string;
	displayName: string;
	ordinal: number;
}

interface DesignComponentRow extends Record<string, unknown> {
	id: string;
	design_id: string;
	slug: string;
	display_name: string;
	ordinal: number | string;
}

function rowToDesignComponent(row: DesignComponentRow): DesignComponentRecord {
	return {
		id: row.id,
		designId: row.design_id,
		slug: row.slug,
		displayName: row.display_name,
		ordinal: Number(row.ordinal)
	};
}

export interface DesignDataModelEntryRecord {
	id: string;
	designId: string;
	ordinal: number;
	name: string;
	kind: string;
	content: string;
}

interface DesignDataModelEntryRow extends Record<string, unknown> {
	id: string;
	design_id: string;
	ordinal: number | string;
	name: string;
	kind: string;
	content: string;
}

function rowToDesignDataModelEntry(row: DesignDataModelEntryRow): DesignDataModelEntryRecord {
	return {
		id: row.id,
		designId: row.design_id,
		ordinal: Number(row.ordinal),
		name: row.name,
		kind: row.kind,
		content: row.content
	};
}

export interface DesignTraceabilityRecord {
	id: string;
	designId: string;
	userStoryId: string | null;
	requirementLabel: string;
	addressedBy: string;
	ordinal: number;
}

interface DesignTraceabilityRow extends Record<string, unknown> {
	id: string;
	design_id: string;
	user_story_id: string | null;
	requirement_label: string;
	addressed_by: string;
	ordinal: number | string;
}

function rowToDesignTraceability(row: DesignTraceabilityRow): DesignTraceabilityRecord {
	return {
		id: row.id,
		designId: row.design_id,
		userStoryId: row.user_story_id,
		requirementLabel: row.requirement_label,
		addressedBy: row.addressed_by,
		ordinal: Number(row.ordinal)
	};
}

export interface TasksDocRecord {
	id: string;
	specId: string;
	designComponentId: string;
	componentSlug: string;
	componentName: string;
	featureName: string;
	status: string;
	createdAt: string;
	updatedAt: string;
}

interface TasksDocRow extends Record<string, unknown> {
	id: string;
	spec_id: string;
	design_component_id: string;
	component_slug: string;
	component_name: string;
	feature_name: string;
	status: string;
	created_at: string | Date;
	updated_at: string | Date;
}

function rowToTasksDoc(row: TasksDocRow): TasksDocRecord {
	return {
		id: row.id,
		specId: row.spec_id,
		designComponentId: row.design_component_id,
		componentSlug: row.component_slug,
		componentName: row.component_name,
		featureName: row.feature_name,
		status: row.status,
		createdAt: toIso(row.created_at),
		updatedAt: toIso(row.updated_at)
	};
}

export interface TaskItemRecord {
	id: string;
	tasksDocId: string;
	itemId: string;
	parentItemId: string | null;
	executionOrder: number;
	title: string;
	description: string;
	traceability: string;
	suggestedAgent: string;
	acceptanceCheck: string;
	isChecked: boolean;
}

interface TaskItemRow extends Record<string, unknown> {
	id: string;
	tasks_doc_id: string;
	item_id: string;
	parent_item_id: string | null;
	execution_order: number | string;
	title: string;
	description: string;
	traceability: string;
	suggested_agent: string;
	acceptance_check: string;
	is_checked: boolean;
}

function rowToTaskItem(row: TaskItemRow): TaskItemRecord {
	return {
		id: row.id,
		tasksDocId: row.tasks_doc_id,
		itemId: row.item_id,
		parentItemId: row.parent_item_id,
		executionOrder: Number(row.execution_order),
		title: row.title,
		description: row.description,
		traceability: row.traceability,
		suggestedAgent: row.suggested_agent,
		acceptanceCheck: row.acceptance_check,
		isChecked: row.is_checked
	};
}

export interface TaskFileTouchedRecord {
	id: string;
	taskItemId: string;
	ordinal: number;
	filePath: string;
}

interface TaskFileTouchedRow extends Record<string, unknown> {
	id: string;
	task_item_id: string;
	ordinal: number | string;
	file_path: string;
}

function rowToTaskFileTouched(row: TaskFileTouchedRow): TaskFileTouchedRecord {
	return { id: row.id, taskItemId: row.task_item_id, ordinal: Number(row.ordinal), filePath: row.file_path };
}

export interface ParallelBatchRecord {
	id: string;
	tasksDocId: string;
	batchLabel: string;
	batchOrder: number;
}

interface ParallelBatchRow extends Record<string, unknown> {
	id: string;
	tasks_doc_id: string;
	batch_label: string;
	batch_order: number | string;
}

function rowToParallelBatch(row: ParallelBatchRow): ParallelBatchRecord {
	return { id: row.id, tasksDocId: row.tasks_doc_id, batchLabel: row.batch_label, batchOrder: Number(row.batch_order) };
}

export interface ParallelBatchMemberRecord {
	id: string;
	batchId: string;
	taskItemId: string;
}

interface ParallelBatchMemberRow extends Record<string, unknown> {
	id: string;
	batch_id: string;
	task_item_id: string;
}

function rowToParallelBatchMember(row: ParallelBatchMemberRow): ParallelBatchMemberRecord {
	return { id: row.id, batchId: row.batch_id, taskItemId: row.task_item_id };
}

export interface DefinitionOfDoneItemRecord {
	id: string;
	specId: string;
	ordinal: number;
	description: string;
	isChecked: boolean;
}

interface DefinitionOfDoneItemRow extends Record<string, unknown> {
	id: string;
	spec_id: string;
	ordinal: number | string;
	description: string;
	is_checked: boolean;
}

function rowToDefinitionOfDoneItem(row: DefinitionOfDoneItemRow): DefinitionOfDoneItemRecord {
	return {
		id: row.id,
		specId: row.spec_id,
		ordinal: Number(row.ordinal),
		description: row.description,
		isChecked: row.is_checked
	};
}

export interface TaskDependencyEdgeRecord {
	id: string;
	specId: string;
	fromTaskItemId: string;
	toTaskItemId: string;
}

interface TaskDependencyEdgeRow extends Record<string, unknown> {
	id: string;
	spec_id: string;
	from_task_item_id: string;
	to_task_item_id: string;
}

function rowToTaskDependencyEdge(row: TaskDependencyEdgeRow): TaskDependencyEdgeRecord {
	return { id: row.id, specId: row.spec_id, fromTaskItemId: row.from_task_item_id, toTaskItemId: row.to_task_item_id };
}

// A uniform shape shared by every "ordinal + free-text description" child table
// (non_goals, assumptions_open_questions, design_alternatives_considered,
// design_open_risks, design_flags, tasks_flags). Factored once so the shared ordinal
// helper (T5.9) and its CRUD wiring aren't duplicated six times over.
export interface OrdinalDescriptionRecord {
	id: string;
	ordinal: number;
	description: string;
}

interface OrdinalDescriptionRow extends Record<string, unknown> {
	id: string;
	ordinal: number | string;
	description: string;
}

function rowToOrdinalDescription(row: OrdinalDescriptionRow): OrdinalDescriptionRecord {
	return { id: row.id, ordinal: Number(row.ordinal), description: row.description };
}

interface OrdinalDescriptionCrud {
	add(parentId: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord>;
	update(id: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord>;
	delete(id: string, audit: AuditInfo): Promise<void>;
	list(parentId: string): Promise<OrdinalDescriptionRecord[]>;
}

/** T5's spec-change-events wiring (Story 4 AC1, AC2): when supplied, every add/update/delete
 * resolves the owning spec's id up the FK chain (inside the same transaction, via
 * `resolveSpecId`) and emits a post-commit `spec_changed` event tagged with `stage`. Left
 * `undefined` for instances whose stage isn't wired yet. */
interface OrdinalDescriptionChangeEmission {
	stage: SpecStageName;
	resolveSpecId(client: PoolClient, parentId: string): Promise<string>;
	emit(event: SpecChangeEvent): void;
}

function ordinalDescriptionCrud(
	pool: Pool,
	table: string,
	parentColumn: string,
	changeEmission?: OrdinalDescriptionChangeEmission
): OrdinalDescriptionCrud {
	return {
		async add(parentId: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
			let specId: string | null = null;
			const record = await withTransaction(pool, async (client) => {
				const ordinal = await nextOrdinal(client, table, 'ordinal', parentColumn, parentId);
				try {
					const result = await client.query<OrdinalDescriptionRow>(
						`insert into spec_pipeline.${table} (${parentColumn}, ordinal, description) values ($1, $2, $3) returning id, ordinal, description`,
						[parentId, ordinal, description]
					);
					const row = result.rows[0];
					if (row === undefined) {
						throw new Error(`insert into ${table} did not return a row`);
					}
					await insertAuditLogRow(client, audit, 'insert', table, row.id);
					if (changeEmission) {
						specId = await changeEmission.resolveSpecId(client, parentId);
					}
					return rowToOrdinalDescription(row);
				} catch (error) {
					wrapConstraintViolation(error, `add ${table}`);
				}
			});
			if (changeEmission && specId !== null) {
				changeEmission.emit({ type: 'spec_changed', specId, stage: changeEmission.stage });
			}
			return record;
		},
		async update(id: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
			let specId: string | null = null;
			const record = await withTransaction(pool, async (client) => {
				const result = await client.query<OrdinalDescriptionRow>(
					`update spec_pipeline.${table} set description = $2 where id = $1 returning id, ordinal, description, ${parentColumn}`,
					[id, description]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new SpecRepositoryError('not_found', `${table} row not found: ${id}`);
				}
				await insertAuditLogRow(client, audit, 'update', table, row.id);
				if (changeEmission) {
					specId = await changeEmission.resolveSpecId(client, String(row[parentColumn]));
				}
				return rowToOrdinalDescription(row);
			});
			if (changeEmission && specId !== null) {
				changeEmission.emit({ type: 'spec_changed', specId, stage: changeEmission.stage });
			}
			return record;
		},
		async delete(id: string, audit: AuditInfo): Promise<void> {
			let specId: string | null = null;
			await withTransaction(pool, async (client) => {
				const result = await client.query<Record<string, unknown>>(
					`delete from spec_pipeline.${table} where id = $1 returning ${parentColumn}`,
					[id]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new SpecRepositoryError('not_found', `${table} row not found: ${id}`);
				}
				await insertAuditLogRow(client, audit, 'delete', table, id);
				if (changeEmission) {
					specId = await changeEmission.resolveSpecId(client, String(row[parentColumn]));
				}
			});
			if (changeEmission && specId !== null) {
				changeEmission.emit({ type: 'spec_changed', specId, stage: changeEmission.stage });
			}
		},
		async list(parentId: string): Promise<OrdinalDescriptionRecord[]> {
			const result = await pool.query<OrdinalDescriptionRow>(
				`select id, ordinal, description from spec_pipeline.${table} where ${parentColumn} = $1 order by ordinal asc`,
				[parentId]
			);
			return result.rows.map(rowToOrdinalDescription);
		}
	};
}

// =============================================================================
// finalize_stage / get_next_stage / render_document result shapes
// =============================================================================

export type SpecStageName = 'requirements' | 'design' | 'tasks';

export interface FinalizeStageResult {
	stage: SpecStageName;
	componentSlug?: string;
	status: string;
}

export interface ApproveStageResult {
	stage: SpecStageName;
	componentSlug?: string;
	status: 'approved';
}

export interface DenyStageResult {
	stage: SpecStageName;
	componentSlug?: string;
	status: 'not_started';
}

export interface GetNextStageResult {
	actionableStage: SpecStageName | null;
	laggingComponents?: string[];
}

// =============================================================================
// SpecRepository
// =============================================================================

export class SpecRepository {
	private readonly pool: Pool;
	private readonly emitter: SpecChangeEmitter | undefined;

	private readonly nonGoals: OrdinalDescriptionCrud;
	private readonly assumptionsOpenQuestions: OrdinalDescriptionCrud;
	private readonly designAlternatives: OrdinalDescriptionCrud;
	private readonly designOpenRisks: OrdinalDescriptionCrud;
	private readonly designFlags: OrdinalDescriptionCrud;
	private readonly tasksFlags: OrdinalDescriptionCrud;

	/** `emitter` is optional (and defaulted `undefined`) so every existing call site that
	 * constructs a `SpecRepository` without one keeps working; callers that care about
	 * `spec_changed` fan-out (Story 4) pass the process-wide
	 * `SpecChangeEmitter` singleton in. */
	constructor(pool: Pool, emitter?: SpecChangeEmitter) {
		this.pool = pool;
		this.emitter = emitter;
		this.nonGoals = ordinalDescriptionCrud(pool, 'non_goals', 'requirements_id', {
			stage: 'requirements',
			resolveSpecId: (client, parentId) => this.resolveSpecIdFromRequirementsId(client, parentId),
			emit: (event) => this.emitChange(event)
		});
		this.assumptionsOpenQuestions = ordinalDescriptionCrud(pool, 'assumptions_open_questions', 'requirements_id', {
			stage: 'requirements',
			resolveSpecId: (client, parentId) => this.resolveSpecIdFromRequirementsId(client, parentId),
			emit: (event) => this.emitChange(event)
		});
		this.designAlternatives = ordinalDescriptionCrud(pool, 'design_alternatives_considered', 'design_id', {
			stage: 'design',
			resolveSpecId: (client, parentId) => this.resolveSpecIdFromDesignId(client, parentId),
			emit: (event) => this.emitChange(event)
		});
		this.designOpenRisks = ordinalDescriptionCrud(pool, 'design_open_risks', 'design_id', {
			stage: 'design',
			resolveSpecId: (client, parentId) => this.resolveSpecIdFromDesignId(client, parentId),
			emit: (event) => this.emitChange(event)
		});
		this.designFlags = ordinalDescriptionCrud(pool, 'design_flags', 'design_id', {
			stage: 'design',
			resolveSpecId: (client, parentId) => this.resolveSpecIdFromDesignId(client, parentId),
			emit: (event) => this.emitChange(event)
		});
		this.tasksFlags = ordinalDescriptionCrud(pool, 'tasks_flags', 'tasks_doc_id');
	}

	private async withTx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
		return await withTransaction(this.pool, work);
	}

	/** Fans a `spec_changed` event out to the process-wide
	 * emitter (Story 4 AC1, AC2). A no-op when this repository was constructed without
	 * one. Always called *after* the mutation's `withTx` has resolved (i.e. committed),
	 * never from inside the transaction callback, so a rolled-back mutation never emits. */
	private emitChange(event: SpecChangeEvent): void {
		this.emitter?.emit(event);
	}

	/** Resolves the owning spec's id from a `requirements_id` FK (Story 4 AC2) --
	 * shared by every requirements-child mutation whose parent is the `requirements`
	 * row itself (user stories, glossary terms, non-goals, assumptions/open questions). */
	private async resolveSpecIdFromRequirementsId(client: PoolClient, requirementsId: string): Promise<string> {
		const result = await client.query<{ spec_id: string }>(
			`select spec_id from spec_pipeline.requirements where id = $1`,
			[requirementsId]
		);
		const row = result.rows[0];
		if (row === undefined) {
			throw new Error(`resolveSpecIdFromRequirementsId: requirements row not found: ${requirementsId}`);
		}
		return row.spec_id;
	}

	/** Resolves the owning spec's id from a `user_story_id` FK by joining up through
	 * `requirements` (Story 4 AC2) -- shared by acceptance-criterion mutations, whose
	 * parent is a user story rather than the requirements row directly. */
	private async resolveSpecIdFromUserStoryId(client: PoolClient, userStoryId: string): Promise<string> {
		const result = await client.query<{ spec_id: string }>(
			`select r.spec_id from spec_pipeline.user_stories us
			 join spec_pipeline.requirements r on r.id = us.requirements_id
			 where us.id = $1`,
			[userStoryId]
		);
		const row = result.rows[0];
		if (row === undefined) {
			throw new Error(`resolveSpecIdFromUserStoryId: user_story row not found: ${userStoryId}`);
		}
		return row.spec_id;
	}

	/** Resolves the owning spec's id from a `design_id` FK (Story 4 AC2) -- shared by
	 * every design-child mutation whose parent is the `design` row itself (components,
	 * data model entries, traceability rows, alternatives, open risks, flags). */
	private async resolveSpecIdFromDesignId(client: PoolClient, designId: string): Promise<string> {
		const result = await client.query<{ spec_id: string }>(
			`select spec_id from spec_pipeline.designs where id = $1`,
			[designId]
		);
		const row = result.rows[0];
		if (row === undefined) {
			throw new Error(`resolveSpecIdFromDesignId: design row not found: ${designId}`);
		}
		return row.spec_id;
	}

	/** Resolves the owning spec's id AND component slug from a `tasks_doc_id` FK (Story
	 * 4 AC1, AC2) -- every `tasks_docs` row is already scoped to exactly one component, so
	 * both fields come from a single lookup. Shared by every tasks-child mutation whose
	 * parent is the `tasks_docs` row itself (task items, parallel batches, tasks flags). */
	private async resolveSpecAndComponentFromTasksDocId(
		client: PoolClient,
		tasksDocId: string
	): Promise<{ specId: string; component: string }> {
		const result = await client.query<{ spec_id: string; component_slug: string }>(
			`select spec_id, component_slug from spec_pipeline.tasks_docs where id = $1`,
			[tasksDocId]
		);
		const row = result.rows[0];
		if (row === undefined) {
			throw new Error(`resolveSpecAndComponentFromTasksDocId: tasks_docs row not found: ${tasksDocId}`);
		}
		return { specId: row.spec_id, component: row.component_slug };
	}

	/** Resolves the owning spec's id AND component slug from a `task_item_id` FK by
	 * joining up through `tasks_docs` (Story 4 AC1, AC2) -- shared by task_files_touched
	 * mutations, whose parent is a task item rather than the tasks_docs row directly. */
	private async resolveSpecAndComponentFromTaskItemId(
		client: PoolClient,
		taskItemId: string
	): Promise<{ specId: string; component: string }> {
		const result = await client.query<{ spec_id: string; component_slug: string }>(
			`select td.spec_id, td.component_slug from spec_pipeline.task_items ti
			 join spec_pipeline.tasks_docs td on td.id = ti.tasks_doc_id
			 where ti.id = $1`,
			[taskItemId]
		);
		const row = result.rows[0];
		if (row === undefined) {
			throw new Error(`resolveSpecAndComponentFromTaskItemId: task_item row not found: ${taskItemId}`);
		}
		return { specId: row.spec_id, component: row.component_slug };
	}

	/** Resolves the owning spec's id AND component slug from a `batch_id` FK by joining
	 * up through `tasks_docs` (Story 4 AC1, AC2) -- shared by parallel_batch_members
	 * mutations, whose parent is a parallel batch rather than the tasks_docs row directly. */
	private async resolveSpecAndComponentFromBatchId(
		client: PoolClient,
		batchId: string
	): Promise<{ specId: string; component: string }> {
		const result = await client.query<{ spec_id: string; component_slug: string }>(
			`select td.spec_id, td.component_slug from spec_pipeline.parallel_batches pb
			 join spec_pipeline.tasks_docs td on td.id = pb.tasks_doc_id
			 where pb.id = $1`,
			[batchId]
		);
		const row = result.rows[0];
		if (row === undefined) {
			throw new Error(`resolveSpecAndComponentFromBatchId: parallel_batch row not found: ${batchId}`);
		}
		return { specId: row.spec_id, component: row.component_slug };
	}

	// ---------------------------------------------------------------------------
	// Spec lifecycle (T5.2)
	// ---------------------------------------------------------------------------

	async createSpec(input: { projectId: string; slug: string; featureName: string }, audit: AuditInfo): Promise<SpecRecord> {
		return await this.withTx(async (client) => {
			try {
				const result = await client.query<SpecRow>(
					`insert into spec_pipeline.specs (project_id, slug, feature_name) values ($1, $2, $3) returning *`,
					[input.projectId, input.slug, input.featureName]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('createSpec: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'specs', row.id);
				return rowToSpec(row);
			} catch (error) {
				wrapConstraintViolation(error, 'create_spec');
			}
		});
	}

	async getSpec(specId: string): Promise<SpecRecord | null> {
		const result = await this.pool.query<SpecRow>(`select * from spec_pipeline.specs where id = $1`, [specId]);
		const row = result.rows[0];
		return row === undefined ? null : rowToSpec(row);
	}

	async getSpecBySlug(projectId: string, slug: string): Promise<SpecRecord | null> {
		const result = await this.pool.query<SpecRow>(
			`select * from spec_pipeline.specs where project_id = $1 and slug = $2`,
			[projectId, slug]
		);
		const row = result.rows[0];
		return row === undefined ? null : rowToSpec(row);
	}

	async listSpecs(projectId: string): Promise<SpecRecord[]> {
		const result = await this.pool.query<SpecRow>(
			`select * from spec_pipeline.specs where project_id = $1 order by created_at asc`,
			[projectId]
		);
		return result.rows.map(rowToSpec);
	}

	async getSpecStages(specId: string): Promise<SpecStageRecord[]> {
		const result = await this.pool.query<SpecStageRow>(
			`select * from spec_pipeline.spec_stages where spec_id = $1 order by stage_name asc`,
			[specId]
		);
		return result.rows.map(rowToSpecStage);
	}

	// ---------------------------------------------------------------------------
	// Requirements (T5.3)
	// ---------------------------------------------------------------------------

	async getRequirements(specId: string): Promise<RequirementsRecord | null> {
		const result = await this.pool.query<RequirementsRow>(
			`select * from spec_pipeline.requirements where spec_id = $1`,
			[specId]
		);
		const row = result.rows[0];
		return row === undefined ? null : rowToRequirements(row);
	}

	/** Upserts the requirements row's `## Overview` + feature name. `specId` is already
	 * the mutation's own argument, so no FK-chain resolution is needed before emitting. */
	async setRequirementsOverview(specId: string, input: { featureName: string; overview: string }, audit: AuditInfo): Promise<RequirementsRecord> {
		const record = await this.withTx(async (client) => {
			const result = await client.query<RequirementsRow>(
				`insert into spec_pipeline.requirements (spec_id, feature_name, overview)
				 values ($1, $2, $3)
				 on conflict (spec_id) do update set feature_name = excluded.feature_name, overview = excluded.overview
				 returning *`,
				[specId, input.featureName, input.overview]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new Error('setRequirementsOverview: upsert did not return a row');
			}
			await insertAuditLogRow(client, audit, 'insert', 'requirements', row.id);
			return rowToRequirements(row);
		});
		this.emitChange({ type: 'spec_changed', specId, stage: 'requirements' });
		return record;
	}

	async listUserStories(requirementsId: string): Promise<UserStoryRecord[]> {
		const result = await this.pool.query<UserStoryRow>(
			`select * from spec_pipeline.user_stories where requirements_id = $1 order by story_number asc`,
			[requirementsId]
		);
		return result.rows.map(rowToUserStory);
	}

	async addUserStory(
		requirementsId: string,
		input: { title: string; role: string; capability: string; benefit: string; rationale: string },
		audit: AuditInfo
	): Promise<UserStoryRecord> {
		let specId: string | null = null;
		const record = await this.withTx(async (client) => {
			const storyNumber = await nextOrdinal(client, 'user_stories', 'story_number', 'requirements_id', requirementsId);
			try {
				const result = await client.query<UserStoryRow>(
					`insert into spec_pipeline.user_stories (requirements_id, story_number, title, role, capability, benefit, rationale)
					 values ($1, $2, $3, $4, $5, $6, $7) returning *`,
					[requirementsId, storyNumber, input.title, input.role, input.capability, input.benefit, input.rationale]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addUserStory: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'user_stories', row.id);
				specId = await this.resolveSpecIdFromRequirementsId(client, requirementsId);
				return rowToUserStory(row);
			} catch (error) {
				wrapConstraintViolation(error, 'add_user_story');
			}
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'requirements' });
		}
		return record;
	}

	async updateUserStory(
		id: string,
		input: Partial<{ title: string; role: string; capability: string; benefit: string; rationale: string }>,
		audit: AuditInfo
	): Promise<UserStoryRecord> {
		let specId: string | null = null;
		const record = await this.withTx(async (client) => {
			const result = await client.query<UserStoryRow>(
				`update spec_pipeline.user_stories set
					title = coalesce($2, title),
					role = coalesce($3, role),
					capability = coalesce($4, capability),
					benefit = coalesce($5, benefit),
					rationale = coalesce($6, rationale)
				 where id = $1 returning *`,
				[id, input.title ?? null, input.role ?? null, input.capability ?? null, input.benefit ?? null, input.rationale ?? null]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `user_story not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'user_stories', row.id);
			specId = await this.resolveSpecIdFromRequirementsId(client, row.requirements_id);
			return rowToUserStory(row);
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'requirements' });
		}
		return record;
	}

	async deleteUserStory(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | null = null;
		await this.withTx(async (client) => {
			const result = await client.query<{ requirements_id: string }>(
				`delete from spec_pipeline.user_stories where id = $1 returning requirements_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `user_story not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'user_stories', id);
			specId = await this.resolveSpecIdFromRequirementsId(client, row.requirements_id);
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'requirements' });
		}
	}

	async listAcceptanceCriteria(userStoryId: string): Promise<AcceptanceCriterionRecord[]> {
		const result = await this.pool.query<AcceptanceCriterionRow>(
			`select * from spec_pipeline.acceptance_criteria where user_story_id = $1 order by criterion_number asc`,
			[userStoryId]
		);
		return result.rows.map(rowToAcceptanceCriterion);
	}

	async addAcceptanceCriterion(
		userStoryId: string,
		input: {
			earsPattern: string;
			triggerClause?: string | null;
			conditionClause?: string | null;
			stateClause?: string | null;
			responseClause: string;
			fullText: string;
		},
		audit: AuditInfo
	): Promise<AcceptanceCriterionRecord> {
		let specId: string | null = null;
		const record = await this.withTx(async (client) => {
			const criterionNumber = await nextOrdinal(client, 'acceptance_criteria', 'criterion_number', 'user_story_id', userStoryId);
			try {
				const result = await client.query<AcceptanceCriterionRow>(
					`insert into spec_pipeline.acceptance_criteria
						(user_story_id, criterion_number, ears_pattern, trigger_clause, condition_clause, state_clause, response_clause, full_text)
					 values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
					[
						userStoryId,
						criterionNumber,
						input.earsPattern,
						input.triggerClause ?? null,
						input.conditionClause ?? null,
						input.stateClause ?? null,
						input.responseClause,
						input.fullText
					]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addAcceptanceCriterion: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'acceptance_criteria', row.id);
				specId = await this.resolveSpecIdFromUserStoryId(client, userStoryId);
				return rowToAcceptanceCriterion(row);
			} catch (error) {
				wrapConstraintViolation(error, 'add_acceptance_criterion');
			}
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'requirements' });
		}
		return record;
	}

	async updateAcceptanceCriterion(
		id: string,
		input: Partial<{
			earsPattern: string;
			triggerClause: string | null;
			conditionClause: string | null;
			stateClause: string | null;
			responseClause: string;
			fullText: string;
		}>,
		audit: AuditInfo
	): Promise<AcceptanceCriterionRecord> {
		let specId: string | null = null;
		const record = await this.withTx(async (client) => {
			const result = await client.query<AcceptanceCriterionRow>(
				`update spec_pipeline.acceptance_criteria set
					ears_pattern = coalesce($2, ears_pattern),
					trigger_clause = case when $3::boolean then $4 else trigger_clause end,
					condition_clause = case when $5::boolean then $6 else condition_clause end,
					state_clause = case when $7::boolean then $8 else state_clause end,
					response_clause = coalesce($9, response_clause),
					full_text = coalesce($10, full_text)
				 where id = $1 returning *`,
				[
					id,
					input.earsPattern ?? null,
					input.triggerClause !== undefined,
					input.triggerClause ?? null,
					input.conditionClause !== undefined,
					input.conditionClause ?? null,
					input.stateClause !== undefined,
					input.stateClause ?? null,
					input.responseClause ?? null,
					input.fullText ?? null
				]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `acceptance_criterion not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'acceptance_criteria', row.id);
			specId = await this.resolveSpecIdFromUserStoryId(client, row.user_story_id);
			return rowToAcceptanceCriterion(row);
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'requirements' });
		}
		return record;
	}

	async deleteAcceptanceCriterion(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | null = null;
		await this.withTx(async (client) => {
			const result = await client.query<{ user_story_id: string }>(
				`delete from spec_pipeline.acceptance_criteria where id = $1 returning user_story_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `acceptance_criterion not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'acceptance_criteria', id);
			specId = await this.resolveSpecIdFromUserStoryId(client, row.user_story_id);
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'requirements' });
		}
	}

	async listNonGoals(requirementsId: string): Promise<OrdinalDescriptionRecord[]> {
		return await this.nonGoals.list(requirementsId);
	}
	async addNonGoal(requirementsId: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
		return await this.nonGoals.add(requirementsId, description, audit);
	}
	async updateNonGoal(id: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
		return await this.nonGoals.update(id, description, audit);
	}
	async deleteNonGoal(id: string, audit: AuditInfo): Promise<void> {
		await this.nonGoals.delete(id, audit);
	}

	async listAssumptionsOpenQuestions(requirementsId: string): Promise<OrdinalDescriptionRecord[]> {
		return await this.assumptionsOpenQuestions.list(requirementsId);
	}
	async addAssumptionOpenQuestion(requirementsId: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
		return await this.assumptionsOpenQuestions.add(requirementsId, description, audit);
	}
	async updateAssumptionOpenQuestion(id: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
		return await this.assumptionsOpenQuestions.update(id, description, audit);
	}
	async deleteAssumptionOpenQuestion(id: string, audit: AuditInfo): Promise<void> {
		await this.assumptionsOpenQuestions.delete(id, audit);
	}

	async listGlossaryTerms(requirementsId: string): Promise<GlossaryTermRecord[]> {
		const result = await this.pool.query<GlossaryTermRow>(
			`select * from spec_pipeline.requirement_glossary_terms where requirements_id = $1 order by term asc`,
			[requirementsId]
		);
		return result.rows.map(rowToGlossaryTerm);
	}

	async addGlossaryTerm(
		requirementsId: string,
		input: { term: string; definition?: string | null; externalReference?: string | null },
		audit: AuditInfo
	): Promise<GlossaryTermRecord> {
		let specId: string | null = null;
		const record = await this.withTx(async (client) => {
			try {
				const result = await client.query<GlossaryTermRow>(
					`insert into spec_pipeline.requirement_glossary_terms (requirements_id, term, definition, external_reference)
					 values ($1, $2, $3, $4) returning *`,
					[requirementsId, input.term, input.definition ?? null, input.externalReference ?? null]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addGlossaryTerm: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'requirement_glossary_terms', row.id);
				specId = await this.resolveSpecIdFromRequirementsId(client, requirementsId);
				return rowToGlossaryTerm(row);
			} catch (error) {
				wrapConstraintViolation(error, 'add_glossary_term');
			}
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'requirements' });
		}
		return record;
	}

	async updateGlossaryTerm(
		id: string,
		input: Partial<{ term: string; definition: string | null; externalReference: string | null }>,
		audit: AuditInfo
	): Promise<GlossaryTermRecord> {
		let specId: string | null = null;
		const record = await this.withTx(async (client) => {
			const result = await client.query<GlossaryTermRow>(
				`update spec_pipeline.requirement_glossary_terms set
					term = coalesce($2, term),
					definition = case when $3::boolean then $4 else definition end,
					external_reference = case when $5::boolean then $6 else external_reference end
				 where id = $1 returning *`,
				[
					id,
					input.term ?? null,
					input.definition !== undefined,
					input.definition ?? null,
					input.externalReference !== undefined,
					input.externalReference ?? null
				]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `glossary_term not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'requirement_glossary_terms', row.id);
			specId = await this.resolveSpecIdFromRequirementsId(client, row.requirements_id);
			return rowToGlossaryTerm(row);
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'requirements' });
		}
		return record;
	}

	async deleteGlossaryTerm(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | null = null;
		await this.withTx(async (client) => {
			const result = await client.query<{ requirements_id: string }>(
				`delete from spec_pipeline.requirement_glossary_terms where id = $1 returning requirements_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `glossary_term not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'requirement_glossary_terms', id);
			specId = await this.resolveSpecIdFromRequirementsId(client, row.requirements_id);
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'requirements' });
		}
	}

	// ---------------------------------------------------------------------------
	// Design (T5.4)
	// ---------------------------------------------------------------------------

	async getDesign(specId: string): Promise<DesignRecord | null> {
		const result = await this.pool.query<DesignRow>(`select * from spec_pipeline.designs where spec_id = $1`, [specId]);
		const row = result.rows[0];
		return row === undefined ? null : rowToDesign(row);
	}

	async setDesignOverview(specId: string, input: { featureName: string; overview: string }, audit: AuditInfo): Promise<DesignRecord> {
		const record = await this.withTx(async (client) => {
			const result = await client.query<DesignRow>(
				`insert into spec_pipeline.designs (spec_id, feature_name, overview, architecture)
				 values ($1, $2, $3, '')
				 on conflict (spec_id) do update set feature_name = excluded.feature_name, overview = excluded.overview
				 returning *`,
				[specId, input.featureName, input.overview]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new Error('setDesignOverview: upsert did not return a row');
			}
			await insertAuditLogRow(client, audit, 'insert', 'designs', row.id);
			return rowToDesign(row);
		});
		this.emitChange({ type: 'spec_changed', specId, stage: 'design' });
		return record;
	}

	async setDesignArchitecture(specId: string, architecture: string, audit: AuditInfo): Promise<DesignRecord> {
		const record = await this.withTx(async (client) => {
			const result = await client.query<DesignRow>(
				`insert into spec_pipeline.designs (spec_id, feature_name, overview, architecture)
				 values ($1, '', '', $2)
				 on conflict (spec_id) do update set architecture = excluded.architecture
				 returning *`,
				[specId, architecture]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new Error('setDesignArchitecture: upsert did not return a row');
			}
			await insertAuditLogRow(client, audit, 'insert', 'designs', row.id);
			return rowToDesign(row);
		});
		this.emitChange({ type: 'spec_changed', specId, stage: 'design' });
		return record;
	}

	async listDesignComponents(designId: string): Promise<DesignComponentRecord[]> {
		const result = await this.pool.query<DesignComponentRow>(
			`select * from spec_pipeline.design_components where design_id = $1 order by ordinal asc`,
			[designId]
		);
		return result.rows.map(rowToDesignComponent);
	}

	async addDesignComponent(designId: string, input: { slug: string; displayName: string }, audit: AuditInfo): Promise<DesignComponentRecord> {
		let specId: string | null = null;
		const record = await this.withTx(async (client) => {
			const ordinal = await nextOrdinal(client, 'design_components', 'ordinal', 'design_id', designId);
			try {
				const result = await client.query<DesignComponentRow>(
					`insert into spec_pipeline.design_components (design_id, slug, display_name, ordinal)
					 values ($1, $2, $3, $4) returning *`,
					[designId, input.slug, input.displayName, ordinal]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addDesignComponent: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'design_components', row.id);
				specId = await this.resolveSpecIdFromDesignId(client, designId);
				return rowToDesignComponent(row);
			} catch (error) {
				if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23514') {
					throw new SpecRepositoryError('invalid_slug', `add_design_component: slug must be kebab-case: ${input.slug}`);
				}
				if (isUniqueViolation(error)) {
					throw new SpecRepositoryError('duplicate', `add_design_component: slug already declared for this design: ${input.slug}`);
				}
				wrapConstraintViolation(error, 'add_design_component');
			}
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'design' });
		}
		return record;
	}

	/** Repositioning a component (its ordinal) requires this explicit call -- never automatic (Story 6.4). */
	async updateDesignComponent(
		id: string,
		input: Partial<{ slug: string; displayName: string; ordinal: number }>,
		audit: AuditInfo
	): Promise<DesignComponentRecord> {
		let specId: string | null = null;
		const record = await this.withTx(async (client) => {
			try {
				const result = await client.query<DesignComponentRow>(
					`update spec_pipeline.design_components set
						slug = coalesce($2, slug),
						display_name = coalesce($3, display_name),
						ordinal = coalesce($4, ordinal)
					 where id = $1 returning *`,
					[id, input.slug ?? null, input.displayName ?? null, input.ordinal ?? null]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new SpecRepositoryError('not_found', `design_component not found: ${id}`);
				}
				await insertAuditLogRow(client, audit, 'update', 'design_components', row.id);
				specId = await this.resolveSpecIdFromDesignId(client, row.design_id);
				return rowToDesignComponent(row);
			} catch (error) {
				if (error instanceof SpecRepositoryError) {
					throw error;
				}
				if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23514') {
					throw new SpecRepositoryError('invalid_slug', `update_design_component: slug must be kebab-case`);
				}
				wrapConstraintViolation(error, 'update_design_component');
			}
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'design' });
		}
		return record;
	}

	async deleteDesignComponent(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | null = null;
		await this.withTx(async (client) => {
			const result = await client.query<{ design_id: string }>(
				`delete from spec_pipeline.design_components where id = $1 returning design_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `design_component not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'design_components', id);
			specId = await this.resolveSpecIdFromDesignId(client, row.design_id);
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'design' });
		}
	}

	async listDesignDataModelEntries(designId: string): Promise<DesignDataModelEntryRecord[]> {
		const result = await this.pool.query<DesignDataModelEntryRow>(
			`select * from spec_pipeline.design_data_model_entries where design_id = $1 order by ordinal asc`,
			[designId]
		);
		return result.rows.map(rowToDesignDataModelEntry);
	}

	async addDesignDataModelEntry(
		designId: string,
		input: { name: string; kind: string; content: string },
		audit: AuditInfo
	): Promise<DesignDataModelEntryRecord> {
		let specId: string | null = null;
		const record = await this.withTx(async (client) => {
			const ordinal = await nextOrdinal(client, 'design_data_model_entries', 'ordinal', 'design_id', designId);
			try {
				const result = await client.query<DesignDataModelEntryRow>(
					`insert into spec_pipeline.design_data_model_entries (design_id, ordinal, name, kind, content)
					 values ($1, $2, $3, $4, $5) returning *`,
					[designId, ordinal, input.name, input.kind, input.content]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addDesignDataModelEntry: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'design_data_model_entries', row.id);
				specId = await this.resolveSpecIdFromDesignId(client, designId);
				return rowToDesignDataModelEntry(row);
			} catch (error) {
				wrapConstraintViolation(error, 'add_design_data_model_entry');
			}
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'design' });
		}
		return record;
	}

	async updateDesignDataModelEntry(
		id: string,
		input: Partial<{ name: string; kind: string; content: string }>,
		audit: AuditInfo
	): Promise<DesignDataModelEntryRecord> {
		let specId: string | null = null;
		const record = await this.withTx(async (client) => {
			const result = await client.query<DesignDataModelEntryRow>(
				`update spec_pipeline.design_data_model_entries set
					name = coalesce($2, name), kind = coalesce($3, kind), content = coalesce($4, content)
				 where id = $1 returning *`,
				[id, input.name ?? null, input.kind ?? null, input.content ?? null]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `design_data_model_entry not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'design_data_model_entries', row.id);
			specId = await this.resolveSpecIdFromDesignId(client, row.design_id);
			return rowToDesignDataModelEntry(row);
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'design' });
		}
		return record;
	}

	async deleteDesignDataModelEntry(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | null = null;
		await this.withTx(async (client) => {
			const result = await client.query<{ design_id: string }>(
				`delete from spec_pipeline.design_data_model_entries where id = $1 returning design_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `design_data_model_entry not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'design_data_model_entries', id);
			specId = await this.resolveSpecIdFromDesignId(client, row.design_id);
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'design' });
		}
	}

	async listDesignTraceability(designId: string): Promise<DesignTraceabilityRecord[]> {
		const result = await this.pool.query<DesignTraceabilityRow>(
			`select * from spec_pipeline.design_traceability where design_id = $1 order by ordinal asc`,
			[designId]
		);
		return result.rows.map(rowToDesignTraceability);
	}

	async addDesignTraceability(
		designId: string,
		input: { userStoryId?: string | null; requirementLabel: string; addressedBy: string },
		audit: AuditInfo
	): Promise<DesignTraceabilityRecord> {
		let specId: string | null = null;
		const record = await this.withTx(async (client) => {
			const ordinal = await nextOrdinal(client, 'design_traceability', 'ordinal', 'design_id', designId);
			try {
				const result = await client.query<DesignTraceabilityRow>(
					`insert into spec_pipeline.design_traceability (design_id, user_story_id, requirement_label, addressed_by, ordinal)
					 values ($1, $2, $3, $4, $5) returning *`,
					[designId, input.userStoryId ?? null, input.requirementLabel, input.addressedBy, ordinal]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addDesignTraceability: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'design_traceability', row.id);
				specId = await this.resolveSpecIdFromDesignId(client, designId);
				return rowToDesignTraceability(row);
			} catch (error) {
				wrapConstraintViolation(error, 'add_design_traceability');
			}
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'design' });
		}
		return record;
	}

	async updateDesignTraceability(
		id: string,
		input: Partial<{ userStoryId: string | null; requirementLabel: string; addressedBy: string }>,
		audit: AuditInfo
	): Promise<DesignTraceabilityRecord> {
		let specId: string | null = null;
		const record = await this.withTx(async (client) => {
			const result = await client.query<DesignTraceabilityRow>(
				`update spec_pipeline.design_traceability set
					user_story_id = case when $2::boolean then $3 else user_story_id end,
					requirement_label = coalesce($4, requirement_label),
					addressed_by = coalesce($5, addressed_by)
				 where id = $1 returning *`,
				[id, input.userStoryId !== undefined, input.userStoryId ?? null, input.requirementLabel ?? null, input.addressedBy ?? null]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `design_traceability not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'design_traceability', row.id);
			specId = await this.resolveSpecIdFromDesignId(client, row.design_id);
			return rowToDesignTraceability(row);
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'design' });
		}
		return record;
	}

	async deleteDesignTraceability(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | null = null;
		await this.withTx(async (client) => {
			const result = await client.query<{ design_id: string }>(
				`delete from spec_pipeline.design_traceability where id = $1 returning design_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `design_traceability not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'design_traceability', id);
			specId = await this.resolveSpecIdFromDesignId(client, row.design_id);
		});
		if (specId !== null) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'design' });
		}
	}

	async listDesignAlternatives(designId: string): Promise<OrdinalDescriptionRecord[]> {
		return await this.designAlternatives.list(designId);
	}
	async addDesignAlternative(designId: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
		return await this.designAlternatives.add(designId, description, audit);
	}
	async updateDesignAlternative(id: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
		return await this.designAlternatives.update(id, description, audit);
	}
	async deleteDesignAlternative(id: string, audit: AuditInfo): Promise<void> {
		await this.designAlternatives.delete(id, audit);
	}

	async listDesignOpenRisks(designId: string): Promise<OrdinalDescriptionRecord[]> {
		return await this.designOpenRisks.list(designId);
	}
	async addDesignOpenRisk(designId: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
		return await this.designOpenRisks.add(designId, description, audit);
	}
	async updateDesignOpenRisk(id: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
		return await this.designOpenRisks.update(id, description, audit);
	}
	async deleteDesignOpenRisk(id: string, audit: AuditInfo): Promise<void> {
		await this.designOpenRisks.delete(id, audit);
	}

	async listDesignFlags(designId: string): Promise<OrdinalDescriptionRecord[]> {
		return await this.designFlags.list(designId);
	}
	async addDesignFlag(designId: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
		return await this.designFlags.add(designId, description, audit);
	}
	async updateDesignFlag(id: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
		return await this.designFlags.update(id, description, audit);
	}
	async deleteDesignFlag(id: string, audit: AuditInfo): Promise<void> {
		await this.designFlags.delete(id, audit);
	}

	// ---------------------------------------------------------------------------
	// Tasks -- component-scoped (T5.5)
	// ---------------------------------------------------------------------------

	async listTasksDocs(specId: string): Promise<TasksDocRecord[]> {
		const result = await this.pool.query<TasksDocRow>(
			`select * from spec_pipeline.tasks_docs where spec_id = $1 order by component_slug asc`,
			[specId]
		);
		return result.rows.map(rowToTasksDoc);
	}

	async getTasksDocByComponent(specId: string, componentSlug: string): Promise<TasksDocRecord | null> {
		const result = await this.pool.query<TasksDocRow>(
			`select * from spec_pipeline.tasks_docs where spec_id = $1 and component_slug = $2`,
			[specId, componentSlug]
		);
		const row = result.rows[0];
		return row === undefined ? null : rowToTasksDoc(row);
	}

	/** Resolves a component slug to its `tasks_docs.id`, rejecting when the component is unknown. */
	private async resolveTasksDocId(client: PoolClient, specId: string, componentSlug: string): Promise<string> {
		const result = await client.query<{ id: string }>(
			`select id from spec_pipeline.tasks_docs where spec_id = $1 and component_slug = $2`,
			[specId, componentSlug]
		);
		const row = result.rows[0];
		if (row === undefined) {
			throw new SpecRepositoryError('unknown_component', `component not found for this spec: ${componentSlug}`);
		}
		return row.id;
	}

	async listTaskItems(tasksDocId: string): Promise<TaskItemRecord[]> {
		const result = await this.pool.query<TaskItemRow>(
			`select * from spec_pipeline.task_items where tasks_doc_id = $1 order by execution_order asc`,
			[tasksDocId]
		);
		return result.rows.map(rowToTaskItem);
	}

	/**
	 * `item_id` (the stable '1'/'1.1' label) and `execution_order` are both derived
	 * append-only -- neither is an explicit caller-supplied position argument
	 * (Story 6.3, 6.4), consistent with T5.9's shared ordinal helper.
	 */
	async addTaskItem(
		specId: string,
		componentSlug: string,
		input: {
			parentItemId?: string | null;
			title: string;
			description: string;
			traceability: string;
			suggestedAgent?: string;
			acceptanceCheck: string;
		},
		audit: AuditInfo
	): Promise<TaskItemRecord> {
		const record = await this.withTx(async (client) => {
			const tasksDocId = await this.resolveTasksDocId(client, specId, componentSlug);
			const parentItemId = input.parentItemId ?? null;
			let itemId: string;
			if (parentItemId !== null) {
				const parentResult = await client.query<{ item_id: string }>(
					`select item_id from spec_pipeline.task_items where id = $1 and tasks_doc_id = $2`,
					[parentItemId, tasksDocId]
				);
				const parentRow = parentResult.rows[0];
				if (parentRow === undefined) {
					throw new SpecRepositoryError('parent_not_found', `parent task_item not found in this component: ${parentItemId}`);
				}
				const childCount = await client.query<{ count: string }>(
					`select count(*)::int as count from spec_pipeline.task_items where parent_item_id = $1`,
					[parentItemId]
				);
				itemId = `${parentRow.item_id}.${Number(childCount.rows[0]?.count ?? 0) + 1}`;
			} else {
				const topLevelCount = await client.query<{ count: string }>(
					`select count(*)::int as count from spec_pipeline.task_items where tasks_doc_id = $1 and parent_item_id is null`,
					[tasksDocId]
				);
				itemId = `${Number(topLevelCount.rows[0]?.count ?? 0) + 1}`;
			}
			const executionOrder = await nextOrdinal(client, 'task_items', 'execution_order', 'tasks_doc_id', tasksDocId);
			const result = await client.query<TaskItemRow>(
				`insert into spec_pipeline.task_items
					(tasks_doc_id, item_id, parent_item_id, execution_order, title, description, traceability, suggested_agent, acceptance_check)
				 values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
				[
					tasksDocId,
					itemId,
					parentItemId,
					executionOrder,
					input.title,
					input.description,
					input.traceability,
					input.suggestedAgent ?? 'none',
					input.acceptanceCheck
				]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new Error('addTaskItem: insert did not return a row');
			}
			await insertAuditLogRow(client, audit, 'insert', 'task_items', row.id);
			return rowToTaskItem(row);
		});
		this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component: componentSlug });
		return record;
	}

	async updateTaskItem(
		id: string,
		input: Partial<{
			title: string;
			description: string;
			traceability: string;
			suggestedAgent: string;
			acceptanceCheck: string;
			isChecked: boolean;
		}>,
		audit: AuditInfo
	): Promise<TaskItemRecord> {
		let specId: string | undefined;
		let component: string | undefined;
		const record = await this.withTx(async (client) => {
			const result = await client.query<TaskItemRow>(
				`update spec_pipeline.task_items set
					title = coalesce($2, title),
					description = coalesce($3, description),
					traceability = coalesce($4, traceability),
					suggested_agent = coalesce($5, suggested_agent),
					acceptance_check = coalesce($6, acceptance_check),
					is_checked = coalesce($7, is_checked)
				 where id = $1 returning *`,
				[
					id,
					input.title ?? null,
					input.description ?? null,
					input.traceability ?? null,
					input.suggestedAgent ?? null,
					input.acceptanceCheck ?? null,
					input.isChecked ?? null
				]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `task_item not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'task_items', row.id);
			const resolved = await this.resolveSpecAndComponentFromTasksDocId(client, row.tasks_doc_id);
			specId = resolved.specId;
			component = resolved.component;
			return rowToTaskItem(row);
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component });
		}
		return record;
	}

	async deleteTaskItem(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | undefined;
		let component: string | undefined;
		await this.withTx(async (client) => {
			const result = await client.query<{ tasks_doc_id: string }>(
				`delete from spec_pipeline.task_items where id = $1 returning tasks_doc_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `task_item not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'task_items', id);
			const resolved = await this.resolveSpecAndComponentFromTasksDocId(client, row.tasks_doc_id);
			specId = resolved.specId;
			component = resolved.component;
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component });
		}
	}

	async listTaskFilesTouched(taskItemId: string): Promise<TaskFileTouchedRecord[]> {
		const result = await this.pool.query<TaskFileTouchedRow>(
			`select * from spec_pipeline.task_files_touched where task_item_id = $1 order by ordinal asc`,
			[taskItemId]
		);
		return result.rows.map(rowToTaskFileTouched);
	}

	async addTaskFileTouched(taskItemId: string, filePath: string, audit: AuditInfo): Promise<TaskFileTouchedRecord> {
		let specId: string | undefined;
		let component: string | undefined;
		const record = await this.withTx(async (client) => {
			const ordinal = await nextOrdinal(client, 'task_files_touched', 'ordinal', 'task_item_id', taskItemId);
			try {
				const result = await client.query<TaskFileTouchedRow>(
					`insert into spec_pipeline.task_files_touched (task_item_id, ordinal, file_path) values ($1, $2, $3) returning *`,
					[taskItemId, ordinal, filePath]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addTaskFileTouched: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'task_files_touched', row.id);
				const resolved = await this.resolveSpecAndComponentFromTaskItemId(client, taskItemId);
				specId = resolved.specId;
				component = resolved.component;
				return rowToTaskFileTouched(row);
			} catch (error) {
				wrapConstraintViolation(error, 'add_task_file_touched');
			}
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component });
		}
		return record;
	}

	async updateTaskFileTouched(id: string, filePath: string, audit: AuditInfo): Promise<TaskFileTouchedRecord> {
		let specId: string | undefined;
		let component: string | undefined;
		const record = await this.withTx(async (client) => {
			const result = await client.query<TaskFileTouchedRow>(
				`update spec_pipeline.task_files_touched set file_path = $2 where id = $1 returning *`,
				[id, filePath]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `task_file_touched not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'task_files_touched', row.id);
			const resolved = await this.resolveSpecAndComponentFromTaskItemId(client, row.task_item_id);
			specId = resolved.specId;
			component = resolved.component;
			return rowToTaskFileTouched(row);
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component });
		}
		return record;
	}

	async deleteTaskFileTouched(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | undefined;
		let component: string | undefined;
		await this.withTx(async (client) => {
			const result = await client.query<{ task_item_id: string }>(
				`delete from spec_pipeline.task_files_touched where id = $1 returning task_item_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `task_file_touched not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'task_files_touched', id);
			const resolved = await this.resolveSpecAndComponentFromTaskItemId(client, row.task_item_id);
			specId = resolved.specId;
			component = resolved.component;
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component });
		}
	}

	async listParallelBatches(tasksDocId: string): Promise<ParallelBatchRecord[]> {
		const result = await this.pool.query<ParallelBatchRow>(
			`select * from spec_pipeline.parallel_batches where tasks_doc_id = $1 order by batch_order asc`,
			[tasksDocId]
		);
		return result.rows.map(rowToParallelBatch);
	}

	/** `batch_label` (`P1`, `P2`, ...) is derived from the auto-assigned `batch_order`, never caller-supplied. */
	async addParallelBatch(specId: string, componentSlug: string, audit: AuditInfo): Promise<ParallelBatchRecord> {
		const record = await this.withTx(async (client) => {
			const tasksDocId = await this.resolveTasksDocId(client, specId, componentSlug);
			const batchOrder = await nextOrdinal(client, 'parallel_batches', 'batch_order', 'tasks_doc_id', tasksDocId);
			const result = await client.query<ParallelBatchRow>(
				`insert into spec_pipeline.parallel_batches (tasks_doc_id, batch_label, batch_order) values ($1, $2, $3) returning *`,
				[tasksDocId, `P${batchOrder}`, batchOrder]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new Error('addParallelBatch: insert did not return a row');
			}
			await insertAuditLogRow(client, audit, 'insert', 'parallel_batches', row.id);
			return rowToParallelBatch(row);
		});
		this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component: componentSlug });
		return record;
	}

	/** Repositioning a batch (its label/order) requires this explicit call -- never automatic reindex (Story 6.4). */
	async updateParallelBatch(id: string, input: Partial<{ batchLabel: string; batchOrder: number }>, audit: AuditInfo): Promise<ParallelBatchRecord> {
		let specId: string | undefined;
		let component: string | undefined;
		const record = await this.withTx(async (client) => {
			const result = await client.query<ParallelBatchRow>(
				`update spec_pipeline.parallel_batches set
					batch_label = coalesce($2, batch_label), batch_order = coalesce($3, batch_order)
				 where id = $1 returning *`,
				[id, input.batchLabel ?? null, input.batchOrder ?? null]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `parallel_batch not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'parallel_batches', row.id);
			const resolved = await this.resolveSpecAndComponentFromTasksDocId(client, row.tasks_doc_id);
			specId = resolved.specId;
			component = resolved.component;
			return rowToParallelBatch(row);
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component });
		}
		return record;
	}

	async deleteParallelBatch(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | undefined;
		let component: string | undefined;
		await this.withTx(async (client) => {
			const result = await client.query<{ tasks_doc_id: string }>(
				`delete from spec_pipeline.parallel_batches where id = $1 returning tasks_doc_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `parallel_batch not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'parallel_batches', id);
			const resolved = await this.resolveSpecAndComponentFromTasksDocId(client, row.tasks_doc_id);
			specId = resolved.specId;
			component = resolved.component;
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component });
		}
	}

	async listParallelBatchMembers(batchId: string): Promise<ParallelBatchMemberRecord[]> {
		const result = await this.pool.query<ParallelBatchMemberRow>(
			`select * from spec_pipeline.parallel_batch_members where batch_id = $1`,
			[batchId]
		);
		return result.rows.map(rowToParallelBatchMember);
	}

	async addParallelBatchMember(batchId: string, taskItemId: string, audit: AuditInfo): Promise<ParallelBatchMemberRecord> {
		let specId: string | undefined;
		let component: string | undefined;
		const record = await this.withTx(async (client) => {
			try {
				const result = await client.query<ParallelBatchMemberRow>(
					`insert into spec_pipeline.parallel_batch_members (batch_id, task_item_id) values ($1, $2) returning *`,
					[batchId, taskItemId]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addParallelBatchMember: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'parallel_batch_members', row.id);
				const resolved = await this.resolveSpecAndComponentFromBatchId(client, batchId);
				specId = resolved.specId;
				component = resolved.component;
				return rowToParallelBatchMember(row);
			} catch (error) {
				wrapConstraintViolation(error, 'add_parallel_batch_member');
			}
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component });
		}
		return record;
	}

	/** Changes which task_item a batch membership points to. */
	async updateParallelBatchMember(id: string, taskItemId: string, audit: AuditInfo): Promise<ParallelBatchMemberRecord> {
		let specId: string | undefined;
		let component: string | undefined;
		const record = await this.withTx(async (client) => {
			try {
				const result = await client.query<ParallelBatchMemberRow>(
					`update spec_pipeline.parallel_batch_members set task_item_id = $2 where id = $1 returning *`,
					[id, taskItemId]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new SpecRepositoryError('not_found', `parallel_batch_member not found: ${id}`);
				}
				await insertAuditLogRow(client, audit, 'update', 'parallel_batch_members', row.id);
				const resolved = await this.resolveSpecAndComponentFromBatchId(client, row.batch_id);
				specId = resolved.specId;
				component = resolved.component;
				return rowToParallelBatchMember(row);
			} catch (error) {
				if (error instanceof SpecRepositoryError) {
					throw error;
				}
				wrapConstraintViolation(error, 'update_parallel_batch_member');
			}
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component });
		}
		return record;
	}

	async deleteParallelBatchMember(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | undefined;
		let component: string | undefined;
		await this.withTx(async (client) => {
			const result = await client.query<{ batch_id: string }>(
				`delete from spec_pipeline.parallel_batch_members where id = $1 returning batch_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `parallel_batch_member not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'parallel_batch_members', id);
			const resolved = await this.resolveSpecAndComponentFromBatchId(client, row.batch_id);
			specId = resolved.specId;
			component = resolved.component;
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component });
		}
	}

	async listTasksFlags(tasksDocId: string): Promise<OrdinalDescriptionRecord[]> {
		return await this.tasksFlags.list(tasksDocId);
	}
	/**
	 * Deliberately does not delegate to the shared `tasksFlags` (`OrdinalDescriptionCrud`)
	 * helper used for the other five ordinal-description tables -- `tasks_flags` is the
	 * only one of those six scoped to the tasks stage, and its `spec_changed` event
	 * (spec-change-events, Story 4 AC1/AC2) needs a `component`, which the shared
	 * `resolveSpecId`-only emission hook can't carry. `specId`/`componentSlug` are already
	 * known from the caller here, so no extra resolution query is needed.
	 */
	async addTasksFlag(specId: string, componentSlug: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
		const record = await this.withTx(async (client) => {
			const tasksDocId = await this.resolveTasksDocId(client, specId, componentSlug);
			const ordinal = await nextOrdinal(client, 'tasks_flags', 'ordinal', 'tasks_doc_id', tasksDocId);
			try {
				const result = await client.query<OrdinalDescriptionRow>(
					`insert into spec_pipeline.tasks_flags (tasks_doc_id, ordinal, description) values ($1, $2, $3) returning id, ordinal, description`,
					[tasksDocId, ordinal, description]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addTasksFlag: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'tasks_flags', row.id);
				return rowToOrdinalDescription(row);
			} catch (error) {
				wrapConstraintViolation(error, 'add_tasks_flag');
			}
		});
		this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component: componentSlug });
		return record;
	}
	/** `tasks_flags.id` doesn't carry `specId`/`component` itself, so those are resolved
	 * from the updated row's `tasks_doc_id` (via `resolveSpecAndComponentFromTasksDocId`,
	 * spec-change-events Story 4 AC1/AC2) inside the same transaction as the update. */
	async updateTasksFlag(id: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord> {
		let specId: string | undefined;
		let component: string | undefined;
		const record = await this.withTx(async (client) => {
			const result = await client.query<OrdinalDescriptionRow & { tasks_doc_id: string }>(
				`update spec_pipeline.tasks_flags set description = $2 where id = $1 returning id, ordinal, description, tasks_doc_id`,
				[id, description]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `tasks_flags row not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'tasks_flags', row.id);
			const resolved = await this.resolveSpecAndComponentFromTasksDocId(client, row.tasks_doc_id);
			specId = resolved.specId;
			component = resolved.component;
			return rowToOrdinalDescription(row);
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component });
		}
		return record;
	}
	async deleteTasksFlag(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | undefined;
		let component: string | undefined;
		await this.withTx(async (client) => {
			const result = await client.query<{ tasks_doc_id: string }>(
				`delete from spec_pipeline.tasks_flags where id = $1 returning tasks_doc_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `tasks_flags row not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'tasks_flags', id);
			const resolved = await this.resolveSpecAndComponentFromTasksDocId(client, row.tasks_doc_id);
			specId = resolved.specId;
			component = resolved.component;
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks', component });
		}
	}


	// Definition of Done -- spec-scoped, shared across every component (Story 16.9).

	async listDefinitionOfDoneItems(specId: string): Promise<DefinitionOfDoneItemRecord[]> {
		const result = await this.pool.query<DefinitionOfDoneItemRow>(
			`select * from spec_pipeline.definition_of_done_items where spec_id = $1 order by ordinal asc`,
			[specId]
		);
		return result.rows.map(rowToDefinitionOfDoneItem);
	}

	/** `specId` is a direct param, so no FK-chain resolution query is needed for the
	 * post-commit `spec_changed` event -- Definition of Done items are spec-wide (Story
	 * 16.9), not per-component, so the event carries no `component` (spec-change-events,
	 * Story 4 AC1/AC2). */
	async addDefinitionOfDoneItem(specId: string, description: string, audit: AuditInfo): Promise<DefinitionOfDoneItemRecord> {
		const record = await this.withTx(async (client) => {
			const ordinal = await nextOrdinal(client, 'definition_of_done_items', 'ordinal', 'spec_id', specId);
			try {
				const result = await client.query<DefinitionOfDoneItemRow>(
					`insert into spec_pipeline.definition_of_done_items (spec_id, ordinal, description) values ($1, $2, $3) returning *`,
					[specId, ordinal, description]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addDefinitionOfDoneItem: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'definition_of_done_items', row.id);
				return rowToDefinitionOfDoneItem(row);
			} catch (error) {
				wrapConstraintViolation(error, 'add_definition_of_done_item');
			}
		});
		this.emitChange({ type: 'spec_changed', specId, stage: 'tasks' });
		return record;
	}

	async updateDefinitionOfDoneItem(
		id: string,
		input: Partial<{ description: string; isChecked: boolean }>,
		audit: AuditInfo
	): Promise<DefinitionOfDoneItemRecord> {
		const record = await this.withTx(async (client) => {
			const result = await client.query<DefinitionOfDoneItemRow>(
				`update spec_pipeline.definition_of_done_items set
					description = coalesce($2, description),
					is_checked = coalesce($3, is_checked)
				 where id = $1 returning *`,
				[id, input.description ?? null, input.isChecked ?? null]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `definition_of_done_item not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'update', 'definition_of_done_items', row.id);
			return rowToDefinitionOfDoneItem(row);
		});
		this.emitChange({ type: 'spec_changed', specId: record.specId, stage: 'tasks' });
		return record;
	}

	async deleteDefinitionOfDoneItem(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | undefined;
		await this.withTx(async (client) => {
			const result = await client.query<{ spec_id: string }>(
				`delete from spec_pipeline.definition_of_done_items where id = $1 returning spec_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `definition_of_done_item not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'definition_of_done_items', id);
			specId = row.spec_id;
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks' });
		}
	}

	// Cross-component task dependency edges (Story 16). No cycle check here on
	// purpose (Story 16.3) -- see finalizeStage's cycle detection instead.

	async listTaskDependencyEdges(specId: string): Promise<TaskDependencyEdgeRecord[]> {
		const result = await this.pool.query<TaskDependencyEdgeRow>(
			`select * from spec_pipeline.task_dependency_edges where spec_id = $1 order by created_at asc`,
			[specId]
		);
		return result.rows.map(rowToTaskDependencyEdge);
	}

	async addTaskDependencyEdge(
		specId: string,
		input: { fromTaskItemId: string; toTaskItemId: string },
		audit: AuditInfo
	): Promise<TaskDependencyEdgeRecord> {
		const record = await this.withTx(async (client) => {
			const endpointsResult = await client.query<{ id: string; tasks_doc_id: string }>(
				`select id, tasks_doc_id from spec_pipeline.task_items where id in ($1, $2)`,
				[input.fromTaskItemId, input.toTaskItemId]
			);
			const fromRow = endpointsResult.rows.find((row) => row.id === input.fromTaskItemId);
			const toRow = endpointsResult.rows.find((row) => row.id === input.toTaskItemId);
			if (fromRow === undefined || toRow === undefined) {
				throw new SpecRepositoryError('parent_not_found', 'add_task_dependency_edge: from/to task_item does not exist');
			}
			if (fromRow.tasks_doc_id === toRow.tasks_doc_id) {
				throw new SpecRepositoryError(
					'same_component_edge',
					'add_task_dependency_edge: from and to task items belong to the same component -- cross-component edges only'
				);
			}
			try {
				const result = await client.query<TaskDependencyEdgeRow>(
					`insert into spec_pipeline.task_dependency_edges (spec_id, from_task_item_id, to_task_item_id)
					 values ($1, $2, $3) returning *`,
					[specId, input.fromTaskItemId, input.toTaskItemId]
				);
				const row = result.rows[0];
				if (row === undefined) {
					throw new Error('addTaskDependencyEdge: insert did not return a row');
				}
				await insertAuditLogRow(client, audit, 'insert', 'task_dependency_edges', row.id);
				return rowToTaskDependencyEdge(row);
			} catch (error) {
				if (error instanceof SpecRepositoryError) {
					throw error;
				}
				wrapConstraintViolation(error, 'add_task_dependency_edge');
			}
		});
		// Cross-component by construction (Story 16.2 rejects same-component edges), so
		// there's no single owning component for the `spec_changed` event to carry
		// (spec-change-events, Story 4 AC1/AC2) -- `specId` is already a direct param.
		this.emitChange({ type: 'spec_changed', specId, stage: 'tasks' });
		return record;
	}

	async deleteTaskDependencyEdge(id: string, audit: AuditInfo): Promise<void> {
		let specId: string | undefined;
		await this.withTx(async (client) => {
			const result = await client.query<{ spec_id: string }>(
				`delete from spec_pipeline.task_dependency_edges where id = $1 returning spec_id`,
				[id]
			);
			const row = result.rows[0];
			if (row === undefined) {
				throw new SpecRepositoryError('not_found', `task_dependency_edge not found: ${id}`);
			}
			await insertAuditLogRow(client, audit, 'delete', 'task_dependency_edges', id);
			specId = row.spec_id;
		});
		if (specId !== undefined) {
			this.emitChange({ type: 'spec_changed', specId, stage: 'tasks' });
		}
	}

	// ---------------------------------------------------------------------------
	// finalize_stage (T5.6)
	// ---------------------------------------------------------------------------

	/**
	 * Cross-component cycle detection (Story 16.4), run on every tasks-stage finalize
	 * call over *all* of the spec's edges. This walks the same shape of `WITH
	 * RECURSIVE` query design.md illustrates, with one deliberate correction: `path`
	 * only tracks nodes visited *after* the start of the walk (never the origin
	 * itself). Seeding `path` with both endpoints (as the illustrative comment in
	 * schema.sql does) would prune the very edge that closes a short cycle back to
	 * its own origin -- e.g. a direct two-node mutual dependency (A -> B, B -> A)
	 * would never surface, since the recursive step's "already visited" guard would
	 * reject re-arriving at A precisely because A seeded its own path. Excluding the
	 * origin from `path` still blocks runaway recursion through any *other* shared
	 * node (a real revisit), while allowing the walk to correctly land back on the
	 * origin and trip the final `to_id = from_id` check.
	 */
	private async hasTaskDependencyCycle(client: PoolClient, specId: string): Promise<boolean> {
		const result = await client.query(
			`with recursive reach(from_id, to_id, path) as (
				select from_task_item_id, to_task_item_id, array[to_task_item_id]
				from spec_pipeline.task_dependency_edges where spec_id = $1
			  union all
				select r.from_id, e.to_task_item_id, r.path || e.to_task_item_id
				from reach r
				join spec_pipeline.task_dependency_edges e
				  on e.from_task_item_id = r.to_id and e.spec_id = $1
				where not e.to_task_item_id = any(r.path)
			)
			select 1 from reach where to_id = from_id limit 1`,
			[specId]
		);
		return result.rowCount > 0;
	}

	async finalizeStage(specId: string, stage: SpecStageName, componentSlug: string | undefined, audit: AuditInfo): Promise<FinalizeStageResult> {
		const result = await this.withTx(async (client) => {
			const stagesResult = await client.query<{ stage_name: string; status: string }>(
				`select stage_name, status from spec_pipeline.spec_stages where spec_id = $1`,
				[specId]
			);
			const statusOf = (name: string): string | undefined => stagesResult.rows.find((row) => row.stage_name === name)?.status;

			if (stage === 'requirements') {
				const requirementsResult = await client.query<{ id: string }>(
					`select id from spec_pipeline.requirements where spec_id = $1`,
					[specId]
				);
				const requirementsRow = requirementsResult.rows[0];
				if (requirementsRow === undefined) {
					throw new SpecRepositoryError('not_found', 'requirements not found for this spec');
				}
				const storiesResult = await client.query<{ id: string }>(
					`select id from spec_pipeline.user_stories where requirements_id = $1`,
					[requirementsRow.id]
				);
				if (storiesResult.rowCount === 0) {
					throw new SpecRepositoryError('zero_top_level_items', 'requirements has zero user stories');
				}
				for (const story of storiesResult.rows) {
					const criteriaResult = await client.query<{ count: string }>(
						`select count(*)::int as count from spec_pipeline.acceptance_criteria where user_story_id = $1`,
						[story.id]
					);
					if (Number(criteriaResult.rows[0]?.count ?? 0) === 0) {
						throw new SpecRepositoryError('zero_acceptance_criteria', `user story ${story.id} has zero acceptance criteria`);
					}
				}
				await client.query(
					`update spec_pipeline.spec_stages set status = 'in_review' where spec_id = $1 and stage_name = 'requirements'`,
					[specId]
				);
				await insertAuditLogRow(client, audit, 'finalize', 'spec_stages', specId);
				return { stage, status: 'in_review' };
			}

			if (stage === 'design') {
				if (statusOf('requirements') !== 'approved') {
					throw new SpecRepositoryError('predecessor_not_approved', 'requirements stage is not approved');
				}
				const designResult = await client.query<{ id: string }>(`select id from spec_pipeline.designs where spec_id = $1`, [specId]);
				const designRow = designResult.rows[0];
				if (designRow === undefined) {
					throw new SpecRepositoryError('not_found', 'design not found for this spec');
				}
				const componentsResult = await client.query<{ id: string; slug: string }>(
					`select id, slug from spec_pipeline.design_components where design_id = $1`,
					[designRow.id]
				);
				if (componentsResult.rowCount === 0) {
					throw new SpecRepositoryError('zero_components', 'design has zero declared components');
				}
				const currentSlugs = new Set(componentsResult.rows.map((row) => row.slug));

				// Redraft reconciliation (design §Data Model 3): orphaned, still-empty
				// task docs are deleted; orphaned docs with drafted content block finalize.
				const existingDocsResult = await client.query<{ id: string; component_slug: string; status: string; item_count: string }>(
					`select td.id, td.component_slug, td.status,
						(select count(*)::int from spec_pipeline.task_items ti where ti.tasks_doc_id = td.id) as item_count
					 from spec_pipeline.tasks_docs td where td.spec_id = $1`,
					[specId]
				);
				for (const doc of existingDocsResult.rows) {
					if (currentSlugs.has(doc.component_slug)) {
						continue;
					}
					if (doc.status === 'not_started' && Number(doc.item_count) === 0) {
						await client.query(`delete from spec_pipeline.tasks_docs where id = $1`, [doc.id]);
					} else {
						throw new SpecRepositoryError(
							'orphaned_component_has_content',
							`component '${doc.component_slug}' was removed from design but its task document still has drafted content`
						);
					}
				}

				await client.query(`update spec_pipeline.spec_stages set status = 'in_review' where spec_id = $1 and stage_name = 'design'`, [specId]);
				await insertAuditLogRow(client, audit, 'finalize', 'spec_stages', specId);
				return { stage, status: 'in_review' };
			}

			// stage === 'tasks'
			if (componentSlug === undefined) {
				throw new SpecRepositoryError('component_required', 'component is required to finalize the tasks stage');
			}
			if (statusOf('design') !== 'approved') {
				throw new SpecRepositoryError('predecessor_not_approved', 'design stage is not approved');
			}
			const tasksDocId = await this.resolveTasksDocId(client, specId, componentSlug);
			const topLevelResult = await client.query<{ id: string }>(
				`select id from spec_pipeline.task_items where tasks_doc_id = $1 and parent_item_id is null`,
				[tasksDocId]
			);
			if (topLevelResult.rowCount === 0) {
				throw new SpecRepositoryError('zero_top_level_items', `component '${componentSlug}' has zero task items`);
			}
			for (const item of topLevelResult.rows) {
				const filesResult = await client.query<{ count: string }>(
					`select count(*)::int as count from spec_pipeline.task_files_touched where task_item_id = $1`,
					[item.id]
				);
				if (Number(filesResult.rows[0]?.count ?? 0) === 0) {
					throw new SpecRepositoryError('zero_task_files_touched', `top-level task item ${item.id} has zero files touched`);
				}
			}
			if (await this.hasTaskDependencyCycle(client, specId)) {
				throw new SpecRepositoryError('cycle_detected', "a cycle exists in this spec's task_dependency_edges");
			}
			await client.query(`update spec_pipeline.tasks_docs set status = 'in_review' where id = $1`, [tasksDocId]);
			await insertAuditLogRow(client, audit, 'finalize', 'tasks_docs', tasksDocId);
			return { stage, componentSlug, status: 'in_review' };
		});
		this.emitChange({ type: 'spec_changed', specId, stage: result.stage, component: result.componentSlug });
		return result;
	}

	// ---------------------------------------------------------------------------
	// approve_stage / deny_stage (stage-approval-write-path)
	// ---------------------------------------------------------------------------

	/**
	 * Shared implementation behind `approveStage`/`denyStage`: symmetric with
	 * `finalizeStage`'s per-stage dispatch, running inside the same `withTx` pattern
	 * so the status update and its `audit_log` row commit atomically. For
	 * `requirements`/`design` the target is the `spec_stages` row; for `tasks` it's
	 * the `tasks_docs` row resolved via `resolveTasksDocId` (component required).
	 * Both directions require the current status to be `'in_review'` -- approving or
	 * denying a stage that hasn't been finalized (or was already decided) is rejected
	 * with `not_in_review` rather than silently overwriting state. Deny intentionally
	 * reuses the `'not_started'` status (design §Alternatives) rather than a separate
	 * redraft/denied enum value, putting the stage back at its pre-finalize state.
	 */
	private async transitionStageStatus<Status extends 'approved' | 'not_started'>(
		specId: string,
		stage: SpecStageName,
		componentSlug: string | undefined,
		targetStatus: Status,
		action: 'approve' | 'deny',
		audit: AuditInfo
	): Promise<{ stage: SpecStageName; componentSlug?: string; status: Status }> {
		return await this.withTx(async (client) => {
			if (stage === 'requirements' || stage === 'design') {
				const result = await client.query<{ id: string; status: string }>(
					`select id, status from spec_pipeline.spec_stages where spec_id = $1 and stage_name = $2`,
					[specId, stage]
				);
				const row = result.rows[0];
				if (row === undefined || row.status !== 'in_review') {
					throw new SpecRepositoryError('not_in_review', `${stage} stage is not in_review`);
				}
				await client.query(`update spec_pipeline.spec_stages set status = $2 where id = $1`, [row.id, targetStatus]);
				await insertAuditLogRow(client, audit, action, 'spec_stages', row.id);
				return { stage, status: targetStatus };
			}

			// stage === 'tasks'
			if (componentSlug === undefined) {
				throw new SpecRepositoryError('component_required', `component is required to ${action} the tasks stage`);
			}
			const tasksDocId = await this.resolveTasksDocId(client, specId, componentSlug);
			const statusResult = await client.query<{ status: string }>(
				`select status from spec_pipeline.tasks_docs where id = $1`,
				[tasksDocId]
			);
			const currentStatus = statusResult.rows[0]?.status;
			if (currentStatus !== 'in_review') {
				throw new SpecRepositoryError('not_in_review', `tasks stage for component '${componentSlug}' is not in_review`);
			}
			await client.query(`update spec_pipeline.tasks_docs set status = $2 where id = $1`, [tasksDocId, targetStatus]);
			await insertAuditLogRow(client, audit, action, 'tasks_docs', tasksDocId);
			return { stage, componentSlug, status: targetStatus };
		});
	}

	async approveStage(specId: string, stage: SpecStageName, componentSlug: string | undefined, audit: AuditInfo): Promise<ApproveStageResult> {
		const result = await this.transitionStageStatus(specId, stage, componentSlug, 'approved', 'approve', audit);
		this.emitChange({ type: 'spec_changed', specId, stage: result.stage, component: result.componentSlug });
		return result;
	}

	async denyStage(specId: string, stage: SpecStageName, componentSlug: string | undefined, audit: AuditInfo): Promise<DenyStageResult> {
		const result = await this.transitionStageStatus(specId, stage, componentSlug, 'not_started', 'deny', audit);
		this.emitChange({ type: 'spec_changed', specId, stage: result.stage, component: result.componentSlug });
		return result;
	}

	// ---------------------------------------------------------------------------
	// get_next_stage (T5.7)
	// ---------------------------------------------------------------------------

	async getNextStage(specId: string): Promise<GetNextStageResult> {
		const stagesResult = await this.pool.query<{ stage_name: string; status: string }>(
			`select stage_name, status from spec_pipeline.spec_stages where spec_id = $1`,
			[specId]
		);
		const statusOf = (name: string): string | undefined => stagesResult.rows.find((row) => row.stage_name === name)?.status;

		const docsResult = await this.pool.query<{ component_slug: string; status: string }>(
			`select component_slug, status from spec_pipeline.tasks_docs where spec_id = $1 order by component_slug asc`,
			[specId]
		);
		const docs = docsResult.rows;
		const tasksApproved = docs.length > 0 && docs.every((doc) => doc.status === 'approved');

		if (statusOf('requirements') !== 'approved') {
			return { actionableStage: 'requirements' };
		}
		if (statusOf('design') !== 'approved') {
			return { actionableStage: 'design' };
		}
		if (!tasksApproved) {
			const laggingComponents = docs.filter((doc) => doc.status !== 'in_review' && doc.status !== 'approved').map((doc) => doc.component_slug);
			return { actionableStage: 'tasks', laggingComponents };
		}
		return { actionableStage: null };
	}

	// ---------------------------------------------------------------------------
	// render_document (T5.8)
	// ---------------------------------------------------------------------------

	async renderDocument(specId: string, stage: SpecStageName, component?: string): Promise<string> {
		if (stage === 'requirements') {
			return await this.renderRequirements(specId);
		}
		if (stage === 'design') {
			return await this.renderDesign(specId);
		}
		if (component === undefined || component === 'all') {
			return await this.renderTasksIndex(specId);
		}
		return await this.renderComponentTasks(specId, component);
	}

	private async renderRequirements(specId: string): Promise<string> {
		const spec = await this.getSpec(specId);
		const requirements = await this.getRequirements(specId);
		if (spec === null || requirements === null) {
			throw new SpecRepositoryError('not_found', 'requirements not found for this spec');
		}
		const stories = await this.listUserStories(requirements.id);
		const nonGoals = await this.listNonGoals(requirements.id);
		const assumptions = await this.listAssumptionsOpenQuestions(requirements.id);
		const glossary = await this.listGlossaryTerms(requirements.id);

		const lines: string[] = [];
		lines.push(`# Requirements: ${requirements.featureName}`, '');
		lines.push('## Overview', '', requirements.overview, '');
		lines.push('## User Stories', '');
		for (const story of stories) {
			lines.push(`### Story ${story.storyNumber}: ${story.title}`, '');
			lines.push(`As a ${story.role}, I want ${story.capability}, so that ${story.benefit}.`, '');
			lines.push(`**Rationale:** ${story.rationale}`, '');
			lines.push('**Acceptance Criteria:**', '');
			const criteria = await this.listAcceptanceCriteria(story.id);
			for (const criterion of criteria) {
				lines.push(`${criterion.criterionNumber}. ${criterion.fullText}`);
			}
			lines.push('');
		}
		lines.push('## Non-Goals', '');
		lines.push(...renderBulletList(nonGoals.map((item) => item.description)), '');
		lines.push('## Assumptions / Open Questions', '');
		lines.push(...renderBulletList(assumptions.map((item) => item.description)), '');
		lines.push('## Glossary', '');
		lines.push(...renderBulletList(glossary.map((term) => `**${term.term}:** ${term.definition ?? term.externalReference ?? ''}`)));
		return lines.join('\n');
	}

	private async renderDesign(specId: string): Promise<string> {
		const design = await this.getDesign(specId);
		if (design === null) {
			throw new SpecRepositoryError('not_found', 'design not found for this spec');
		}
		const components = await this.listDesignComponents(design.id);
		const dataModelEntries = await this.listDesignDataModelEntries(design.id);
		const traceability = await this.listDesignTraceability(design.id);
		const alternatives = await this.listDesignAlternatives(design.id);
		const openRisks = await this.listDesignOpenRisks(design.id);
		const flags = await this.listDesignFlags(design.id);

		const lines: string[] = [];
		lines.push(`# Design: ${design.featureName}`, '');
		lines.push('## Overview', '', design.overview, '');
		lines.push('## Architecture', '', design.architecture, '');
		lines.push('## Components', '');
		lines.push('| Slug | Display name | Responsibility |', '|---|---|---|');
		for (const component of components) {
			lines.push(`| \`${component.slug}\` | ${component.displayName} |  |`);
		}
		lines.push('');
		lines.push('## Data Model / Interfaces', '');
		if (design.dataModelOverview !== null && design.dataModelOverview.length > 0) {
			lines.push(design.dataModelOverview, '');
		}
		for (const entry of dataModelEntries) {
			lines.push(`### ${entry.name} (${entry.kind})`, '', entry.content, '');
		}
		lines.push('## Requirement Traceability', '');
		lines.push('| Requirement | Addressed by |', '|---|---|');
		for (const entry of traceability) {
			lines.push(`| ${entry.requirementLabel} | ${entry.addressedBy} |`);
		}
		lines.push('');
		lines.push('## Alternatives Considered', '');
		lines.push(...renderBulletList(alternatives.map((item) => item.description)), '');
		lines.push('## Open Risks / Tradeoffs', '');
		lines.push(...renderBulletList(openRisks.map((item) => item.description)), '');
		lines.push('## Flags', '');
		lines.push(...renderBulletList(flags.map((item) => item.description)));
		return lines.join('\n');
	}

	private async renderTasksIndex(specId: string): Promise<string> {
		const spec = await this.getSpec(specId);
		if (spec === null) {
			throw new SpecRepositoryError('not_found', `spec not found: ${specId}`);
		}
		const docs = await this.listTasksDocs(specId);
		const edges = await this.listTaskDependencyEdges(specId);
		const dodItems = await this.listDefinitionOfDoneItems(specId);

		// Resolve edge endpoints to their component slug + item label for display.
		const itemLabelById = new Map<string, { componentSlug: string; itemId: string }>();
		for (const doc of docs) {
			const items = await this.listTaskItems(doc.id);
			for (const item of items) {
				itemLabelById.set(item.id, { componentSlug: doc.componentSlug, itemId: item.itemId });
			}
		}

		const lines: string[] = [];
		lines.push(`# Tasks: ${spec.featureName} (Index)`, '');
		lines.push('## Components', '');
		lines.push('| Slug | Display name | Status | Component tasks document |', '|---|---|---|---|');
		for (const doc of docs) {
			lines.push(
				`| \`${doc.componentSlug}\` | ${doc.componentName} | ${doc.status} | \`render_document(stage: "tasks", component: "${doc.componentSlug}")\` |`,
			);
		}
		lines.push('');
		lines.push('## Cross-Component Dependencies', '');
		if (edges.length === 0) {
			lines.push('None.');
		} else {
			for (const edge of edges) {
				const from = itemLabelById.get(edge.fromTaskItemId);
				const to = itemLabelById.get(edge.toTaskItemId);
				const fromLabel = from !== undefined ? `${from.componentSlug} ${from.itemId}` : edge.fromTaskItemId;
				const toLabel = to !== undefined ? `${to.componentSlug} ${to.itemId}` : edge.toTaskItemId;
				lines.push(`- ${fromLabel} -> ${toLabel}`);
			}
		}
		lines.push('');
		lines.push('## Definition of Done', '');
		for (const item of dodItems) {
			lines.push(`- [${item.isChecked ? 'x' : ' '}] ${item.description}`);
		}
		return lines.join('\n');
	}

	private async renderComponentTasks(specId: string, componentSlug: string): Promise<string> {
		const spec = await this.getSpec(specId);
		const doc = await this.getTasksDocByComponent(specId, componentSlug);
		if (spec === null || doc === null) {
			throw new SpecRepositoryError('unknown_component', `component not found for this spec: ${componentSlug}`);
		}
		const items = await this.listTaskItems(doc.id);
		const batches = await this.listParallelBatches(doc.id);
		const flags = await this.listTasksFlags(doc.id);

		const topLevel = items.filter((item) => item.parentItemId === null);
		const childrenByParent = new Map<string, TaskItemRecord[]>();
		for (const item of items) {
			if (item.parentItemId !== null) {
				const siblings = childrenByParent.get(item.parentItemId) ?? [];
				siblings.push(item);
				childrenByParent.set(item.parentItemId, siblings);
			}
		}

		const lines: string[] = [];
		lines.push(`# Tasks: ${spec.featureName} — Component: ${doc.componentSlug} (${doc.componentName})`, '');
		lines.push('## Order', '');
		for (const item of topLevel) {
			lines.push(`- [${item.isChecked ? 'x' : ' '}] ${item.itemId}. T${item.itemId}: ${item.title}`);
			for (const child of childrenByParent.get(item.id) ?? []) {
				lines.push(`- [${child.isChecked ? 'x' : ' '}] ${child.itemId} T${child.itemId}: ${child.title}`);
			}
		}
		lines.push('');
		lines.push('## Parallel Execution Schema', '');
		for (const batch of batches) {
			const members = await this.listParallelBatchMembers(batch.id);
			const memberLabels = members
				.map((member) => items.find((item) => item.id === member.taskItemId)?.itemId)
				.filter((label): label is string => label !== undefined);
			lines.push(`- **${batch.batchLabel} (parallel):** ${memberLabels.join(', ')}`);
		}
		lines.push('');
		lines.push('## Task List', '');
		for (const item of topLevel) {
			lines.push(`### [${item.isChecked ? 'x' : ' '}] ${item.itemId}. T${item.itemId}: ${item.title}`, '');
			lines.push(`- **Description:** ${item.description}`);
			lines.push(`- **Traceability:** ${item.traceability}`);
			const files = await this.listTaskFilesTouched(item.id);
			lines.push(`- **Files/areas touched:** ${files.map((file) => file.filePath).join(', ')}`);
			lines.push(`- **Suggested agent:** \`${item.suggestedAgent}\``);
			lines.push(`- **Acceptance check:** ${item.acceptanceCheck}`);
			const children = childrenByParent.get(item.id) ?? [];
			if (children.length > 0) {
				lines.push('- **Subtasks (run in listed order):**');
				for (const child of children) {
					lines.push(`  - [${child.isChecked ? 'x' : ' '}] ${child.itemId} T${child.itemId}: ${child.title}`);
					lines.push(`    - **Description:** ${child.description}`);
					lines.push(`    - **Suggested agent:** \`${child.suggestedAgent}\``);
					lines.push(`    - **Acceptance check:** ${child.acceptanceCheck}`);
				}
			}
			lines.push('');
		}
		lines.push('## Flags', '');
		lines.push(...renderBulletList(flags.map((flag) => flag.description)));
		return lines.join('\n');
	}
}

function renderBulletList(items: string[]): string[] {
	if (items.length === 0) {
		return ['-'];
	}
	return items.map((item) => `- ${item}`);
}
