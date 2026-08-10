package mcpserver

import (
	"time"

	"github.com/somnivertix/rig/internal/graph/domain"
)

// expeditionOut is the wire shape of an expedition (domain.Expedition),
// using SKILL.md's public vocabulary.
type expeditionOut struct {
	ID             string  `json:"id"`
	WorkspaceID      string  `json:"workspaceId"`
	Slug           string  `json:"slug"`
	Title          string  `json:"title"`
	BriefingPrompt string  `json:"briefingPrompt"`
	Destination    *string `json:"destination,omitempty"`
	Notes          *string `json:"notes,omitempty"`
	Status         string  `json:"status"`
	OutcomeKind    *string `json:"outcomeKind,omitempty"`
	OutcomeSpecID  *string `json:"outcomeSpecId,omitempty"`
	OutcomeSummary *string `json:"outcomeSummary,omitempty"`
	ReopenReason   *string `json:"reopenReason,omitempty" jsonschema:"why reopen_expedition was last called, if ever"`
}

func newExpeditionOut(e *domain.Expedition) expeditionOut {
	out := expeditionOut{
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
		ReopenReason:   e.ReopenReason,
	}
	if e.OutcomeKind != nil {
		k := string(*e.OutcomeKind)
		out.OutcomeKind = &k
	}
	return out
}

// waypointOut is the wire shape of a waypoint (domain.Waypoint). History,
// Flags, and Assets are populated only by the get_waypoint detail path (see
// newWaypointOutDetailed in waypoints.go) — omitted everywhere else
// (list_waypoints, get_frontier, the expedition map) to avoid an N+1 fetch
// fan-out on every list/map call.
type waypointOut struct {
	ID                    string               `json:"id"`
	ExpeditionID          string               `json:"expeditionId"`
	Number                int                  `json:"number"`
	Title                 string               `json:"title"`
	Question              string               `json:"question"`
	Approach              *string              `json:"approach,omitempty"`
	Status                string               `json:"status"`
	ClaimedBy             *string              `json:"claimedBy,omitempty"`
	Resolution            *string              `json:"resolution,omitempty"`
	ResolutionGist        *string              `json:"resolutionGist,omitempty"`
	Rationale             *string              `json:"rationale,omitempty"`
	BypassReason          *string              `json:"bypassReason,omitempty"`
	UnbypassReason        *string              `json:"unbypassReason,omitempty" jsonschema:"why unbypass_waypoint was last called, if ever"`
	UnspurReason          *string              `json:"unspurReason,omitempty" jsonschema:"why unspur_waypoint was last called, if ever"`
	ReachedIn             *string              `json:"reachedIn,omitempty"`
	SpurredToExpeditionID *string              `json:"spurredToExpeditionId,omitempty"`
	History               []waypointHistoryOut `json:"history,omitempty"`
	Flags                 []flagOut            `json:"flags,omitempty"`
	Assets                []assetOut           `json:"assets,omitempty"`
}

func newWaypointOut(w *domain.Waypoint) waypointOut {
	out := waypointOut{
		ID:                    w.ID,
		ExpeditionID:          w.ExpeditionID,
		Number:                w.WaypointNumber,
		Title:                 w.Title,
		Question:              w.Question,
		Status:                string(w.Status),
		ClaimedBy:             w.ClaimedBy,
		Resolution:            w.Resolution,
		ResolutionGist:        w.ResolutionGist,
		Rationale:             w.Rationale,
		BypassReason:          w.BypassReason,
		UnbypassReason:        w.UnbypassReason,
		UnspurReason:          w.UnspurReason,
		ReachedIn:             w.ReachedIn,
		SpurredToExpeditionID: w.SpurredToExpeditionID,
	}
	if w.Approach != nil {
		a := string(*w.Approach)
		out.Approach = &a
	}
	return out
}

func newWaypointOuts(waypoints []*domain.Waypoint) []waypointOut {
	outs := make([]waypointOut, len(waypoints))
	for i, w := range waypoints {
		outs[i] = newWaypointOut(w)
	}
	return outs
}

// edgeOut is the wire shape of a dependency edge.
type edgeOut struct {
	FromWaypointID string     `json:"fromWaypointId"`
	ToWaypointID   string     `json:"toWaypointId"`
	CreatedAt      *time.Time `json:"createdAt,omitempty"`
}

func newEdgeOuts(edges []domain.WaypointDependencyEdge) []edgeOut {
	outs := make([]edgeOut, len(edges))
	for i, e := range edges {
		out := edgeOut{FromWaypointID: e.FromWaypointID, ToWaypointID: e.ToWaypointID}
		if !e.CreatedAt.IsZero() {
			t := e.CreatedAt
			out.CreatedAt = &t
		}
		outs[i] = out
	}
	return outs
}

// waypointRef is how a waypoint is referred to inline elsewhere (edges,
// "waiting on" lists) — enough to print "W<number> <title>" without a
// second lookup.
type waypointRef struct {
	ID     string `json:"id"`
	Number int    `json:"number"`
	Title  string `json:"title"`
}

func newWaypointRef(w *domain.Waypoint) waypointRef {
	return waypointRef{ID: w.ID, Number: w.WaypointNumber, Title: w.Title}
}

// waypointHistoryOut is the wire shape of a WaypointHistoryEntry — one
// snapshot taken by rehydrate_waypoint immediately before a redo overwrites
// the live fields. Append-only; nothing here is ever deleted.
type waypointHistoryOut struct {
	ID             string     `json:"id"`
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
}

func newWaypointHistoryOut(h *domain.WaypointHistoryEntry) waypointHistoryOut {
	return waypointHistoryOut{
		ID:             h.ID,
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
	}
}

func newWaypointHistoryOuts(hs []*domain.WaypointHistoryEntry) []waypointHistoryOut {
	outs := make([]waypointHistoryOut, len(hs))
	for i, h := range hs {
		outs[i] = newWaypointHistoryOut(h)
	}
	return outs
}

// flagOut is the wire shape of a WaypointFlag — a non-mutating marker that a
// waypoint's decision may need reconsidering. Never deleted, only resolved.
type flagOut struct {
	ID               string     `json:"id"`
	TargetWaypointID string     `json:"targetWaypointId"`
	SourceWaypointID *string    `json:"sourceWaypointId,omitempty"`
	Note             string     `json:"note"`
	RaisedAt         time.Time  `json:"raisedAt"`
	Resolved         bool       `json:"resolved"`
	ResolvedAt       *time.Time `json:"resolvedAt,omitempty"`
	ResolvedReason   *string    `json:"resolvedReason,omitempty"`
}

func newFlagOut(f *domain.WaypointFlag) flagOut {
	return flagOut{
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

func newFlagOuts(fs []*domain.WaypointFlag) []flagOut {
	outs := make([]flagOut, len(fs))
	for i, f := range fs {
		outs[i] = newFlagOut(f)
	}
	return outs
}

type flagResultOut struct {
	Flag flagOut `json:"flag"`
}

// assetOut is the wire shape of a WaypointAsset — what resolving a waypoint
// produced: a document stored whole, or a reference to code committed on
// main. Exactly one of ContentMarkdown/RepoPath is set per asset.
type assetOut struct {
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

func newAssetOut(a *domain.WaypointAsset) assetOut {
	return assetOut{
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

func newAssetOuts(as []*domain.WaypointAsset) []assetOut {
	outs := make([]assetOut, len(as))
	for i, a := range as {
		outs[i] = newAssetOut(a)
	}
	return outs
}

type assetResultOut struct {
	Asset assetOut `json:"asset"`
}
