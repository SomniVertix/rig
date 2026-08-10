package domain

// EarsPattern is the acceptance-criterion clause pattern (Easy Approach to
// Requirements Syntax), per requirements.template.md.
type EarsPattern string

const (
	EarsUbiquitous         EarsPattern = "ubiquitous"          // THE SYSTEM SHALL <always-true behavior>
	EarsEventDriven        EarsPattern = "event_driven"        // WHEN <trigger>, THE SYSTEM SHALL <response>
	EarsStateDriven        EarsPattern = "state_driven"        // WHILE <state>, THE SYSTEM SHALL <response>
	EarsUnwantedBehavior   EarsPattern = "unwanted_behavior"   // IF <undesired condition>, THEN THE SYSTEM SHALL <response>
	EarsComplexConditional EarsPattern = "complex_conditional" // WHEN <trigger>, IF <condition>, THE SYSTEM SHALL <response>
	EarsOptionalFeature    EarsPattern = "optional_feature"    // WHERE <feature included>, THE SYSTEM SHALL <response>
)

// UserStory is one requirements.md "### Story N" entry: the As-a/I-want/
// so-that line plus rationale, numbered within its spec.
type UserStory struct {
	ID          string
	SpecID      string
	StoryNumber int
	Title       string
	Role        string // "As a <role>"
	Capability  string // "I want <capability>"
	Benefit     string // "so that <benefit>"
	Rationale   string
}

// AcceptanceCriterion is one EARS criterion grouped under a UserStory.
// FullText is the verbatim source; the clause fields are the parsed
// decomposition and may be absent depending on EarsPattern.
type AcceptanceCriterion struct {
	ID              string
	UserStoryID     string
	CriterionNumber int
	EarsPattern     EarsPattern
	TriggerClause   *string // WHEN <trigger>
	ConditionClause *string // IF <condition> / WHERE <feature is included>
	StateClause     *string // WHILE <state>
	ResponseClause  string  // THE SYSTEM SHALL <response>
	FullText        string  // criterion exactly as authored, verbatim fallback
}

// NonGoal is one requirements.md "## Non-Goals" list item.
type NonGoal struct {
	ID          string
	SpecID      string
	Ordinal     int
	Description string
}

// GlossaryTerm is one requirements.md "## Glossary" entry. May link out to an
// external glossary instead of defining inline — exactly one of Definition
// or ExternalReference is set.
type GlossaryTerm struct {
	ID                string
	SpecID            string
	Term              string
	Definition        *string
	ExternalReference *string
}
