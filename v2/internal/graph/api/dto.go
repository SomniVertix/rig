// Package api is the graph service's REST transport: HTTP handlers that
// translate JSON requests into service calls and service results back into
// JSON, matching the contract described in openapi/graph.yaml.
package api

import (
	"time"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

type expeditionDTO struct {
	ID             string    `json:"id"`
	WorkspaceID      string    `json:"workspaceId"`
	Slug           string    `json:"slug"`
	Title          string    `json:"title"`
	BriefingPrompt string    `json:"briefingPrompt"`
	Destination    *string   `json:"destination,omitempty"`
	Notes          *string   `json:"notes,omitempty"`
	Status         string    `json:"status"`
	OutcomeKind    *string   `json:"outcomeKind,omitempty"`
	OutcomeSpecID  *string   `json:"outcomeSpecId,omitempty"`
	OutcomeSummary *string   `json:"outcomeSummary,omitempty"`
	SessionID      *string   `json:"sessionId,omitempty"`
	ReopenReason   *string   `json:"reopenReason,omitempty"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

func newExpeditionDTO(e *domain.Expedition) expeditionDTO {
	dto := expeditionDTO{
		ID:             e.ID,
		WorkspaceID:      e.WorkspaceID,
		Slug:           e.Slug,
		Title:          e.Title,
		BriefingPrompt: e.BriefingPrompt,
		Destination:    e.Destination,
		Notes:          e.Notes,
		Status:         string(e.Status),
		OutcomeSpecID:  e.OutcomeSpecID,
		OutcomeSummary: e.OutcomeSummary,
		SessionID:      e.SessionID,
		ReopenReason:   e.ReopenReason,
		CreatedAt:      e.CreatedAt,
		UpdatedAt:      e.UpdatedAt,
	}
	if e.OutcomeKind != nil {
		k := string(*e.OutcomeKind)
		dto.OutcomeKind = &k
	}
	return dto
}

type waypointDTO struct {
	ID                    string     `json:"id"`
	ExpeditionID          string     `json:"expeditionId"`
	WaypointNumber        int        `json:"waypointNumber"`
	Title                 string     `json:"title"`
	Question              string     `json:"question"`
	Approach              *string    `json:"approach,omitempty"`
	Status                string     `json:"status"`
	ClaimedBy             *string    `json:"claimedBy,omitempty"`
	ClaimedAt             *time.Time `json:"claimedAt,omitempty"`
	Resolution            *string    `json:"resolution,omitempty"`
	ResolutionGist        *string    `json:"resolutionGist,omitempty"`
	Rationale             *string    `json:"rationale,omitempty"`
	BypassReason          *string    `json:"bypassReason,omitempty"`
	UnbypassReason        *string    `json:"unbypassReason,omitempty"`
	UnspurReason          *string    `json:"unspurReason,omitempty"`
	PreviousStatus        *string    `json:"previousStatus,omitempty"`
	ReachedIn             *string    `json:"reachedIn,omitempty"`
	ReachedAt             *time.Time `json:"reachedAt,omitempty"`
	SpurredToExpeditionID *string    `json:"spurredToExpeditionId,omitempty"`
	CreatedAt             time.Time  `json:"createdAt"`
	UpdatedAt             time.Time  `json:"updatedAt"`
}

func newWaypointDTO(w *domain.Waypoint) waypointDTO {
	dto := waypointDTO{
		ID:                    w.ID,
		ExpeditionID:          w.ExpeditionID,
		WaypointNumber:        w.WaypointNumber,
		Title:                 w.Title,
		Question:              w.Question,
		Status:                string(w.Status),
		ClaimedBy:             w.ClaimedBy,
		ClaimedAt:             w.ClaimedAt,
		Resolution:            w.Resolution,
		ResolutionGist:        w.ResolutionGist,
		Rationale:             w.Rationale,
		BypassReason:          w.BypassReason,
		UnbypassReason:        w.UnbypassReason,
		UnspurReason:          w.UnspurReason,
		ReachedIn:             w.ReachedIn,
		ReachedAt:             w.ReachedAt,
		SpurredToExpeditionID: w.SpurredToExpeditionID,
		CreatedAt:             w.CreatedAt,
		UpdatedAt:             w.UpdatedAt,
	}
	if w.Approach != nil {
		a := string(*w.Approach)
		dto.Approach = &a
	}
	if w.PreviousStatus != nil {
		p := string(*w.PreviousStatus)
		dto.PreviousStatus = &p
	}
	return dto
}

type lineageDTO struct {
	ChildExpeditionID string  `json:"childExpeditionId"`
	ParentKind        string  `json:"parentKind"`
	ParentSessionID   *string `json:"parentSessionId,omitempty"`
	ParentWaypointID  *string `json:"parentWaypointId,omitempty"`
}

func newLineageDTO(l *domain.ExpeditionLineage) lineageDTO {
	return lineageDTO{
		ChildExpeditionID: l.ChildExpeditionID,
		ParentKind:        string(l.ParentKind),
		ParentSessionID:   l.ParentSessionID,
		ParentWaypointID:  l.ParentWaypointID,
	}
}

type createExpeditionRequest struct {
	WorkspaceID      string  `json:"workspaceId"`
	Slug           string  `json:"slug"`
	Title          string  `json:"title"`
	BriefingPrompt string  `json:"briefingPrompt"`
	Destination    *string `json:"destination,omitempty"`
	Notes          *string `json:"notes,omitempty"`
	SessionID      *string `json:"sessionId,omitempty"`
}

func (r createExpeditionRequest) toParams() store.CreateExpeditionParams {
	return store.CreateExpeditionParams{
		WorkspaceID:      r.WorkspaceID,
		Slug:           r.Slug,
		Title:          r.Title,
		BriefingPrompt: r.BriefingPrompt,
		Destination:    r.Destination,
		Notes:          r.Notes,
		SessionID:      r.SessionID,
	}
}

type updateExpeditionRequest struct {
	Title       *string `json:"title,omitempty"`
	Destination *string `json:"destination,omitempty"`
	Notes       *string `json:"notes,omitempty"`
}

func (r updateExpeditionRequest) toParams() store.UpdateExpeditionParams {
	return store.UpdateExpeditionParams{Title: r.Title, Destination: r.Destination, Notes: r.Notes}
}

// completeExpeditionRequest's SpecSlug/FeatureName (outcomeKind "spec"
// only) mirror mcpserver's completeExpeditionIn: the handler creates the
// spec and links it server-side — OutcomeSpecID is never client-supplied
// (there is no standalone create_spec endpoint either).
type completeExpeditionRequest struct {
	OutcomeKind    string  `json:"outcomeKind"`
	OutcomeSummary *string `json:"outcomeSummary,omitempty"`
	SpecSlug       *string `json:"specSlug,omitempty"`
	FeatureName    *string `json:"featureName,omitempty"`
}

func (r completeExpeditionRequest) toParams() store.CompleteExpeditionParams {
	return store.CompleteExpeditionParams{
		OutcomeKind:    domain.ExpeditionOutcomeKind(r.OutcomeKind),
		OutcomeSummary: r.OutcomeSummary,
	}
}

type addWaypointRequest struct {
	Title          string  `json:"title"`
	Question       string  `json:"question"`
	Approach       *string `json:"approach,omitempty"`
	Resolution     *string `json:"resolution,omitempty"`
	ResolutionGist *string `json:"resolutionGist,omitempty"`
	ReachedIn      *string `json:"reachedIn,omitempty"`
}

func (r addWaypointRequest) toParams() store.AddWaypointParams {
	p := store.AddWaypointParams{
		Title:          r.Title,
		Question:       r.Question,
		Resolution:     r.Resolution,
		ResolutionGist: r.ResolutionGist,
		ReachedIn:      r.ReachedIn,
	}
	if r.Approach != nil {
		a := domain.WaypointApproach(*r.Approach)
		p.Approach = &a
	}
	return p
}

type updateWaypointRequest struct {
	Title    *string `json:"title,omitempty"`
	Question *string `json:"question,omitempty"`
	Approach *string `json:"approach,omitempty"`
}

func (r updateWaypointRequest) toParams() store.UpdateWaypointParams {
	p := store.UpdateWaypointParams{Title: r.Title, Question: r.Question}
	if r.Approach != nil {
		a := domain.WaypointApproach(*r.Approach)
		p.Approach = &a
	}
	return p
}

type claimWaypointRequest struct {
	ClaimedBy string `json:"claimedBy"`
}

type reachWaypointRequest struct {
	Resolution     string  `json:"resolution"`
	ResolutionGist string  `json:"resolutionGist"`
	Rationale      *string `json:"rationale,omitempty"`
	ReachedIn      *string `json:"reachedIn,omitempty"`
}

func (r reachWaypointRequest) toParams() store.ReachWaypointParams {
	return store.ReachWaypointParams{
		Resolution:     r.Resolution,
		ResolutionGist: r.ResolutionGist,
		Rationale:      r.Rationale,
		ReachedIn:      r.ReachedIn,
	}
}

type bypassWaypointRequest struct {
	Reason string `json:"reason"`
}

// reasonRequest is the shared shape for endpoints that only take a reason:
// reopen_expedition, unbypass_waypoint, unspur_waypoint.
type reasonRequest struct {
	Reason string `json:"reason"`
}

type spurWaypointRequest struct {
	WorkspaceID      string  `json:"workspaceId"`
	Slug           string  `json:"slug"`
	Title          string  `json:"title"`
	BriefingPrompt string  `json:"briefingPrompt"`
	Destination    *string `json:"destination,omitempty"`
	Notes          *string `json:"notes,omitempty"`
	Rationale      *string `json:"rationale,omitempty"`
	ReachedIn      *string `json:"reachedIn,omitempty"`
}

func (r spurWaypointRequest) toParams() store.SpurWaypointParams {
	return store.SpurWaypointParams{
		CreateExpeditionParams: store.CreateExpeditionParams{
			WorkspaceID:      r.WorkspaceID,
			Slug:           r.Slug,
			Title:          r.Title,
			BriefingPrompt: r.BriefingPrompt,
			Destination:    r.Destination,
			Notes:          r.Notes,
		},
		Rationale: r.Rationale,
		ReachedIn: r.ReachedIn,
	}
}

type waypointDependencyRequest struct {
	FromWaypointID string `json:"fromWaypointId"`
	ToWaypointID   string `json:"toWaypointId"`
}

type waypointDependencyDTO struct {
	FromWaypointID string    `json:"fromWaypointId"`
	ToWaypointID   string    `json:"toWaypointId"`
	CreatedAt      time.Time `json:"createdAt"`
}

func newWaypointDependencyDTO(e domain.WaypointDependencyEdge) waypointDependencyDTO {
	return waypointDependencyDTO{
		FromWaypointID: e.FromWaypointID,
		ToWaypointID:   e.ToWaypointID,
		CreatedAt:      e.CreatedAt,
	}
}

type errorResponse struct {
	Error string `json:"error"`
}

// --- Rehydrate / history / flags / assets / terms ---
//
// Previously readable over MCP only (see mcpserver/rehydrate.go,
// mcpserver/assets.go, mcpserver/terms.go) but absent from this REST
// surface. Mirrors those tools' request/response shapes.

type waypointHistoryEntryDTO struct {
	ID             string     `json:"id"`
	WaypointID     string     `json:"waypointId"`
	Ordinal        int        `json:"ordinal"`
	SourceStatus   string     `json:"sourceStatus"`
	Resolution     *string    `json:"resolution,omitempty"`
	ResolutionGist *string    `json:"resolutionGist,omitempty"`
	Rationale      *string    `json:"rationale,omitempty"`
	ReachedIn      *string    `json:"reachedIn,omitempty"`
	ReachedAt      *time.Time `json:"reachedAt,omitempty"`
	BypassReason   *string    `json:"bypassReason,omitempty"`
	Reason         string     `json:"reason"`
	SupersededAt   time.Time  `json:"supersededAt"`
	CreatedAt      time.Time  `json:"createdAt"`
}

func newWaypointHistoryEntryDTO(h *domain.WaypointHistoryEntry) waypointHistoryEntryDTO {
	return waypointHistoryEntryDTO{
		ID:             h.ID,
		WaypointID:     h.WaypointID,
		Ordinal:        h.Ordinal,
		SourceStatus:   string(h.SourceStatus),
		Resolution:     h.Resolution,
		ResolutionGist: h.ResolutionGist,
		Rationale:      h.Rationale,
		ReachedIn:      h.ReachedIn,
		ReachedAt:      h.ReachedAt,
		BypassReason:   h.BypassReason,
		Reason:         h.Reason,
		SupersededAt:   h.SupersededAt,
		CreatedAt:      h.CreatedAt,
	}
}

type flagDTO struct {
	ID               string     `json:"id"`
	TargetWaypointID string     `json:"targetWaypointId"`
	SourceWaypointID *string    `json:"sourceWaypointId,omitempty"`
	Note             string     `json:"note"`
	RaisedAt         time.Time  `json:"raisedAt"`
	Resolved         bool       `json:"resolved"`
	ResolvedAt       *time.Time `json:"resolvedAt,omitempty"`
	ResolvedReason   *string    `json:"resolvedReason,omitempty"`
}

func newFlagDTO(f *domain.WaypointFlag) flagDTO {
	return flagDTO{
		ID:               f.ID,
		TargetWaypointID: f.TargetWaypointID,
		SourceWaypointID: f.SourceWaypointID,
		Note:             f.Note,
		RaisedAt:         f.RaisedAt,
		Resolved:         f.Resolved,
		ResolvedAt:       f.ResolvedAt,
		ResolvedReason:   f.ResolvedReason,
	}
}

type flagWaypointRequest struct {
	Note             string  `json:"note"`
	SourceWaypointID *string `json:"sourceWaypointId,omitempty"`
}

type assetDTO struct {
	ID              string    `json:"id"`
	WaypointID      string    `json:"waypointId"`
	Ordinal         int       `json:"ordinal"`
	Kind            string    `json:"kind"`
	Title           string    `json:"title"`
	ContentMarkdown *string   `json:"contentMarkdown,omitempty"`
	RepoPath        *string   `json:"repoPath,omitempty"`
	CommitSHA       *string   `json:"commitSha,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
}

func newAssetDTO(a *domain.WaypointAsset) assetDTO {
	return assetDTO{
		ID:              a.ID,
		WaypointID:      a.WaypointID,
		Ordinal:         a.Ordinal,
		Kind:            a.Kind,
		Title:           a.Title,
		ContentMarkdown: a.ContentMarkdown,
		RepoPath:        a.RepoPath,
		CommitSHA:       a.CommitSHA,
		CreatedAt:       a.CreatedAt,
	}
}

type addWaypointAssetRequest struct {
	Kind            string  `json:"kind"`
	Title           string  `json:"title"`
	ContentMarkdown *string `json:"contentMarkdown,omitempty"`
	RepoPath        *string `json:"repoPath,omitempty"`
	CommitSHA       *string `json:"commitSha,omitempty"`
}

func (r addWaypointAssetRequest) toParams() store.AddWaypointAssetParams {
	return store.AddWaypointAssetParams{
		Kind: r.Kind, Title: r.Title,
		ContentMarkdown: r.ContentMarkdown, RepoPath: r.RepoPath, CommitSHA: r.CommitSHA,
	}
}

type termDTO struct {
	ID           string `json:"id"`
	ExpeditionID string `json:"expeditionId"`
	Term         string `json:"term"`
	Definition   string `json:"definition"`
}

func newTermDTO(t *domain.ExpeditionTerm) termDTO {
	return termDTO{ID: t.ID, ExpeditionID: t.ExpeditionID, Term: t.Term, Definition: t.Definition}
}

type addExpeditionTermRequest struct {
	Term       string `json:"term"`
	Definition string `json:"definition"`
}

type updateExpeditionTermRequest struct {
	Definition string `json:"definition"`
}

// --- Spec pipeline ---
//
// Scoped deliberately narrower than the mcp__rig__* catalog (see
// mcpserver/spec.go and spec-pipeline-graph.md): read/lifecycle endpoints,
// plus approve/deny — which have NO MCP tool at all (approve/deny is
// human-only, per .meta/spec/README.md) and need some interface. Every
// per-artifact CRUD endpoint (user stories, design components, task
// items, ...) already has a full, tested mcp__rig__* equivalent; mirroring
// all of it here would just duplicate that surface for a REST client that,
// today, doesn't exist.

type specDTO struct {
	ID                           string     `json:"id"`
	WorkspaceID                    string     `json:"workspaceId"`
	Slug                         string     `json:"slug"`
	FeatureName                  string     `json:"featureName"`
	RequirementsOverview         string     `json:"requirementsOverview"`
	RequirementsStageStatus      string     `json:"requirementsStageStatus"`
	RequirementsDeniedAt         *time.Time `json:"requirementsDeniedAt,omitempty"`
	RequirementsLastDenialReason *string    `json:"requirementsLastDenialReason,omitempty"`
	DesignOverview               string     `json:"designOverview"`
	DesignArchitecture           string     `json:"designArchitecture"`
	DesignDataModelOverview      *string    `json:"designDataModelOverview,omitempty"`
	DesignStageStatus            string     `json:"designStageStatus"`
	DesignDeniedAt               *time.Time `json:"designDeniedAt,omitempty"`
	DesignLastDenialReason       *string    `json:"designLastDenialReason,omitempty"`
	TasksStageStatus             string     `json:"tasksStageStatus"`
	CreatedAt                    time.Time  `json:"createdAt"`
	UpdatedAt                    time.Time  `json:"updatedAt"`
}

func newSpecDTO(s *domain.Spec, tasksStatus domain.SpecStageStatus) specDTO {
	return specDTO{
		ID: s.ID, WorkspaceID: s.WorkspaceID, Slug: s.Slug, FeatureName: s.FeatureName,
		RequirementsOverview:         s.RequirementsOverview,
		RequirementsStageStatus:      string(s.RequirementsStageStatus),
		RequirementsDeniedAt:         s.RequirementsDeniedAt,
		RequirementsLastDenialReason: s.RequirementsLastDenialReason,
		DesignOverview:               s.DesignOverview,
		DesignArchitecture:           s.DesignArchitecture,
		DesignDataModelOverview:      s.DesignDataModelOverview,
		DesignStageStatus:            string(s.DesignStageStatus),
		DesignDeniedAt:               s.DesignDeniedAt,
		DesignLastDenialReason:       s.DesignLastDenialReason,
		TasksStageStatus:             string(tasksStatus),
		CreatedAt:                    s.CreatedAt,
		UpdatedAt:                    s.UpdatedAt,
	}
}

type tasksDocDTO struct {
	ID                string     `json:"id"`
	SpecID            string     `json:"specId"`
	DesignComponentID string     `json:"designComponentId"`
	ComponentSlug     string     `json:"componentSlug"`
	ComponentName     string     `json:"componentName"`
	Status            string     `json:"status"`
	DeniedAt          *time.Time `json:"deniedAt,omitempty"`
	LastDenialReason  *string    `json:"lastDenialReason,omitempty"`
}

func newTasksDocDTO(t *domain.TasksDoc) tasksDocDTO {
	return tasksDocDTO{
		ID: t.ID, SpecID: t.SpecID, DesignComponentID: t.DesignComponentID,
		ComponentSlug: t.ComponentSlug, ComponentName: t.ComponentName,
		Status: string(t.Status), DeniedAt: t.DeniedAt, LastDenialReason: t.LastDenialReason,
	}
}

type nextStageInfoDTO struct {
	NextStage         string   `json:"nextStage"`
	LaggingComponents []string `json:"laggingComponents,omitempty"`
}

func newNextStageInfoDTO(n *domain.NextStageInfo) nextStageInfoDTO {
	return nextStageInfoDTO{NextStage: string(n.NextStage), LaggingComponents: n.LaggingComponents}
}

// stageActionRequest is the shared shape for finalize/approve/deny on a
// spec's requirements/design stage, or one component's tasks stage.
// Component is required (and is the design component's slug) when Stage is
// "tasks"; Reason is required for deny, ignored otherwise.
type stageActionRequest struct {
	Stage     string  `json:"stage"`
	Component *string `json:"component,omitempty"`
	Reason    string  `json:"reason,omitempty"`
}

// stageActionResponse carries whichever of Spec/TasksDoc the action
// affected — Spec for requirements/design, TasksDoc for tasks.
type stageActionResponse struct {
	Spec     *specDTO     `json:"spec,omitempty"`
	TasksDoc *tasksDocDTO `json:"tasksDoc,omitempty"`
}

type renderDocumentResponse struct {
	Markdown string `json:"markdown"`
}
