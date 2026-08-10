package domain

import "time"

// LineageParentKind is the kind of an expedition's single parent edge.
type LineageParentKind string

const (
	LineageParentSession  LineageParentKind = "session"  // chartered directly by a session
	LineageParentWaypoint LineageParentKind = "waypoint" // spun off from a waypoint via SpurWaypoint
	LineageParentHandoff  LineageParentKind = "handoff"  // chartered from a handoff
)

// ExpeditionLineage is an expedition's parent edge: either the session that
// chartered it, the waypoint whose resolution spun it off, or the handoff it
// was chartered from. At most one parent per expedition (ChildExpeditionID is
// unique at the store layer).
type ExpeditionLineage struct {
	ID                string
	ChildExpeditionID string
	ParentKind        LineageParentKind
	ParentSessionID   *string
	ParentWaypointID  *string
	ParentHandoffID   *string
	CreatedAt         time.Time
}
