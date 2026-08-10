package domain

import "time"

// WaypointAsset is what resolving a waypoint produced. Exactly one of
// ContentMarkdown / RepoPath is set per asset: documents are stored whole,
// prototype code lives in the repo on main and is referenced by path (+
// optional commit).
type WaypointAsset struct {
	ID              string
	WaypointID      string
	Ordinal         int
	Kind            string // open set, e.g. "research_summary", "analysis", "prototype_ref"
	Title           string
	ContentMarkdown *string
	RepoPath        *string
	CommitSHA       *string
	CreatedAt       time.Time
}
