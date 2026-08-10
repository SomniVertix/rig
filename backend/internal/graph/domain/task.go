package domain

import "time"

// TasksDoc is tasks.md for one design component: one node per
// DesignComponent, auto-seeded the moment design's stage reaches in_review
// (see the seeding rule ported from v1's seed_component_tasks_docs
// trigger), each with its own independent SpecStageStatus lifecycle.
type TasksDoc struct {
	ID                string
	SpecID            string
	DesignComponentID string
	ComponentSlug     string // denormalized for rendering/edge resolution
	ComponentName     string // display name snapshot
	Status            SpecStageStatus
	DeniedAt          *time.Time
	LastDenialReason  *string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// TaskItem unifies tasks.md's "## Order", "## Task List", and each task's
// "Subtasks" the same way v1 did: ParentItemID gives the tree, ItemID +
// ExecutionOrder gives the linear Order sequence, IsChecked is the single
// live checkbox for both the Order checklist and the Task List entry.
//
// Nesting is capped at 2 levels total (a subtask cannot itself have a
// child) — spec-pipeline-graph.md decision 12 — enforced at the store
// layer's add path, not representable as a Neo4j schema constraint.
//
// v1's free-text "traceability" column is dropped entirely: traceability
// is now a required SATISFIES relationship to one or more
// AcceptanceCriterion nodes (decision 13), resolved via the store layer
// rather than held as a field here.
type TaskItem struct {
	ID              string
	TasksDocID      string
	ItemID          string  // stable id referenced by Order / Parallel Execution Schema, e.g. "1", "1.1", "2"
	ParentItemID    *string // nil for a top-level item; must itself be top-level (2-level cap)
	ExecutionOrder  int     // position in the linear Order sequence
	Title           string
	Description     string
	SuggestedAgent  string // defaults to "none"
	AcceptanceCheck string
	IsChecked       bool
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// FileTouched is one entry in a task item's "Files/areas touched" list —
// the auditable blast radius of a task. Capped at 5 per task item
// (decision 14); exceeding it is a signal the task should be split.
type FileTouched struct {
	ID         string
	TaskItemID string
	Ordinal    int
	FilePath   string
}

// TaskDependencyEdge records that From must complete before To, additive to
// each component's own intra-component Order/Parallel Execution Schema.
// Cross-component only — same-component edges are rejected at the store
// layer, mirroring v1's reject_same_component_task_dependency_edge trigger.
// No cycle detection on insert; checked explicitly by finalize_stage,
// walking all of the spec's edges (mirrors Waypoint's BLOCKS edge).
type TaskDependencyEdge struct {
	SpecID         string
	FromTaskItemID string
	ToTaskItemID   string
	CreatedAt      time.Time
}

// ParallelBatch is one tasks.md "## Parallel Execution Schema" batch (P1,
// P2, ...), run in BatchOrder sequence, intra-component. Membership is a
// pure HAS_MEMBER relationship to TaskItem with no properties of its own —
// no separate node type, unlike v1's parallel_batch_members table.
type ParallelBatch struct {
	ID         string
	TasksDocID string
	BatchLabel string // "P1", "P2", ...
	BatchOrder int    // sequence in which batches run
}

// DefinitionOfDoneItem is one entry in the spec-wide "## Definition of
// Done" checklist, shared across every component's TasksDoc under one Spec.
type DefinitionOfDoneItem struct {
	ID          string
	SpecID      string
	Ordinal     int
	Description string
	IsChecked   bool
}
