package domain

import "time"

// ExpeditionTerm is a piece of terminology pinned down while walking an
// expedition. Deliberately per-expedition, not a workspace-level glossary.
type ExpeditionTerm struct {
	ID           string
	ExpeditionID string
	Term         string
	Definition   string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
