// Package domain also models the spec pipeline: one feature's delivery
// lifecycle (requirements -> design -> tasks -> implementation), ported from
// the spec_pipeline.* Postgres schema in .meta/spec/db/schema.sql (PART 1).
// See spec-pipeline-graph.md at the repo root for the full design-interview
// record this port is derived from.
package domain

import "time"

// SpecStageStatus is the shared approve/deny lifecycle for a stage. Only
// requirements and design store this directly on Spec; tasks has no stored
// aggregate status at all — it is derived live from the spec's TasksDoc
// nodes (see DeriveTasksStageStatus), matching v1's
// deriveTasksAggregateStatus.
type SpecStageStatus string

const (
	SpecStageNotStarted SpecStageStatus = "not_started"
	SpecStageInReview   SpecStageStatus = "in_review"
	SpecStageApproved   SpecStageStatus = "approved"
)

// SpecStage names the three pipeline stages. Reused by OpenQuestion to record
// which stage raised it, independent of SpecStageStatus.
type SpecStage string

const (
	SpecStageRequirements SpecStage = "requirements"
	SpecStageDesign       SpecStage = "design"
	SpecStageTasks        SpecStage = "tasks"
)

// Spec is one feature's delivery pipeline, scoped to a workspace. Singleton
// per-stage text (overview, architecture, data-model intro) lives directly
// on Spec as typed properties — never a single markdown blob — per
// spec-pipeline-graph.md decision 3. Every repeatable artifact (user
// stories, design components, task items, ...) is its own node linked to
// Spec via HAS_* relationships, per decision 4.
type Spec struct {
	ID          string
	WorkspaceID   string
	Slug        string
	FeatureName string

	RequirementsOverview         string
	RequirementsStageStatus      SpecStageStatus
	RequirementsDeniedAt         *time.Time
	RequirementsLastDenialReason *string

	DesignOverview          string
	DesignArchitecture      string
	DesignDataModelOverview *string // optional intro prose before DataModelEntry nodes
	DesignStageStatus       SpecStageStatus
	DesignDeniedAt          *time.Time
	DesignLastDenialReason  *string

	// Implementation stage: unlike requirements/design/tasks, this is purely
	// a completion marker with no editable content on Spec itself — the work
	// happens outside rig. Approval marks the spec as complete.
	ImplementationStageStatus      SpecStageStatus
	ImplementationDeniedAt         *time.Time
	ImplementationLastDenialReason *string

	CreatedAt time.Time
	UpdatedAt time.Time
}

// NextStageName names the pipeline's next actionable stage for a spec,
// including "implementation" once every component's tasks is approved,
// and the terminal "complete" once implementation is approved.
type NextStageName string

const (
	NextStageRequirements   NextStageName = "requirements"
	NextStageDesign         NextStageName = "design"
	NextStageTasks          NextStageName = "tasks"
	NextStageImplementation NextStageName = "implementation"
	NextStageComplete       NextStageName = "complete"
)

// NextStageInfo is get_next_stage's computed result: which stage to work on
// next, and — when that stage is "tasks" — which components still aren't
// approved yet (mirrors v1's getNextStage laggingComponents).
type NextStageInfo struct {
	NextStage         NextStageName
	LaggingComponents []string // component slugs not yet approved; only populated when NextStage is "tasks"
}
