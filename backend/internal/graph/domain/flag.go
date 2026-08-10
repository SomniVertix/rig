package domain

import "time"

// WaypointFlag is a non-mutating marker that a waypoint's decision may need
// reconsidering. Deliberately decoupled from RehydrateWaypoint: it can
// target a waypoint in any expedition, regardless of that expedition's or
// the waypoint's own status, and raising one performs no mutation on the
// target. SourceWaypointID is optional — a flag can be raised narratively,
// not necessarily by another waypoint's decision. Never deleted, only
// resolved.
type WaypointFlag struct {
	ID               string
	TargetWaypointID string
	SourceWaypointID *string
	Note             string
	RaisedAt         time.Time
	Resolved         bool
	ResolvedAt       *time.Time
	ResolvedReason   *string
}
