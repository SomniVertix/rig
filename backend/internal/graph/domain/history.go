package domain

import "time"

// WaypointHistoryEntry is an append-only snapshot of a waypoint's terminal
// state, taken by RehydrateWaypoint immediately before a redo overwrites the
// live fields. Nothing about a waypoint's prior resolution or bypass reason
// is ever deleted — it moves here instead. In graph terms it hangs off its
// waypoint via a HAD_STATE edge, ordinal-numbered the same way a waypoint's
// own number is assigned (max+1).
type WaypointHistoryEntry struct {
	ID             string
	WaypointID     string
	Ordinal        int
	SourceStatus   WaypointStatus // "reached" or "bypassed" — the status this snapshot superseded
	Resolution     *string
	ResolutionGist *string
	Rationale      *string
	ReachedIn      *string
	ReachedAt      *time.Time
	BypassReason   *string
	Reason         string // the reason passed to rehydrate_waypoint
	SupersededAt   time.Time
	CreatedAt      time.Time
}
