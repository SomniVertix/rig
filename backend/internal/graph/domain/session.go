package domain

import "time"

// SessionKind distinguishes a session's conversational style.
type SessionKind string

const (
	SessionKindDiscovery SessionKind = "discovery" // wayfinder/grilling: driving waypoints to decisions
	SessionKindScratch   SessionKind = "scratch"   // no expedition/waypoint bookkeeping
)

// SessionStatus is a session's lifecycle state.
type SessionStatus string

const (
	SessionStatusOpen      SessionStatus = "open"
	SessionStatusClosed    SessionStatus = "closed"
	SessionStatusExpired   SessionStatus = "expired"
	SessionStatusDiscarded SessionStatus = "discarded"
)

// Session is one wayfinder/grilling invocation (a conversation), stamped
// explicitly so expeditions and expedition lineage can record who chartered
// them. No implicit/inferred session boundaries.
type Session struct {
	ID           string
	Actor        string // validated against a known-actors registry at the application layer
	Label        *string
	Kind         SessionKind
	Executor     string // "claude" today
	WorkspaceID  *string
	SeedPrompt   *string
	Status       SessionStatus
	LastAnswerAt *time.Time
	EndedAt      *time.Time
	CreatedAt    time.Time
}
