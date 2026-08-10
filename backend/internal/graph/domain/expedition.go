// Package domain models the expeditions graph: one effort (an expedition) to
// turn a loose idea into a destination, made up of waypoints (questions)
// driven to decisions. Ported from the discovery.* Postgres schema in
// .meta/spec/db/schema.sql (originally "trails"); see that file's PART 2
// comment block for the full narrative this model is derived from.
package domain

import "time"

// ExpeditionStatus is the lifecycle state of an Expedition.
type ExpeditionStatus string

const (
	ExpeditionStatusActive    ExpeditionStatus = "active"    // being walked: waypoints still sighted/marked/claimed
	ExpeditionStatusComplete  ExpeditionStatus = "complete"  // destination reached; outcome_* filled in
	ExpeditionStatusAbandoned ExpeditionStatus = "abandoned" // consciously stopped short of the destination
)

// ExpeditionOutcomeKind describes what a completed expedition yielded.
type ExpeditionOutcomeKind string

const (
	ExpeditionOutcomeSpec     ExpeditionOutcomeKind = "spec"     // handed off to the spec pipeline
	ExpeditionOutcomeDecision ExpeditionOutcomeKind = "decision" // a decision locked; nothing further to build
	ExpeditionOutcomeChange   ExpeditionOutcomeKind = "change"   // a change made in place along the way
)

// Expedition is one effort to turn a loose idea into a destination. Both a
// grilling (resolve-live) and a wayfinder (mark-and-claim-later) style
// conversation operate on the same entity; the difference is behavioral,
// never structural.
type Expedition struct {
	ID             string
	WorkspaceID      string
	Slug           string
	Title          string
	BriefingPrompt string // the user's initial ask, largely verbatim
	Destination    *string
	Notes          *string
	Status         ExpeditionStatus
	OutcomeKind    *ExpeditionOutcomeKind
	OutcomeSpecID  *string
	OutcomeSummary *string
	ReopenReason   *string // why reopen_expedition was last called
	SessionID      *string // which session chartered this expedition, if any
	CreatedAt      time.Time
	UpdatedAt      time.Time
}
