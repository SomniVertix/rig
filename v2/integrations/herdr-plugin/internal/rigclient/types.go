// Package rigclient is a typed client for rig's REST surface
// (openapi/graph.yaml plus the binding service's /resolve and /workspaces).
// Field names/shapes mirror internal/graph/api/dto.go and
// web/src/api/types.ts exactly — re-diff against those as rig's backend
// evolves.
package rigclient

type ExpeditionStatus string

const (
	ExpeditionActive    ExpeditionStatus = "active"
	ExpeditionComplete  ExpeditionStatus = "complete"
	ExpeditionAbandoned ExpeditionStatus = "abandoned"
)

type Expedition struct {
	ID             string  `json:"id"`
	WorkspaceID    string  `json:"workspaceId"`
	Slug           string  `json:"slug"`
	Title          string  `json:"title"`
	BriefingPrompt string  `json:"briefingPrompt"`
	Destination    *string `json:"destination,omitempty"`
	Notes          *string `json:"notes,omitempty"`
	Status         string  `json:"status"`
	OutcomeKind    *string `json:"outcomeKind,omitempty"`
	OutcomeSpecID  *string `json:"outcomeSpecId,omitempty"`
	OutcomeSummary *string `json:"outcomeSummary,omitempty"`
	SessionID      *string `json:"sessionId,omitempty"`
	ReopenReason   *string `json:"reopenReason,omitempty"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
}

type Waypoint struct {
	ID                    string  `json:"id"`
	ExpeditionID          string  `json:"expeditionId"`
	WaypointNumber        int     `json:"waypointNumber"`
	Title                 string  `json:"title"`
	Question              string  `json:"question"`
	Approach              *string `json:"approach,omitempty"`
	Status                string  `json:"status"`
	ClaimedBy             *string `json:"claimedBy,omitempty"`
	ClaimedAt             *string `json:"claimedAt,omitempty"`
	Resolution            *string `json:"resolution,omitempty"`
	ResolutionGist        *string `json:"resolutionGist,omitempty"`
	Rationale             *string `json:"rationale,omitempty"`
	BypassReason          *string `json:"bypassReason,omitempty"`
	UnbypassReason        *string `json:"unbypassReason,omitempty"`
	UnspurReason          *string `json:"unspurReason,omitempty"`
	PreviousStatus        *string `json:"previousStatus,omitempty"`
	ReachedIn             *string `json:"reachedIn,omitempty"`
	ReachedAt             *string `json:"reachedAt,omitempty"`
	SpurredToExpeditionID *string `json:"spurredToExpeditionId,omitempty"`
	CreatedAt             string  `json:"createdAt"`
	UpdatedAt             string  `json:"updatedAt"`
}

type WaypointDependencyEdge struct {
	FromWaypointID string `json:"fromWaypointId"`
	ToWaypointID   string `json:"toWaypointId"`
	CreatedAt      string `json:"createdAt"`
}

type ReachWaypointRequest struct {
	Resolution     string `json:"resolution"`
	ResolutionGist string `json:"resolutionGist"`
	Rationale      string `json:"rationale,omitempty"`
	ReachedIn      string `json:"reachedIn,omitempty"`
}

type SpecStageName string

const (
	StageRequirements SpecStageName = "requirements"
	StageDesign       SpecStageName = "design"
	StageTasks        SpecStageName = "tasks"
	// StageImplementation isn't in web/src/api/types.ts's SpecStageName yet,
	// but internal/graph/api/handlers.go accepts it on the wire for
	// approve/deny/finalize — see the "implementation" case there.
	StageImplementation SpecStageName = "implementation"
)

type Spec struct {
	ID                             string  `json:"id"`
	WorkspaceID                    string  `json:"workspaceId"`
	Slug                           string  `json:"slug"`
	FeatureName                    string  `json:"featureName"`
	RequirementsOverview           string  `json:"requirementsOverview"`
	RequirementsStageStatus        string  `json:"requirementsStageStatus"`
	RequirementsDeniedAt           *string `json:"requirementsDeniedAt,omitempty"`
	RequirementsLastDenialReason   *string `json:"requirementsLastDenialReason,omitempty"`
	DesignOverview                 string  `json:"designOverview"`
	DesignArchitecture             string  `json:"designArchitecture"`
	DesignDataModelOverview        *string `json:"designDataModelOverview,omitempty"`
	DesignStageStatus              string  `json:"designStageStatus"`
	DesignDeniedAt                 *string `json:"designDeniedAt,omitempty"`
	DesignLastDenialReason         *string `json:"designLastDenialReason,omitempty"`
	TasksStageStatus               string  `json:"tasksStageStatus"`
	ImplementationStageStatus      string  `json:"implementationStageStatus"`
	ImplementationDeniedAt         *string `json:"implementationDeniedAt,omitempty"`
	ImplementationLastDenialReason *string `json:"implementationLastDenialReason,omitempty"`
	CreatedAt                      string  `json:"createdAt"`
	UpdatedAt                      string  `json:"updatedAt"`
}

type TasksDoc struct {
	ID                string  `json:"id"`
	SpecID            string  `json:"specId"`
	DesignComponentID string  `json:"designComponentId"`
	ComponentSlug     string  `json:"componentSlug"`
	ComponentName     string  `json:"componentName"`
	Status            string  `json:"status"`
	DeniedAt          *string `json:"deniedAt,omitempty"`
	LastDenialReason  *string `json:"lastDenialReason,omitempty"`
}

type NextStageInfo struct {
	NextStage         string   `json:"nextStage"`
	LaggingComponents []string `json:"laggingComponents,omitempty"`
}

type StageActionRequest struct {
	Stage     SpecStageName `json:"stage"`
	Component string        `json:"component,omitempty"`
	Reason    string        `json:"reason,omitempty"`
}

type StageActionResponse struct {
	Spec     *Spec     `json:"spec,omitempty"`
	TasksDoc *TasksDoc `json:"tasksDoc,omitempty"`
}

type RenderDocumentResponse struct {
	Markdown string `json:"markdown"`
}

type Workspace struct {
	WorkspaceID string `json:"workspaceId"`
	Label       string `json:"label"`
}

type HandoffDirection string

const (
	HandoffInbound  HandoffDirection = "inbound"
	HandoffOutbound HandoffDirection = "outbound"
	HandoffBoth     HandoffDirection = "both"
)

type HandoffAttachment struct {
	ID        string `json:"id"`
	Ordinal   int    `json:"ordinal"`
	RepoPath  string `json:"repoPath"`
	CommitSha string `json:"commitSha"`
	Note      string `json:"note"`
}

type Handoff struct {
	ID                 string              `json:"id"`
	SourceWorkspaceID  string              `json:"sourceWorkspaceId"`
	TargetWorkspaceID  string              `json:"targetWorkspaceId"`
	Title              string              `json:"title"`
	Body               *string             `json:"body,omitempty"`
	Type               string              `json:"type"`
	Status             string              `json:"status"`
	OriginExpeditionID *string             `json:"originExpeditionId,omitempty"`
	OriginWaypointID   *string             `json:"originWaypointId,omitempty"`
	OriginCommitSha    *string             `json:"originCommitSha,omitempty"`
	OriginSessionID    *string             `json:"originSessionId,omitempty"`
	HasConversation    bool                `json:"hasConversation"`
	SentBy             string              `json:"sentBy"`
	SentAt             string              `json:"sentAt"`
	ReadAt             *string             `json:"readAt,omitempty"`
	ResolutionNote     *string             `json:"resolutionNote,omitempty"`
	ResolvedAt         *string             `json:"resolvedAt,omitempty"`
	ResolvedBy         *string             `json:"resolvedBy,omitempty"`
	CreatedAt          string              `json:"createdAt"`
	UpdatedAt          string              `json:"updatedAt"`
	Attachments        []HandoffAttachment `json:"attachments,omitempty"`
}

type HandoffTurn struct {
	ID             string `json:"id"`
	ConversationID string `json:"conversationId"`
	TurnNumber     int    `json:"turnNumber"`
	Speaker        string `json:"speaker"`
	Content        string `json:"content"`
	Verdict        string `json:"verdict"`
	CreatedAt      string `json:"createdAt"`
}

type HandoffConversation struct {
	ID                    string  `json:"id"`
	HandoffID             string  `json:"handoffId"`
	Status                string  `json:"status"`
	TurnCap               *string `json:"turnCap,omitempty"`
	EscalationReason      *string `json:"escalationReason,omitempty"`
	EscalatedAt           *string `json:"escalatedAt,omitempty"`
	DraftedAction         *string `json:"draftedAction,omitempty"`
	DraftedResolutionNote *string `json:"draftedResolutionNote,omitempty"`
	DraftedAt             *string `json:"draftedAt,omitempty"`
	ArbiterSessionID      string  `json:"arbiterSessionId"`
	ClosedAt              *string `json:"closedAt,omitempty"`
	CreatedAt             string  `json:"createdAt"`
	UpdatedAt             string  `json:"updatedAt"`
}
