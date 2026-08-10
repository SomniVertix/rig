package domain

import "time"

// OpenQuestion unifies v1's three separate flag-like concepts —
// requirements' assumptions_open_questions, design_flags, and
// tasks_flags — into one node label reused at every stage, per
// spec-pipeline-graph.md decision 5. Unlike v1 (which had no resolution
// lifecycle at all), an OpenQuestion here always has one: raised, then
// resolved (answered or explicitly waived).
//
// Unresolved OpenQuestions block BOTH finalize_stage and approve for the
// stage they belong to (decision 6) — a deliberate behavior change from v1,
// where flags were purely informational and never gated anything. A
// drafter that raises one halts entirely rather than proceeding on a
// best-effort assumption (decision 7); resolving it requires a fresh
// re-invocation of the drafter to reconcile and finish (decision 8).
type OpenQuestion struct {
	ID     string
	SpecID string
	Stage  SpecStage // which stage raised it: requirements, design, or tasks

	// TargetID optionally names the specific node the question concerns
	// (e.g. a DesignComponent id or TaskItem id) when it's narrower than
	// the whole stage. Nil means spec/stage-wide.
	TargetID *string

	Description string
	RaisedAt    time.Time

	Resolved       bool
	ResolvedAt     *time.Time
	ResolvedBy     *string // actor who resolved it
	ResolvedReason *string
}
