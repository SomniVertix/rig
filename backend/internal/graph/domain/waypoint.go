package domain

import "time"

// WaypointStatus is the unified question lifecycle: sighted (fog) -> marked
// (frontier-eligible) -> claimed -> reached (a decision) | bypassed (out of
// scope). A reached or bypassed waypoint can be redone via
// RehydrateWaypoint, which moves it to rehydrating — frontier-eligible and
// claimable exactly like marked, but visually distinct as a redo rather
// than a fresh waypoint. Only marked and rehydrating waypoints are
// frontier-eligible.
type WaypointStatus string

const (
	WaypointSighted     WaypointStatus = "sighted"     // fog: sensed but not yet a sharp question; not claimable
	WaypointMarked      WaypointStatus = "marked"      // sharp question, claimable once unblocked
	WaypointClaimed     WaypointStatus = "claimed"     // a conversation is actively resolving it
	WaypointReached     WaypointStatus = "reached"     // resolved: resolution + resolution_gist recorded
	WaypointBypassed    WaypointStatus = "bypassed"    // consciously routed around, with a reason
	WaypointRehydrating WaypointStatus = "rehydrating" // redo pending: history snapshot taken, workable again
)

// WaypointApproach hints at how a waypoint should be resolved. It is a hint
// for the resolving session, never a contract.
type WaypointApproach string

const (
	ApproachGrilling  WaypointApproach = "grilling"  // HITL: resolve by interviewing the human
	ApproachResearch  WaypointApproach = "research"  // AFK: produces a document asset
	ApproachPrototype WaypointApproach = "prototype" // HITL: produces a prototype_ref asset
	ApproachTask      WaypointApproach = "task"      // do-first work that unblocks a decision
)

// Waypoint is one question being driven to a decision. In graph terms it is
// a node in an Expedition; WaypointDependencyEdge and the spurred-expedition
// lineage edge are its outgoing/incoming edges.
type Waypoint struct {
	ID                    string
	ExpeditionID          string
	WaypointNumber        int    // stable order within the expedition; assigned max+1
	Title                 string // refer-by-name: the short name humans/narration use
	Question              string
	Approach              *WaypointApproach
	Status                WaypointStatus
	ClaimedBy             *string
	ClaimedAt             *time.Time
	Resolution            *string
	ResolutionGist        *string
	Rationale             *string
	BypassReason          *string
	UnbypassReason        *string         // why unbypass_waypoint was last called; nulled by a subsequent bypass
	UnspurReason          *string         // why unspur_waypoint was last called; nulled by a subsequent spur
	PreviousStatus        *WaypointStatus // status immediately before bypass_waypoint terminated it (marked, sighted, or rehydrating)
	ReachedIn             *string         // provenance: identifier of the conversation that resolved it
	ReachedAt             *time.Time
	SpurredToExpeditionID *string // set by SpurWaypoint when this waypoint spun off a new expedition
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

// WaypointDependencyEdge records that From must terminate (reached or
// bypassed) before To is frontier-eligible. Edges must stay within one
// expedition; no cycle detection at the store layer, matching v1.
type WaypointDependencyEdge struct {
	FromWaypointID string
	ToWaypointID   string
	CreatedAt      time.Time
}
