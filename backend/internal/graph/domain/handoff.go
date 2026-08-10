package domain

import "time"

// HandoffType classifies why a handoff was sent between workspaces.
type HandoffType string

const (
	HandoffTypeBug              HandoffType = "bug"
	HandoffTypeQuestion         HandoffType = "question"
	HandoffTypeFYI              HandoffType = "fyi"
	HandoffTypeDependencyChange HandoffType = "dependency-change"
)

// HandoffStatus is the lifecycle state of a Handoff, from delivery through
// resolution. Actioned and dismissed are terminal states.
type HandoffStatus string

const (
	HandoffStatusPending   HandoffStatus = "pending"
	HandoffStatusRead      HandoffStatus = "read"
	HandoffStatusActioned  HandoffStatus = "actioned"  // terminal
	HandoffStatusDismissed HandoffStatus = "dismissed" // terminal
)

// Handoff is a message sent from one workspace to another, optionally
// anchored to the origin expedition/waypoint/commit/session it arose from.
// Handoffs are append-only: they carry no update or delete affordance beyond
// the read/resolution fields recorded here.
type Handoff struct {
	ID                 string
	SourceWorkspaceID  string
	TargetWorkspaceID  string
	Title              string
	BodyMarkdown       string
	Type               string
	Status             string
	OriginExpeditionID *string
	OriginWaypointID   *string
	OriginCommitSHA    *string
	OriginSessionID    *string
	SentBy             string
	SentAt             time.Time
	ReadAt             *time.Time
	ResolutionNote     *string
	ResolvedAt         *time.Time
	ResolvedBy         *string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

// HandoffAttachment is one piece of supporting evidence attached to a
// Handoff, ordered by Ordinal.
type HandoffAttachment struct {
	ID        string
	HandoffID string
	Ordinal   int
	RepoPath  string
	CommitSHA string
	Note      string
}
