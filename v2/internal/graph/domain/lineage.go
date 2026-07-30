package domain

import "time"

// LineageParentKind is the kind of an expedition's single parent edge.
type LineageParentKind string

const (
	LineageParentSession  LineageParentKind = "session"  // chartered directly by a session
	LineageParentWaypoint LineageParentKind = "waypoint" // spun off from a waypoint via SpurWaypoint
)

// ExpeditionLineage is an expedition's parent edge: either the session that
// chartered it, or the waypoint whose resolution spun it off. At most one
// parent per expedition (ChildExpeditionID is unique at the store layer).
type ExpeditionLineage struct {
	ID                string
	ChildExpeditionID string
	ParentKind        LineageParentKind
	ParentSessionID   *string
	ParentWaypointID  *string
	CreatedAt         time.Time
}
