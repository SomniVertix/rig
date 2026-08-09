// Package store defines the graph service's storage port: the contract the
// service layer programs against, independent of which graph database backs
// it. The neo4jstore subpackage is the only implementation today.
package store

import (
	"context"
	"errors"

	"github.com/somnivertix/rig/internal/graph/domain"
)

// ErrNotFound is returned when a lookup by id finds no matching node.
var ErrNotFound = errors.New("store: not found")

// ErrConflict is returned for state-transition violations the store enforces
// itself (e.g. claiming a waypoint that is not marked, or claimed and still
// live), mirroring v1's "already_claimed"-style no-ops surfaced as errors
// here instead of a zero-row UPDATE.
var ErrConflict = errors.New("store: conflict")

// ErrNotImplemented marks store methods not yet ported from the v1 Postgres
// schema. These are secondary, non-graph-shaped data (assets, terms, session
// bookkeeping) deliberately deferred out of this scaffold's first pass.
var ErrNotImplemented = errors.New("store: not implemented")

type CreateExpeditionParams struct {
	WorkspaceID      string
	Slug           string
	Title          string
	BriefingPrompt string
	Destination    *string
	Notes          *string
	SessionID      *string // set when chartered by a session (lineage kind "session")
}

// SpurWaypointParams creates the child expedition and, in the same call,
// reaches the origin waypoint that spurred it (see neo4jstore.SpurWaypoint).
type SpurWaypointParams struct {
	CreateExpeditionParams
	Rationale *string
	ReachedIn *string
}

type ListExpeditionsParams struct {
	WorkspaceID string
	Status    *domain.ExpeditionStatus
}

type UpdateExpeditionParams struct {
	Title       *string
	Destination *string
	Notes       *string
}

type CompleteExpeditionParams struct {
	OutcomeKind    domain.ExpeditionOutcomeKind
	OutcomeSpecID  *string // required when OutcomeKind == ExpeditionOutcomeSpec
	OutcomeSummary *string
}

type AddWaypointParams struct {
	Title    string
	Question string
	Approach *domain.WaypointApproach
	// Sighted creates the waypoint as fog (domain.WaypointSighted) instead
	// of marked — mutually exclusive with an inline resolution (a fog patch
	// isn't sharp enough to resolve in the same breath it's sensed).
	Sighted bool
	// Inline resolution: a grilling conversation may reach a waypoint in the
	// same breath it's added, skipping sighted/marked entirely.
	Resolution     *string
	ResolutionGist *string
	ReachedIn      *string
}

type UpdateWaypointParams struct {
	Title    *string
	Question *string
	Approach *domain.WaypointApproach
	// Mark graduates a sighted waypoint to marked in the same call as
	// sharpening Title/Question. Guarded: the waypoint must currently be
	// sighted, or the store returns ErrConflict.
	Mark bool
}

type ReachWaypointParams struct {
	Resolution     string
	ResolutionGist string
	Rationale      *string
	ReachedIn      *string
}

type AddWaypointAssetParams struct {
	Kind            string
	Title           string
	ContentMarkdown *string
	RepoPath        *string
	CommitSHA       *string
}

type StartSessionParams struct {
	Actor      string
	Label      *string
	Kind       domain.SessionKind
	WorkspaceID  *string
	SeedPrompt *string
}

// FlagWaypointParams raises a non-mutating marker on a target waypoint.
// SourceWaypointID is optional — a flag can be raised narratively, not just
// by another waypoint's decision.
type FlagWaypointParams struct {
	Note             string
	SourceWaypointID *string
}

// --- Spec pipeline params ---------------------------------------------------
//
// Mirrors the mcp__rig__* spec-pipeline tool catalog documented in
// .meta/spec/README.md. Ordinal/StoryNumber/CriterionNumber/ItemId/
// ExecutionOrder fields are never caller-supplied — like WaypointNumber,
// they're derived from call order (max+1), matching v1's "the sequence you
// call this in is the Order section" rule.

type CreateSpecParams struct {
	WorkspaceID   string
	Slug        string
	FeatureName string
}

type UpdateSpecStageTextParams struct {
	RequirementsOverview    *string
	DesignOverview          *string
	DesignArchitecture      *string
	DesignDataModelOverview *string
}

type AddUserStoryParams struct {
	SpecID     string
	Title      string
	Role       string
	Capability string
	Benefit    string
	Rationale  string
}

type UpdateUserStoryParams struct {
	Title      *string
	Role       *string
	Capability *string
	Benefit    *string
	Rationale  *string
}

type AddAcceptanceCriterionParams struct {
	UserStoryID     string
	EarsPattern     domain.EarsPattern
	TriggerClause   *string
	ConditionClause *string
	StateClause     *string
	ResponseClause  string
	FullText        string
}

type UpdateAcceptanceCriterionParams struct {
	EarsPattern     *domain.EarsPattern
	TriggerClause   *string
	ConditionClause *string
	StateClause     *string
	ResponseClause  *string
	FullText        *string
}

// AddOpenQuestionParams raises a question against a spec, optionally scoped
// to a specific node (a DesignComponent or TaskItem id) narrower than the
// whole stage. Unifies v1's assumptions_open_questions/design_flags/
// tasks_flags into one artifact — spec-pipeline-graph.md decision 5.
type AddOpenQuestionParams struct {
	SpecID      string
	Stage       domain.SpecStage
	TargetID    *string
	Description string
}

type ResolveOpenQuestionParams struct {
	ResolvedBy     string
	ResolvedReason string
}

type AddGlossaryTermParams struct {
	SpecID            string
	Term              string
	Definition        *string
	ExternalReference *string
}

type UpdateGlossaryTermParams struct {
	Definition        *string
	ExternalReference *string
}

type AddDesignComponentParams struct {
	SpecID      string
	Slug        string
	DisplayName string
}

type UpdateDesignComponentParams struct {
	DisplayName *string
}

type AddDataModelEntryParams struct {
	SpecID  string
	Name    string
	Kind    string
	Content string
}

type UpdateDataModelEntryParams struct {
	Name    *string
	Kind    *string
	Content *string
}

type AddTraceabilityEntryParams struct {
	SpecID           string
	UserStoryID      *string
	RequirementLabel string
	AddressedBy      string
}

type UpdateTraceabilityEntryParams struct {
	UserStoryID      *string
	RequirementLabel *string
	AddressedBy      *string
}

type AddAlternativeParams struct {
	SpecID      string
	Description string
}

type AddOpenRiskParams struct {
	SpecID      string
	Description string
}

// AddTaskItemParams creates a task item. SatisfiesCriterionIDs is required
// and non-empty for a top-level item (ParentItemID nil) — decision 13: at
// least one SATISFIES edge to an AcceptanceCriterion is mandatory, replacing
// v1's free-text traceability field. ParentItemID, if set, must itself be a
// top-level item — decision 12's 2-level cap; the store rejects a deeper
// nesting attempt with ErrConflict.
type AddTaskItemParams struct {
	TasksDocID            string
	ParentItemID          *string
	Title                 string
	Description           string
	SuggestedAgent        string // defaults to "none" if empty
	AcceptanceCheck       string
	SatisfiesCriterionIDs []string
}

type UpdateTaskItemParams struct {
	Title           *string
	Description     *string
	SuggestedAgent  *string
	AcceptanceCheck *string
	IsChecked       *bool
}

// AddFileTouchedParams records one file/area touched by a task item. The
// store rejects a 6th entry for the same task item — decision 14's hard
// cap of 5, a structural signal the task should be split.
type AddFileTouchedParams struct {
	TaskItemID string
	FilePath   string
}

type AddParallelBatchParams struct {
	TasksDocID string
	BatchLabel string
}

type AddDefinitionOfDoneItemParams struct {
	SpecID      string
	Description string
}

type UpdateDefinitionOfDoneItemParams struct {
	Description *string
	IsChecked   *bool
}

// --- Handoffs ----------------------------------------------------------
//
// Cross-workspace messages, optionally anchored to the origin
// expedition/waypoint/commit/session they arose from. Handoffs are
// append-only after send: there is deliberately no UpdateHandoff or
// DeleteHandoff method anywhere in this interface — immutability is a
// structural absence, not a runtime check. The only permitted mutations
// post-send are read tracking (MarkHandoffRead) and terminal resolution
// (CloseHandoff), plus appending attachments.

// HandoffDirection selects which side of a Handoff's SourceWorkspaceID/
// TargetWorkspaceID edge ListHandoffs filters on, relative to
// ListHandoffsParams.WorkspaceID.
type HandoffDirection string

const (
	HandoffDirectionInbound  HandoffDirection = "inbound"
	HandoffDirectionOutbound HandoffDirection = "outbound"
	HandoffDirectionBoth     HandoffDirection = "both"
)

// HandoffAttachmentInput describes one attachment supplied inline at send
// time, before a HandoffID exists to hang it off of.
type HandoffAttachmentInput struct {
	RepoPath  string
	CommitSHA string
	Note      string
}

// SendHandoffParams creates a Handoff from SourceWorkspaceID to
// TargetWorkspaceID, optionally back-linking to the origin
// expedition/waypoint/commit/session it arose from and carrying any number
// of attachments created in the same call.
type SendHandoffParams struct {
	SourceWorkspaceID string
	TargetWorkspaceID string
	Title             string
	BodyMarkdown      string
	Type              string
	Attachments       []HandoffAttachmentInput

	// Optional origin back-link fields.
	OriginExpeditionID *string
	OriginWaypointID   *string
	OriginCommitSHA    *string
	OriginSessionID    *string

	SentBy string
}

// AddHandoffAttachmentParams appends one piece of supporting evidence to an
// existing Handoff.
type AddHandoffAttachmentParams struct {
	HandoffID string
	RepoPath  string
	CommitSHA string
	Note      string
}

// ListHandoffsParams scopes ListHandoffs to one workspace, optionally
// filtered by direction (inbound/outbound/both, relative to WorkspaceID)
// and by Status.
type ListHandoffsParams struct {
	WorkspaceID string
	Direction   string
	Status      *string
}

// CloseHandoff moves a Handoff into a terminal state ("actioned" or
// "dismissed"), recording who resolved it and why.
type CloseHandoffParams struct {
	ID             string
	Terminal       string // one of "actioned" or "dismissed"
	ResolutionNote string
	ResolvedBy     string
}

// --- Handoff conversations ----------------------------------------------
//
// The multi-turn negotiation a Handoff's source and target workspaces carry
// out when they can't resolve it unilaterally, arbitrated by a session when
// the two sides stall or disagree. See domain.HandoffConversation.

// StartHandoffConversationParams opens a HandoffConversation for an existing
// Handoff, anchoring it to the source/target workspace root paths and the
// arbiter session that will mediate turns.
type StartHandoffConversationParams struct {
	HandoffID        string
	SourceRootPath   string
	TargetRootPath   string
	ArbiterSessionID string
}

// RecordHandoffTurnParams appends one message to a HandoffConversation.
// TurnNumber is never caller-supplied — it's derived server-side from turn
// order, mirroring AddTaskItemParams's Ordinal-style fields.
type RecordHandoffTurnParams struct {
	ConversationID string
	Speaker        string // one of "source", "target", "arbiter"
	Content        string
	Verdict        string // one of "action", "dismiss", "more_info", "blocked"
}

// EscalateHandoffConversationParams moves a HandoffConversation into the
// escalated state ahead of arbitration.
type EscalateHandoffConversationParams struct {
	ConversationID string
	Reason         string // one of "turn_cap", "tie_break", "stalled_subagent", "workspace_unreachable"
}

// ResumeHandoffConversationParams reactivates an escalated
// HandoffConversation, optionally raising its turn cap so it doesn't
// immediately re-escalate.
type ResumeHandoffConversationParams struct {
	ConversationID string
	RaiseTurnCapBy *int
}

// DraftHandoffResolutionParams records the arbiter's proposed resolution on
// an escalated HandoffConversation, pending a human's final close.
type DraftHandoffResolutionParams struct {
	ConversationID string
	Action         *string
	ResolutionNote string
}

// Store is the graph service's storage port. Method names mirror the v1
// mcp__rig__* trail/waypoint tool catalog one-for-one (renamed
// trail->expedition) so porting callers is mechanical.
type Store interface {
	// Expeditions
	CreateExpedition(ctx context.Context, params CreateExpeditionParams) (*domain.Expedition, error)
	CreateExpeditionFromHandoff(ctx context.Context, handoffID string, params CreateExpeditionParams) (*domain.Expedition, error)
	GetExpedition(ctx context.Context, id string) (*domain.Expedition, error)
	GetExpeditionBySpec(ctx context.Context, specID string) (*domain.Expedition, error)
	ListExpeditions(ctx context.Context, params ListExpeditionsParams) ([]*domain.Expedition, error)
	UpdateExpedition(ctx context.Context, id string, params UpdateExpeditionParams) (*domain.Expedition, error)
	CompleteExpedition(ctx context.Context, id string, params CompleteExpeditionParams) (*domain.Expedition, error)
	AbandonExpedition(ctx context.Context, id string) (*domain.Expedition, error)
	ReopenExpedition(ctx context.Context, id, reason string) (*domain.Expedition, error)

	// Waypoints
	AddWaypoint(ctx context.Context, expeditionID string, params AddWaypointParams) (*domain.Waypoint, error)
	GetWaypoint(ctx context.Context, id string) (*domain.Waypoint, error)
	ListWaypoints(ctx context.Context, expeditionID string) ([]*domain.Waypoint, error)
	UpdateWaypoint(ctx context.Context, id string, params UpdateWaypointParams) (*domain.Waypoint, error)
	ClaimWaypoint(ctx context.Context, id, claimedBy string) (*domain.Waypoint, error)
	ReleaseWaypoint(ctx context.Context, id string) (*domain.Waypoint, error)
	ReachWaypoint(ctx context.Context, id string, params ReachWaypointParams) (*domain.Waypoint, error)
	BypassWaypoint(ctx context.Context, id, reason string) (*domain.Waypoint, error)
	UnbypassWaypoint(ctx context.Context, id, reason string) (*domain.Waypoint, error)
	GetFrontier(ctx context.Context, expeditionID string) ([]*domain.Waypoint, error)

	// Dependency edges ("from" blocks "to")
	AddWaypointDependency(ctx context.Context, fromWaypointID, toWaypointID string) error
	RemoveWaypointDependency(ctx context.Context, fromWaypointID, toWaypointID string) error
	ListWaypointDependencies(ctx context.Context, expeditionID string) ([]domain.WaypointDependencyEdge, error)

	// Lineage / spurs
	SpurWaypoint(ctx context.Context, waypointID string, params SpurWaypointParams) (*domain.Expedition, error)
	UnspurWaypoint(ctx context.Context, waypointID, reason string) error
	GetExpeditionLineage(ctx context.Context, expeditionID string) (*domain.ExpeditionLineage, error)

	// Rehydrate / flags — redoing a reached or bypassed waypoint's decision
	// without ever deleting the prior one, and a non-mutating, cross-
	// expedition marker for "this may need reconsidering" that doesn't
	// require the target to be in an active expedition.
	RehydrateWaypoint(ctx context.Context, id, reason string) (*domain.Waypoint, error)
	ListWaypointHistory(ctx context.Context, waypointID string) ([]*domain.WaypointHistoryEntry, error)
	FlagWaypoint(ctx context.Context, targetWaypointID string, params FlagWaypointParams) (*domain.WaypointFlag, error)
	ResolveWaypointFlag(ctx context.Context, flagID, reason string) (*domain.WaypointFlag, error)
	ListWaypointFlags(ctx context.Context, waypointID string) ([]*domain.WaypointFlag, error)
	ListUnresolvedFlagsForExpedition(ctx context.Context, expeditionID string) ([]*domain.WaypointFlag, error)

	// Assets — what resolving a waypoint produced (a document or a reference
	// to code committed on main). Unguarded: attachable regardless of the
	// waypoint's status.
	AddWaypointAsset(ctx context.Context, waypointID string, params AddWaypointAssetParams) (*domain.WaypointAsset, error)
	ListWaypointAssets(ctx context.Context, waypointID string) ([]*domain.WaypointAsset, error)

	// Expedition terms — a per-expedition glossary. AddExpeditionTerm
	// rejects a case-insensitive duplicate on the same expedition.
	AddExpeditionTerm(ctx context.Context, expeditionID, term, definition string) (*domain.ExpeditionTerm, error)
	UpdateExpeditionTerm(ctx context.Context, id, definition string) (*domain.ExpeditionTerm, error)
	ListExpeditionTerms(ctx context.Context, expeditionID string) ([]*domain.ExpeditionTerm, error)

	// Sessions — deferred (ErrNotImplemented) in this scaffold's first pass.
	StartSession(ctx context.Context, params StartSessionParams) (*domain.Session, error)

	// --- Spec pipeline ---

	CreateSpec(ctx context.Context, params CreateSpecParams) (*domain.Spec, error)
	GetSpec(ctx context.Context, id string) (*domain.Spec, error)
	GetSpecBySlug(ctx context.Context, workspaceID, slug string) (*domain.Spec, error)
	ListSpecs(ctx context.Context, workspaceID string) ([]*domain.Spec, error)
	UpdateSpecStageText(ctx context.Context, specID string, params UpdateSpecStageTextParams) (*domain.Spec, error)

	// Stage transitions. Tasks has no stored aggregate status of its own —
	// FinalizeTasksStage/ApproveTasksStage/DenyTasksStage operate per
	// TasksDoc (per design component); DeriveTasksStageStatus computes the
	// spec-wide aggregate live, mirroring v1's deriveTasksAggregateStatus.
	FinalizeRequirementsStage(ctx context.Context, specID string) (*domain.Spec, error)
	ApproveRequirementsStage(ctx context.Context, specID string) (*domain.Spec, error)
	DenyRequirementsStage(ctx context.Context, specID, reason string) (*domain.Spec, error)
	FinalizeDesignStage(ctx context.Context, specID string) (*domain.Spec, error)
	ApproveDesignStage(ctx context.Context, specID string) (*domain.Spec, error)
	DenyDesignStage(ctx context.Context, specID, reason string) (*domain.Spec, error)
	FinalizeImplementationStage(ctx context.Context, specID string) (*domain.Spec, error)
	ApproveImplementationStage(ctx context.Context, specID string) (*domain.Spec, error)
	DenyImplementationStage(ctx context.Context, specID, reason string) (*domain.Spec, error)
	FinalizeTasksStage(ctx context.Context, tasksDocID string) (*domain.TasksDoc, error)
	ApproveTasksStage(ctx context.Context, tasksDocID string) (*domain.TasksDoc, error)
	DenyTasksStage(ctx context.Context, tasksDocID, reason string) (*domain.TasksDoc, error)
	DeriveTasksStageStatus(ctx context.Context, specID string) (domain.SpecStageStatus, error)

	// Requirements artifacts
	AddUserStory(ctx context.Context, params AddUserStoryParams) (*domain.UserStory, error)
	GetUserStory(ctx context.Context, id string) (*domain.UserStory, error)
	ListUserStories(ctx context.Context, specID string) ([]*domain.UserStory, error)
	UpdateUserStory(ctx context.Context, id string, params UpdateUserStoryParams) (*domain.UserStory, error)
	DeleteUserStory(ctx context.Context, id string) error

	AddAcceptanceCriterion(ctx context.Context, params AddAcceptanceCriterionParams) (*domain.AcceptanceCriterion, error)
	GetAcceptanceCriterion(ctx context.Context, id string) (*domain.AcceptanceCriterion, error)
	ListAcceptanceCriteria(ctx context.Context, userStoryID string) ([]*domain.AcceptanceCriterion, error)
	UpdateAcceptanceCriterion(ctx context.Context, id string, params UpdateAcceptanceCriterionParams) (*domain.AcceptanceCriterion, error)
	DeleteAcceptanceCriterion(ctx context.Context, id string) error

	AddNonGoal(ctx context.Context, specID, description string) (*domain.NonGoal, error)
	UpdateNonGoal(ctx context.Context, id, description string) (*domain.NonGoal, error)
	DeleteNonGoal(ctx context.Context, id string) error
	ListNonGoals(ctx context.Context, specID string) ([]*domain.NonGoal, error)

	AddGlossaryTerm(ctx context.Context, params AddGlossaryTermParams) (*domain.GlossaryTerm, error)
	UpdateGlossaryTerm(ctx context.Context, id string, params UpdateGlossaryTermParams) (*domain.GlossaryTerm, error)
	DeleteGlossaryTerm(ctx context.Context, id string) error
	ListGlossaryTerms(ctx context.Context, specID string) ([]*domain.GlossaryTerm, error)

	// Open questions — unified across all three stages (decision 5).
	AddOpenQuestion(ctx context.Context, params AddOpenQuestionParams) (*domain.OpenQuestion, error)
	UpdateOpenQuestion(ctx context.Context, id, description string) (*domain.OpenQuestion, error)
	ResolveOpenQuestion(ctx context.Context, id string, params ResolveOpenQuestionParams) (*domain.OpenQuestion, error)
	DeleteOpenQuestion(ctx context.Context, id string) error
	ListOpenQuestions(ctx context.Context, specID string) ([]*domain.OpenQuestion, error)
	ListUnresolvedOpenQuestions(ctx context.Context, specID string, stage domain.SpecStage) ([]*domain.OpenQuestion, error)

	// Design artifacts
	AddDesignComponent(ctx context.Context, params AddDesignComponentParams) (*domain.DesignComponent, error)
	UpdateDesignComponent(ctx context.Context, id string, params UpdateDesignComponentParams) (*domain.DesignComponent, error)
	DeleteDesignComponent(ctx context.Context, id string) error
	ListDesignComponents(ctx context.Context, specID string) ([]*domain.DesignComponent, error)

	AddDataModelEntry(ctx context.Context, params AddDataModelEntryParams) (*domain.DataModelEntry, error)
	UpdateDataModelEntry(ctx context.Context, id string, params UpdateDataModelEntryParams) (*domain.DataModelEntry, error)
	DeleteDataModelEntry(ctx context.Context, id string) error
	ListDataModelEntries(ctx context.Context, specID string) ([]*domain.DataModelEntry, error)

	AddTraceabilityEntry(ctx context.Context, params AddTraceabilityEntryParams) (*domain.TraceabilityEntry, error)
	UpdateTraceabilityEntry(ctx context.Context, id string, params UpdateTraceabilityEntryParams) (*domain.TraceabilityEntry, error)
	DeleteTraceabilityEntry(ctx context.Context, id string) error
	ListTraceabilityEntries(ctx context.Context, specID string) ([]*domain.TraceabilityEntry, error)

	AddAlternative(ctx context.Context, params AddAlternativeParams) (*domain.Alternative, error)
	UpdateAlternative(ctx context.Context, id, description string) (*domain.Alternative, error)
	DeleteAlternative(ctx context.Context, id string) error
	ListAlternatives(ctx context.Context, specID string) ([]*domain.Alternative, error)

	AddOpenRisk(ctx context.Context, params AddOpenRiskParams) (*domain.OpenRisk, error)
	UpdateOpenRisk(ctx context.Context, id, description string) (*domain.OpenRisk, error)
	DeleteOpenRisk(ctx context.Context, id string) error
	ListOpenRisks(ctx context.Context, specID string) ([]*domain.OpenRisk, error)

	// Tasks artifacts
	ListTasksDocs(ctx context.Context, specID string) ([]*domain.TasksDoc, error)
	GetTasksDoc(ctx context.Context, id string) (*domain.TasksDoc, error)
	GetTasksDocByComponent(ctx context.Context, designComponentID string) (*domain.TasksDoc, error)
	// ListOrphanedTasksDocs returns TasksDoc nodes whose DesignComponent no
	// longer exists — always blocks design's finalize (decision 10), no
	// silent deletion regardless of whether the doc has content.
	ListOrphanedTasksDocs(ctx context.Context, specID string) ([]*domain.TasksDoc, error)

	// AddTaskItem enforces the 2-level hierarchy cap and the SATISFIES
	// requirement at insert time (store.ErrConflict on violation), not
	// deferred to finalize.
	AddTaskItem(ctx context.Context, params AddTaskItemParams) (*domain.TaskItem, error)
	GetTaskItem(ctx context.Context, id string) (*domain.TaskItem, error)
	ListTaskItems(ctx context.Context, tasksDocID string) ([]*domain.TaskItem, error)
	UpdateTaskItem(ctx context.Context, id string, params UpdateTaskItemParams) (*domain.TaskItem, error)
	DeleteTaskItem(ctx context.Context, id string) error
	ListSatisfiedCriteria(ctx context.Context, taskItemID string) ([]*domain.AcceptanceCriterion, error)

	// AddFileTouched enforces the max-5-per-task-item cap at insert time.
	AddFileTouched(ctx context.Context, params AddFileTouchedParams) (*domain.FileTouched, error)
	DeleteFileTouched(ctx context.Context, id string) error
	ListFilesTouched(ctx context.Context, taskItemID string) ([]*domain.FileTouched, error)

	// Task dependency edges ("from" blocks "to"), cross-component only.
	AddTaskDependencyEdge(ctx context.Context, specID, fromTaskItemID, toTaskItemID string) error
	DeleteTaskDependencyEdge(ctx context.Context, fromTaskItemID, toTaskItemID string) error
	ListTaskDependencyEdges(ctx context.Context, specID string) ([]domain.TaskDependencyEdge, error)
	// HasTaskDependencyCycle walks every edge belonging to specID, mirroring
	// v1's WITH RECURSIVE check — run explicitly by finalize_stage("tasks"),
	// not on insert.
	HasTaskDependencyCycle(ctx context.Context, specID string) (bool, error)

	AddParallelBatch(ctx context.Context, params AddParallelBatchParams) (*domain.ParallelBatch, error)
	ListParallelBatches(ctx context.Context, tasksDocID string) ([]*domain.ParallelBatch, error)
	DeleteParallelBatch(ctx context.Context, id string) error
	AddParallelBatchMember(ctx context.Context, batchID, taskItemID string) error
	RemoveParallelBatchMember(ctx context.Context, batchID, taskItemID string) error
	ListParallelBatchMembers(ctx context.Context, batchID string) ([]*domain.TaskItem, error)

	AddDefinitionOfDoneItem(ctx context.Context, params AddDefinitionOfDoneItemParams) (*domain.DefinitionOfDoneItem, error)
	UpdateDefinitionOfDoneItem(ctx context.Context, id string, params UpdateDefinitionOfDoneItemParams) (*domain.DefinitionOfDoneItem, error)
	DeleteDefinitionOfDoneItem(ctx context.Context, id string) error
	ListDefinitionOfDoneItems(ctx context.Context, specID string) ([]*domain.DefinitionOfDoneItem, error)

	// Handoffs — cross-workspace messages. Append-only after send: no
	// UpdateHandoff/DeleteHandoff method exists (see comment above
	// SendHandoffParams).
	SendHandoff(ctx context.Context, params SendHandoffParams) (*domain.Handoff, error)
	GetHandoff(ctx context.Context, id string) (*domain.Handoff, error)
	ListHandoffs(ctx context.Context, params ListHandoffsParams) ([]domain.Handoff, error)
	// MarkHandoffRead transitions a pending Handoff to read, recording
	// ReadAt. A no-op past pending is left to the caller's discretion; it
	// does not error on a Handoff already read or resolved.
	MarkHandoffRead(ctx context.Context, handoffID string) error
	// CloseHandoff moves a Handoff to a terminal status ("actioned" or
	// "dismissed"), recording ResolutionNote/ResolvedBy/ResolvedAt.
	CloseHandoff(ctx context.Context, params CloseHandoffParams) error
	AddHandoffAttachment(ctx context.Context, params AddHandoffAttachmentParams) (*domain.HandoffAttachment, error)
	ListHandoffAttachments(ctx context.Context, handoffID string) ([]domain.HandoffAttachment, error)

	// Handoff conversations — the multi-turn negotiation between a Handoff's
	// source and target workspaces, arbitrated when they can't agree alone.
	//
	// StartHandoffConversation opens a conversation for a Handoff, anchoring
	// it to the source/target workspace root paths the arbiter session will
	// operate against.
	StartHandoffConversation(ctx context.Context, params StartHandoffConversationParams) (*domain.HandoffConversation, error)
	GetHandoffConversation(ctx context.Context, id string) (*domain.HandoffConversation, error)
	// GetHandoffConversationByHandoff looks up the conversation for a given
	// Handoff, if one has been started.
	GetHandoffConversationByHandoff(ctx context.Context, handoffId string) (*domain.HandoffConversation, error)
	ListHandoffTurns(ctx context.Context, conversationId string) ([]domain.HandoffTurn, error)
	// RecordHandoffTurn appends a message to the conversation and returns the
	// server-derived HandoffConversationState — not just the recorded turn —
	// so the caller learns in the same call whether the turn cap was hit,
	// whether the two sides have reached agreement, and who speaks next.
	RecordHandoffTurn(ctx context.Context, params RecordHandoffTurnParams) (*domain.HandoffConversationState, error)
	// EscalateHandoffConversation moves an active conversation into the
	// escalated state ahead of arbitration, recording why.
	EscalateHandoffConversation(ctx context.Context, params EscalateHandoffConversationParams) error
	// ResumeHandoffConversation reactivates an escalated conversation,
	// optionally raising its turn cap so it doesn't immediately re-escalate.
	ResumeHandoffConversation(ctx context.Context, params ResumeHandoffConversationParams) error
	// CloseHandoffConversationByHuman moves a conversation to its
	// closed_by_human terminal state, bypassing arbitration.
	CloseHandoffConversationByHuman(ctx context.Context, id string) error
	// DraftHandoffResolution records the arbiter's proposed resolution on an
	// escalated conversation, pending a human's final close.
	DraftHandoffResolution(ctx context.Context, params DraftHandoffResolutionParams) error

	// Close releases underlying driver resources.
	Close(ctx context.Context) error
}
