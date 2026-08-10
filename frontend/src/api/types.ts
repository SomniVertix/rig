/**
 * Wire types for the real V2 REST surface (`openapi/graph.yaml`,
 * `internal/graph/api/dto.go`). Field names/shapes mirror the Go DTOs
 * exactly — this file is the thing to re-diff against `dto.go` as V2's
 * backend evolves. Nothing here knows about UI vocabulary (e.g. "trail");
 * that translation happens in `src/domain/`.
 */

export type ExpeditionStatus = 'active' | 'complete' | 'abandoned';
export type ExpeditionOutcomeKind = 'spec' | 'decision' | 'change';

export interface ExpeditionDTO {
	id: string;
	workspaceId: string;
	slug: string;
	title: string;
	briefingPrompt: string;
	destination?: string | null;
	notes?: string | null;
	status: ExpeditionStatus;
	outcomeKind?: ExpeditionOutcomeKind | null;
	outcomeSpecId?: string | null;
	outcomeSummary?: string | null;
	sessionId?: string | null;
	createdAt: string;
	updatedAt: string;
}

export type WaypointStatus = 'sighted' | 'marked' | 'claimed' | 'reached' | 'bypassed';
export type WaypointApproach = 'grilling' | 'research' | 'prototype' | 'task';

export interface WaypointDTO {
	id: string;
	expeditionId: string;
	waypointNumber: number;
	title: string;
	question: string;
	approach?: WaypointApproach | null;
	status: WaypointStatus;
	claimedBy?: string | null;
	claimedAt?: string | null;
	resolution?: string | null;
	resolutionGist?: string | null;
	rationale?: string | null;
	bypassReason?: string | null;
	previousStatus?: WaypointStatus | null;
	reachedIn?: string | null;
	reachedAt?: string | null;
	spurredToExpeditionId?: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface WaypointDependencyEdgeDTO {
	fromWaypointId: string;
	toWaypointId: string;
	createdAt: string;
}

export interface ReachWaypointRequest {
	resolution: string;
	resolutionGist: string;
	rationale?: string;
	reachedIn?: string;
}

export type SpecStageName = 'requirements' | 'design' | 'tasks';
export type SpecStageStatus = 'not_started' | 'in_review' | 'approved';

export interface SpecDTO {
	id: string;
	workspaceId: string;
	slug: string;
	featureName: string;
	requirementsOverview: string;
	requirementsStageStatus: SpecStageStatus;
	requirementsDeniedAt?: string | null;
	requirementsLastDenialReason?: string | null;
	designOverview: string;
	designArchitecture: string;
	designDataModelOverview?: string | null;
	designStageStatus: SpecStageStatus;
	designDeniedAt?: string | null;
	designLastDenialReason?: string | null;
	/** Derived live from every component's TasksDoc — never stored. */
	tasksStageStatus: SpecStageStatus;
	implementationStageStatus: SpecStageStatus;
	implementationDeniedAt?: string | null;
	implementationLastDenialReason?: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface TasksDocDTO {
	id: string;
	specId: string;
	designComponentId: string;
	componentSlug: string;
	componentName: string;
	status: SpecStageStatus;
	deniedAt?: string | null;
	lastDenialReason?: string | null;
}
export interface ListTasksDocsResponse {
	tasksDocs: TasksDocDTO[];
}

export interface NextStageInfoDTO {
	nextStage: SpecStageName | 'implementation';
	laggingComponents?: string[];
}

export interface StageActionRequest {
	stage: SpecStageName;
	/** Required when stage is "tasks": the design component's slug. */
	component?: string;
	/** Required for deny; ignored otherwise. */
	reason?: string;
}

export interface StageActionResponse {
	spec?: SpecDTO | null;
	tasksDoc?: TasksDocDTO | null;
}

export interface RenderDocumentResponse {
	markdown: string;
}

// ── Workspaces ───────────────────────────────────────────────────────────

/** One workspaceId discovered from a scanned `.code-workspace` file. Folder
 * paths are intentionally not part of this DTO — the server keeps those. */
export interface WorkspaceDTO {
	workspaceId: string;
	label: string;
}

export type HandoffType = 'bug' | 'question' | 'fyi' | 'dependency-change';
export type HandoffStatus = 'pending' | 'read' | 'actioned' | 'dismissed';

/** Which side of a Handoff's source/target workspace a list request is
 * filtering by, relative to the workspace making the request. */
export type HandoffDirection = 'inbound' | 'outbound' | 'both';

export interface HandoffAttachmentDTO {
	id: string;
	ordinal: number;
	repoPath: string;
	commitSha: string;
	note: string;
}

/** Body and attachments are populated only on the single-get path
 * (GetHandoff + ListHandoffAttachments); list rows leave them unset so list
 * responses stay light. */
export interface HandoffDTO {
	id: string;
	sourceWorkspaceId: string;
	targetWorkspaceId: string;
	title: string;
	body?: string | null;
	type: HandoffType;
	status: HandoffStatus;
	originExpeditionId?: string | null;
	originWaypointId?: string | null;
	originCommitSha?: string | null;
	originSessionId?: string | null;
	hasConversation: boolean;
	sentBy: string;
	sentAt: string;
	readAt?: string | null;
	resolutionNote?: string | null;
	resolvedAt?: string | null;
	resolvedBy?: string | null;
	createdAt: string;
	updatedAt: string;
	attachments?: HandoffAttachmentDTO[];
}

export type HandoffTurnSpeaker = 'source' | 'target' | 'arbiter';
export type HandoffVerdict = 'action' | 'dismiss' | 'more_info' | 'blocked';

export interface HandoffTurnDTO {
	id: string;
	conversationId: string;
	turnNumber: number;
	speaker: HandoffTurnSpeaker;
	content: string;
	verdict: HandoffVerdict;
	createdAt: string;
}

export type HandoffConversationStatus = 'active' | 'escalated' | 'closed_agreed' | 'closed_by_human';

/** Deliberately omits domain.HandoffConversation's SourceRootPath/
 * TargetRootPath: those are subagent-invocation plumbing (where to run the
 * source/target sides' CLI), not something a REST client needs to see. */
export interface HandoffConversationDTO {
	id: string;
	handoffId: string;
	status: HandoffConversationStatus;
	turnCap?: string | null;
	escalationReason?: string | null;
	escalatedAt?: string | null;
	draftedAction?: string | null;
	draftedResolutionNote?: string | null;
	draftedAt?: string | null;
	arbiterSessionId: string;
	closedAt?: string | null;
	createdAt: string;
	updatedAt: string;
}
