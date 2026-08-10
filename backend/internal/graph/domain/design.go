package domain

import "time"

// DesignComponent is one design.md "## Components" table row: slug |
// display name | responsibility. Mandatory >=1 row is enforced at design
// finalize, not by schema. Ordinal is the linear display order.
type DesignComponent struct {
	ID          string
	SpecID      string
	Slug        string
	DisplayName string
	Ordinal     int
	CreatedAt   time.Time
}

// DataModelEntry is one design.md "## Data Model / Interfaces" item: a
// schema/type/API contract, verbatim.
type DataModelEntry struct {
	ID      string
	SpecID  string
	Ordinal int
	Name    string // e.g. "User", "POST /users"
	Kind    string // e.g. "schema", "type", "api_contract", "interface"
	Content string // the actual schema/type/contract body, verbatim
}

// TraceabilityEntry is one design.md "## Requirement Traceability" table
// row, linked to a UserStory where resolvable. UserStoryID is nil if the
// referenced story can no longer be resolved — RequirementLabel is kept
// as the raw text fallback either way, mirroring v1's ON DELETE SET NULL.
type TraceabilityEntry struct {
	ID               string
	SpecID           string
	UserStoryID      *string
	RequirementLabel string // raw "Story N: <title>" text
	AddressedBy      string // design section/component that satisfies it
	Ordinal          int
}

// Alternative is one design.md "## Alternatives Considered" list item.
type Alternative struct {
	ID          string
	SpecID      string
	Ordinal     int
	Description string
}

// OpenRisk is one design.md "## Open Risks / Tradeoffs" list item.
type OpenRisk struct {
	ID          string
	SpecID      string
	Ordinal     int
	Description string
}
