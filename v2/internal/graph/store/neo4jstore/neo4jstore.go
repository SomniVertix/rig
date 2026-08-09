// Package neo4jstore implements store.Store against Neo4j.
//
// Graph model (see .meta/spec/db/schema.sql PART 2 for the relational
// original this is ported from — "trails" there, "expeditions" here):
//
//	(:Expedition {id, workspaceId, slug, title, briefingPrompt, destination,
//	              notes, status, outcomeKind, outcomeSpecId, outcomeSummary,
//	              reopenReason, sessionId, createdAt, updatedAt})
//	(:Waypoint {id, expeditionId, waypointNumber, title, question, approach,
//	            status, claimedBy, claimedAt, resolution, resolutionGist,
//	            rationale, bypassReason, unbypassReason, unspurReason,
//	            previousStatus, reachedIn, reachedAt, spurredToExpeditionId,
//	            createdAt, updatedAt})
//	(:WaypointHistoryEntry {id, waypointId, ordinal, sourceStatus, resolution,
//	                         resolutionGist, rationale, reachedIn, reachedAt,
//	                         bypassReason, reason, supersededAt, createdAt})
//	(:WaypointFlag {id, targetWaypointId, sourceWaypointId, note, raisedAt,
//	                 resolved, resolvedAt, resolvedReason})
//	(:WaypointAsset {id, waypointId, ordinal, kind, title, contentMarkdown,
//	                  repoPath, commitSha, createdAt})
//	(:ExpeditionTerm {id, expeditionId, term, definition, createdAt, updatedAt})
//
//	(:Expedition)-[:HAS_WAYPOINT]->(:Waypoint)
//	(:Waypoint)-[:BLOCKS]->(:Waypoint)      -- from_waypoint blocks to_waypoint
//	(:Waypoint)-[:SPURRED]->(:Expedition)   -- spur_waypoint lineage edge
//	(:Session)-[:CHARTERED]->(:Expedition)  -- session-chartered lineage edge
//	(:Waypoint)-[:HAD_STATE]->(:WaypointHistoryEntry)  -- rehydrate_waypoint snapshot
//	(:WaypointFlag)-[:FLAGS]->(:Waypoint)              -- flag_waypoint target (required)
//	(:Waypoint)-[:RAISED]->(:WaypointFlag)             -- flag_waypoint source (optional)
//	(:Waypoint)-[:HAS_ASSET]->(:WaypointAsset)         -- add_waypoint_asset
//	(:Expedition)-[:HAS_TERM]->(:ExpeditionTerm)       -- add_expedition_term
//
// Spec pipeline (see .meta/spec/db/schema.sql PART 1 for the relational
// original — spec_pipeline schema; full design record in
// spec-pipeline-graph.md at the repo root). Singleton per-stage text
// (overview, architecture, dataModelOverview) lives directly on Spec —
// never a separate 1:1 node — while every repeatable artifact is its own
// node:
//
//	(:Spec {id, workspaceId, slug, featureName,
//	        requirementsOverview, requirementsStageStatus, requirementsDeniedAt, requirementsLastDenialReason,
//	        designOverview, designArchitecture, designDataModelOverview, designStageStatus, designDeniedAt, designLastDenialReason,
//	        createdAt, updatedAt})
//	(:UserStory {id, specId, storyNumber, title, role, capability, benefit, rationale})
//	(:AcceptanceCriterion {id, userStoryId, criterionNumber, earsPattern, triggerClause, conditionClause, stateClause, responseClause, fullText})
//	(:NonGoal {id, specId, ordinal, description})
//	(:OpenQuestion {id, specId, stage, targetId, description, raisedAt, resolved, resolvedAt, resolvedBy, resolvedReason})
//	(:GlossaryTerm {id, specId, term, definition, externalReference})
//	(:DesignComponent {id, specId, slug, displayName, ordinal, createdAt})
//	(:DataModelEntry {id, specId, ordinal, name, kind, content})
//	(:TraceabilityEntry {id, specId, userStoryId, requirementLabel, addressedBy, ordinal})
//	(:Alternative {id, specId, ordinal, description})
//	(:OpenRisk {id, specId, ordinal, description})
//	(:TasksDoc {id, specId, designComponentId, componentSlug, componentName, status, deniedAt, lastDenialReason, createdAt, updatedAt})
//	(:TaskItem {id, tasksDocId, itemId, parentItemId, executionOrder, title, description, suggestedAgent, acceptanceCheck, isChecked, createdAt, updatedAt})
//	(:FileTouched {id, taskItemId, ordinal, filePath})
//	(:ParallelBatch {id, tasksDocId, batchLabel, batchOrder})
//	(:DefinitionOfDoneItem {id, specId, ordinal, description, isChecked})
//
//	(:Spec)-[:HAS_USER_STORY]->(:UserStory)
//	(:UserStory)-[:HAS_CRITERION]->(:AcceptanceCriterion)
//	(:Spec)-[:HAS_NON_GOAL]->(:NonGoal)
//	(:Spec)-[:HAS_OPEN_QUESTION]->(:OpenQuestion)
//	(:Spec)-[:HAS_GLOSSARY_TERM]->(:GlossaryTerm)
//	(:Spec)-[:HAS_COMPONENT]->(:DesignComponent)
//	(:Spec)-[:HAS_DATA_MODEL_ENTRY]->(:DataModelEntry)
//	(:Spec)-[:HAS_TRACEABILITY_ENTRY]->(:TraceabilityEntry)
//	(:TraceabilityEntry)-[:REFERENCES]->(:UserStory)        -- optional; requirementLabel is the text fallback
//	(:Spec)-[:HAS_ALTERNATIVE]->(:Alternative)
//	(:Spec)-[:HAS_OPEN_RISK]->(:OpenRisk)
//	(:DesignComponent)-[:HAS_TASKS_DOC]->(:TasksDoc)        -- 1:1, unique on designComponentId
//	(:TasksDoc)-[:HAS_TASK_ITEM]->(:TaskItem)
//	(:TaskItem)-[:HAS_SUBTASK]->(:TaskItem)                 -- max depth 1 (2-level cap, enforced in code)
//	(:TaskItem)-[:SATISFIES]->(:AcceptanceCriterion)        -- required, >=1 per top-level task item
//	(:TaskItem)-[:HAS_FILE_TOUCHED]->(:FileTouched)         -- max 5 per task item (enforced in code)
//	(:TaskItem)-[:BLOCKS]->(:TaskItem)                      -- task_dependency_edges; cross-component only
//	(:TasksDoc)-[:HAS_BATCH]->(:ParallelBatch)
//	(:ParallelBatch)-[:HAS_MEMBER]->(:TaskItem)
//	(:Spec)-[:HAS_DOD_ITEM]->(:DefinitionOfDoneItem)
//
// Uniqueness and lookup constraints that Postgres gave us for free
// (trails_one_per_spec, waypoints_trail_id_status_idx, ...) are re-expressed
// as Neo4j schema constraints/indexes in EnsureSchema; nothing in the query
// methods below depends on the driver enforcing them, matching v1's
// belt-and-suspenders approach (application-level check + a defensive
// constraint).
package neo4jstore

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/somnivertix/rig/internal/graph/store"
)

// Neo4jStore is a store.Store backed by a Neo4j driver.
type Neo4jStore struct {
	driver   neo4j.DriverWithContext
	database string
}

// New wraps an already-constructed driver. Call EnsureSchema once at process
// startup before serving traffic.
func New(driver neo4j.DriverWithContext, database string) *Neo4jStore {
	return &Neo4jStore{driver: driver, database: database}
}

// Connect dials uri and returns a Neo4jStore, verifying connectivity eagerly
// so misconfiguration fails at startup rather than on first request.
func Connect(ctx context.Context, uri, username, password, database string) (*Neo4jStore, error) {
	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(username, password, ""))
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: connect: %w", err)
	}
	if err := driver.VerifyConnectivity(ctx); err != nil {
		return nil, fmt.Errorf("neo4jstore: verify connectivity: %w", err)
	}
	return New(driver, database), nil
}

func (s *Neo4jStore) Close(ctx context.Context) error {
	return s.driver.Close(ctx)
}

func (s *Neo4jStore) session(ctx context.Context) neo4j.SessionWithContext {
	return s.driver.NewSession(ctx, neo4j.SessionConfig{DatabaseName: s.database})
}

// EnsureSchema creates uniqueness constraints mirroring the primary-key /
// unique-index guarantees the v1 Postgres schema relied on, plus property
// type constraints mirroring the column types v1 Postgres relied on. Safe to
// call on every boot (IF NOT EXISTS), matching v1's idempotent schema.sql.
//
// Property type constraints only reject a value of the wrong type; they
// don't require the property to be present, so they apply cleanly to the
// optional (pointer-typed in Go) properties too. mapping.go's getStringProp
// et al. are the runtime backstop for absence; these are the backstop for
// type — but only where the server supports them: property type constraints
// are a Neo4j Enterprise Edition feature (Aura included), so they're applied
// best-effort and skipped with a warning against Community Edition (e.g. the
// neo4j:5-community container in docker-compose.yml) instead of failing
// boot.
func (s *Neo4jStore) EnsureSchema(ctx context.Context) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	requiredStmts := []string{
		"CREATE CONSTRAINT expedition_id_unique IF NOT EXISTS FOR (e:Expedition) REQUIRE e.id IS UNIQUE",
		"CREATE CONSTRAINT waypoint_id_unique IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.id IS UNIQUE",
		"CREATE CONSTRAINT session_id_unique IF NOT EXISTS FOR (s:Session) REQUIRE s.id IS UNIQUE",
		"CREATE CONSTRAINT expedition_workspace_slug_unique IF NOT EXISTS FOR (e:Expedition) REQUIRE (e.workspaceId, e.slug) IS UNIQUE",
		"CREATE INDEX waypoint_expedition_status_idx IF NOT EXISTS FOR (w:Waypoint) ON (w.expeditionId, w.status)",
		"CREATE CONSTRAINT waypoint_history_id_unique IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.id IS UNIQUE",
		"CREATE CONSTRAINT waypoint_flag_id_unique IF NOT EXISTS FOR (f:WaypointFlag) REQUIRE f.id IS UNIQUE",
		"CREATE INDEX waypoint_flag_resolved_idx IF NOT EXISTS FOR (f:WaypointFlag) ON (f.resolved)",
		"CREATE CONSTRAINT waypoint_asset_id_unique IF NOT EXISTS FOR (a:WaypointAsset) REQUIRE a.id IS UNIQUE",
		"CREATE CONSTRAINT expedition_term_id_unique IF NOT EXISTS FOR (t:ExpeditionTerm) REQUIRE t.id IS UNIQUE",

		// Spec pipeline (see .meta/spec/db/schema.sql PART 1 for the relational
		// original — spec_pipeline schema — this is ported from; full design
		// record in spec-pipeline-graph.md at the repo root).
		"CREATE CONSTRAINT spec_id_unique IF NOT EXISTS FOR (s:Spec) REQUIRE s.id IS UNIQUE",
		"CREATE CONSTRAINT spec_workspace_slug_unique IF NOT EXISTS FOR (s:Spec) REQUIRE (s.workspaceId, s.slug) IS UNIQUE",
		"CREATE CONSTRAINT user_story_id_unique IF NOT EXISTS FOR (u:UserStory) REQUIRE u.id IS UNIQUE",
		"CREATE CONSTRAINT user_story_spec_number_unique IF NOT EXISTS FOR (u:UserStory) REQUIRE (u.specId, u.storyNumber) IS UNIQUE",
		"CREATE CONSTRAINT acceptance_criterion_id_unique IF NOT EXISTS FOR (a:AcceptanceCriterion) REQUIRE a.id IS UNIQUE",
		"CREATE CONSTRAINT acceptance_criterion_story_number_unique IF NOT EXISTS FOR (a:AcceptanceCriterion) REQUIRE (a.userStoryId, a.criterionNumber) IS UNIQUE",
		"CREATE CONSTRAINT non_goal_id_unique IF NOT EXISTS FOR (n:NonGoal) REQUIRE n.id IS UNIQUE",
		"CREATE CONSTRAINT non_goal_spec_ordinal_unique IF NOT EXISTS FOR (n:NonGoal) REQUIRE (n.specId, n.ordinal) IS UNIQUE",
		"CREATE CONSTRAINT open_question_id_unique IF NOT EXISTS FOR (o:OpenQuestion) REQUIRE o.id IS UNIQUE",
		"CREATE INDEX open_question_spec_resolved_idx IF NOT EXISTS FOR (o:OpenQuestion) ON (o.specId, o.resolved)",
		"CREATE CONSTRAINT glossary_term_id_unique IF NOT EXISTS FOR (g:GlossaryTerm) REQUIRE g.id IS UNIQUE",
		"CREATE CONSTRAINT glossary_term_spec_term_unique IF NOT EXISTS FOR (g:GlossaryTerm) REQUIRE (g.specId, g.term) IS UNIQUE",
		"CREATE CONSTRAINT design_component_id_unique IF NOT EXISTS FOR (d:DesignComponent) REQUIRE d.id IS UNIQUE",
		"CREATE CONSTRAINT design_component_spec_slug_unique IF NOT EXISTS FOR (d:DesignComponent) REQUIRE (d.specId, d.slug) IS UNIQUE",
		"CREATE CONSTRAINT design_component_spec_ordinal_unique IF NOT EXISTS FOR (d:DesignComponent) REQUIRE (d.specId, d.ordinal) IS UNIQUE",
		"CREATE CONSTRAINT data_model_entry_id_unique IF NOT EXISTS FOR (d:DataModelEntry) REQUIRE d.id IS UNIQUE",
		"CREATE CONSTRAINT data_model_entry_spec_ordinal_unique IF NOT EXISTS FOR (d:DataModelEntry) REQUIRE (d.specId, d.ordinal) IS UNIQUE",
		"CREATE CONSTRAINT traceability_entry_id_unique IF NOT EXISTS FOR (t:TraceabilityEntry) REQUIRE t.id IS UNIQUE",
		"CREATE CONSTRAINT traceability_entry_spec_ordinal_unique IF NOT EXISTS FOR (t:TraceabilityEntry) REQUIRE (t.specId, t.ordinal) IS UNIQUE",
		"CREATE INDEX traceability_entry_user_story_id_idx IF NOT EXISTS FOR (t:TraceabilityEntry) ON (t.userStoryId)",
		"CREATE CONSTRAINT alternative_id_unique IF NOT EXISTS FOR (a:Alternative) REQUIRE a.id IS UNIQUE",
		"CREATE CONSTRAINT alternative_spec_ordinal_unique IF NOT EXISTS FOR (a:Alternative) REQUIRE (a.specId, a.ordinal) IS UNIQUE",
		"CREATE CONSTRAINT open_risk_id_unique IF NOT EXISTS FOR (o:OpenRisk) REQUIRE o.id IS UNIQUE",
		"CREATE CONSTRAINT open_risk_spec_ordinal_unique IF NOT EXISTS FOR (o:OpenRisk) REQUIRE (o.specId, o.ordinal) IS UNIQUE",
		"CREATE CONSTRAINT tasks_doc_id_unique IF NOT EXISTS FOR (t:TasksDoc) REQUIRE t.id IS UNIQUE",
		"CREATE CONSTRAINT tasks_doc_spec_component_slug_unique IF NOT EXISTS FOR (t:TasksDoc) REQUIRE (t.specId, t.componentSlug) IS UNIQUE",
		"CREATE CONSTRAINT tasks_doc_design_component_unique IF NOT EXISTS FOR (t:TasksDoc) REQUIRE t.designComponentId IS UNIQUE",
		"CREATE CONSTRAINT task_item_id_unique IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.id IS UNIQUE",
		"CREATE CONSTRAINT task_item_doc_item_id_unique IF NOT EXISTS FOR (t:TaskItem) REQUIRE (t.tasksDocId, t.itemId) IS UNIQUE",
		"CREATE CONSTRAINT task_item_doc_execution_order_unique IF NOT EXISTS FOR (t:TaskItem) REQUIRE (t.tasksDocId, t.executionOrder) IS UNIQUE",
		"CREATE INDEX task_item_parent_item_id_idx IF NOT EXISTS FOR (t:TaskItem) ON (t.parentItemId)",
		"CREATE CONSTRAINT file_touched_id_unique IF NOT EXISTS FOR (f:FileTouched) REQUIRE f.id IS UNIQUE",
		"CREATE CONSTRAINT file_touched_task_item_ordinal_unique IF NOT EXISTS FOR (f:FileTouched) REQUIRE (f.taskItemId, f.ordinal) IS UNIQUE",
		"CREATE CONSTRAINT parallel_batch_id_unique IF NOT EXISTS FOR (p:ParallelBatch) REQUIRE p.id IS UNIQUE",
		"CREATE CONSTRAINT parallel_batch_doc_label_unique IF NOT EXISTS FOR (p:ParallelBatch) REQUIRE (p.tasksDocId, p.batchLabel) IS UNIQUE",
		"CREATE CONSTRAINT parallel_batch_doc_order_unique IF NOT EXISTS FOR (p:ParallelBatch) REQUIRE (p.tasksDocId, p.batchOrder) IS UNIQUE",
		"CREATE CONSTRAINT dod_item_id_unique IF NOT EXISTS FOR (d:DefinitionOfDoneItem) REQUIRE d.id IS UNIQUE",
		"CREATE CONSTRAINT dod_item_spec_ordinal_unique IF NOT EXISTS FOR (d:DefinitionOfDoneItem) REQUIRE (d.specId, d.ordinal) IS UNIQUE",

		// Handoffs (cross-workspace handoff messages and their attachments).
		"CREATE CONSTRAINT handoff_id_unique IF NOT EXISTS FOR (h:Handoff) REQUIRE h.id IS UNIQUE",
		"CREATE INDEX handoff_target_status_idx IF NOT EXISTS FOR (h:Handoff) ON (h.targetWorkspaceId, h.status)",
		"CREATE INDEX handoff_source_status_idx IF NOT EXISTS FOR (h:Handoff) ON (h.sourceWorkspaceId, h.status)",
		"CREATE CONSTRAINT handoff_attachment_id_unique IF NOT EXISTS FOR (a:HandoffAttachment) REQUIRE a.id IS UNIQUE",
		"CREATE CONSTRAINT handoff_attachment_ordinal_unique IF NOT EXISTS FOR (a:HandoffAttachment) REQUIRE (a.handoffId, a.ordinal) IS UNIQUE",

		// HandoffConversations and HandoffTurns (multi-turn negotiation between
		// the source and target workspaces of a Handoff).
		"CREATE CONSTRAINT handoff_conversation_id_unique IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.id IS UNIQUE",
		"CREATE CONSTRAINT handoff_conversation_handoff_unique IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.handoffId IS UNIQUE",
		"CREATE CONSTRAINT handoff_turn_id_unique IF NOT EXISTS FOR (t:HandoffTurn) REQUIRE t.id IS UNIQUE",
		"CREATE CONSTRAINT handoff_turn_number_unique IF NOT EXISTS FOR (t:HandoffTurn) REQUIRE (t.conversationId, t.turnNumber) IS UNIQUE",
	}

	typeStmts := []string{
		// Expedition property types (see nodeToExpedition in mapping.go).
		"CREATE CONSTRAINT expedition_id_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.id IS :: STRING",
		"CREATE CONSTRAINT expedition_workspace_id_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.workspaceId IS :: STRING",
		"CREATE CONSTRAINT expedition_slug_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.slug IS :: STRING",
		"CREATE CONSTRAINT expedition_title_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.title IS :: STRING",
		"CREATE CONSTRAINT expedition_briefing_prompt_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.briefingPrompt IS :: STRING",
		"CREATE CONSTRAINT expedition_destination_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.destination IS :: STRING",
		"CREATE CONSTRAINT expedition_notes_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.notes IS :: STRING",
		"CREATE CONSTRAINT expedition_status_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.status IS :: STRING",
		"CREATE CONSTRAINT expedition_outcome_kind_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.outcomeKind IS :: STRING",
		"CREATE CONSTRAINT expedition_outcome_spec_id_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.outcomeSpecId IS :: STRING",
		"CREATE CONSTRAINT expedition_outcome_summary_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.outcomeSummary IS :: STRING",
		"CREATE CONSTRAINT expedition_session_id_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.sessionId IS :: STRING",
		"CREATE CONSTRAINT expedition_reopen_reason_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.reopenReason IS :: STRING",
		"CREATE CONSTRAINT expedition_created_at_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.createdAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT expedition_updated_at_type IF NOT EXISTS FOR (e:Expedition) REQUIRE e.updatedAt IS :: ZONED DATETIME",

		// Waypoint property types (see nodeToWaypoint in mapping.go).
		"CREATE CONSTRAINT waypoint_id_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.id IS :: STRING",
		"CREATE CONSTRAINT waypoint_expedition_id_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.expeditionId IS :: STRING",
		"CREATE CONSTRAINT waypoint_number_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.waypointNumber IS :: INTEGER",
		"CREATE CONSTRAINT waypoint_title_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.title IS :: STRING",
		"CREATE CONSTRAINT waypoint_question_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.question IS :: STRING",
		"CREATE CONSTRAINT waypoint_approach_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.approach IS :: STRING",
		"CREATE CONSTRAINT waypoint_status_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.status IS :: STRING",
		"CREATE CONSTRAINT waypoint_claimed_by_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.claimedBy IS :: STRING",
		"CREATE CONSTRAINT waypoint_claimed_at_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.claimedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT waypoint_resolution_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.resolution IS :: STRING",
		"CREATE CONSTRAINT waypoint_resolution_gist_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.resolutionGist IS :: STRING",
		"CREATE CONSTRAINT waypoint_rationale_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.rationale IS :: STRING",
		"CREATE CONSTRAINT waypoint_bypass_reason_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.bypassReason IS :: STRING",
		"CREATE CONSTRAINT waypoint_unbypass_reason_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.unbypassReason IS :: STRING",
		"CREATE CONSTRAINT waypoint_unspur_reason_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.unspurReason IS :: STRING",
		"CREATE CONSTRAINT waypoint_previous_status_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.previousStatus IS :: STRING",
		"CREATE CONSTRAINT waypoint_reached_in_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.reachedIn IS :: STRING",
		"CREATE CONSTRAINT waypoint_reached_at_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.reachedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT waypoint_spurred_to_expedition_id_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.spurredToExpeditionId IS :: STRING",
		"CREATE CONSTRAINT waypoint_created_at_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.createdAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT waypoint_updated_at_type IF NOT EXISTS FOR (w:Waypoint) REQUIRE w.updatedAt IS :: ZONED DATETIME",

		// Session property types. Only "id" is written today (StartSession is
		// still store.ErrNotImplemented); the rest of domain.Session isn't
		// constrained until a store method actually sets those properties.
		"CREATE CONSTRAINT session_id_type IF NOT EXISTS FOR (s:Session) REQUIRE s.id IS :: STRING",

		// WaypointHistoryEntry property types (see nodeToWaypointHistoryEntry
		// in mapping.go).
		"CREATE CONSTRAINT waypoint_history_id_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.id IS :: STRING",
		"CREATE CONSTRAINT waypoint_history_waypoint_id_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.waypointId IS :: STRING",
		"CREATE CONSTRAINT waypoint_history_ordinal_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.ordinal IS :: INTEGER",
		"CREATE CONSTRAINT waypoint_history_source_status_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.sourceStatus IS :: STRING",
		"CREATE CONSTRAINT waypoint_history_resolution_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.resolution IS :: STRING",
		"CREATE CONSTRAINT waypoint_history_resolution_gist_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.resolutionGist IS :: STRING",
		"CREATE CONSTRAINT waypoint_history_rationale_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.rationale IS :: STRING",
		"CREATE CONSTRAINT waypoint_history_reached_in_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.reachedIn IS :: STRING",
		"CREATE CONSTRAINT waypoint_history_reached_at_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.reachedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT waypoint_history_bypass_reason_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.bypassReason IS :: STRING",
		"CREATE CONSTRAINT waypoint_history_reason_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.reason IS :: STRING",
		"CREATE CONSTRAINT waypoint_history_superseded_at_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.supersededAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT waypoint_history_created_at_type IF NOT EXISTS FOR (h:WaypointHistoryEntry) REQUIRE h.createdAt IS :: ZONED DATETIME",

		// WaypointFlag property types (see nodeToWaypointFlag in mapping.go).
		"CREATE CONSTRAINT waypoint_flag_id_type IF NOT EXISTS FOR (f:WaypointFlag) REQUIRE f.id IS :: STRING",
		"CREATE CONSTRAINT waypoint_flag_target_id_type IF NOT EXISTS FOR (f:WaypointFlag) REQUIRE f.targetWaypointId IS :: STRING",
		"CREATE CONSTRAINT waypoint_flag_source_id_type IF NOT EXISTS FOR (f:WaypointFlag) REQUIRE f.sourceWaypointId IS :: STRING",
		"CREATE CONSTRAINT waypoint_flag_note_type IF NOT EXISTS FOR (f:WaypointFlag) REQUIRE f.note IS :: STRING",
		"CREATE CONSTRAINT waypoint_flag_raised_at_type IF NOT EXISTS FOR (f:WaypointFlag) REQUIRE f.raisedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT waypoint_flag_resolved_type IF NOT EXISTS FOR (f:WaypointFlag) REQUIRE f.resolved IS :: BOOLEAN",
		"CREATE CONSTRAINT waypoint_flag_resolved_at_type IF NOT EXISTS FOR (f:WaypointFlag) REQUIRE f.resolvedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT waypoint_flag_resolved_reason_type IF NOT EXISTS FOR (f:WaypointFlag) REQUIRE f.resolvedReason IS :: STRING",

		// WaypointAsset property types (see nodeToWaypointAsset in mapping.go).
		"CREATE CONSTRAINT waypoint_asset_id_type IF NOT EXISTS FOR (a:WaypointAsset) REQUIRE a.id IS :: STRING",
		"CREATE CONSTRAINT waypoint_asset_waypoint_id_type IF NOT EXISTS FOR (a:WaypointAsset) REQUIRE a.waypointId IS :: STRING",
		"CREATE CONSTRAINT waypoint_asset_ordinal_type IF NOT EXISTS FOR (a:WaypointAsset) REQUIRE a.ordinal IS :: INTEGER",
		"CREATE CONSTRAINT waypoint_asset_kind_type IF NOT EXISTS FOR (a:WaypointAsset) REQUIRE a.kind IS :: STRING",
		"CREATE CONSTRAINT waypoint_asset_title_type IF NOT EXISTS FOR (a:WaypointAsset) REQUIRE a.title IS :: STRING",
		"CREATE CONSTRAINT waypoint_asset_content_markdown_type IF NOT EXISTS FOR (a:WaypointAsset) REQUIRE a.contentMarkdown IS :: STRING",
		"CREATE CONSTRAINT waypoint_asset_repo_path_type IF NOT EXISTS FOR (a:WaypointAsset) REQUIRE a.repoPath IS :: STRING",
		"CREATE CONSTRAINT waypoint_asset_commit_sha_type IF NOT EXISTS FOR (a:WaypointAsset) REQUIRE a.commitSha IS :: STRING",
		"CREATE CONSTRAINT waypoint_asset_created_at_type IF NOT EXISTS FOR (a:WaypointAsset) REQUIRE a.createdAt IS :: ZONED DATETIME",

		// ExpeditionTerm property types (see nodeToExpeditionTerm in mapping.go).
		"CREATE CONSTRAINT expedition_term_id_type IF NOT EXISTS FOR (t:ExpeditionTerm) REQUIRE t.id IS :: STRING",
		"CREATE CONSTRAINT expedition_term_expedition_id_type IF NOT EXISTS FOR (t:ExpeditionTerm) REQUIRE t.expeditionId IS :: STRING",
		"CREATE CONSTRAINT expedition_term_term_type IF NOT EXISTS FOR (t:ExpeditionTerm) REQUIRE t.term IS :: STRING",
		"CREATE CONSTRAINT expedition_term_definition_type IF NOT EXISTS FOR (t:ExpeditionTerm) REQUIRE t.definition IS :: STRING",
		"CREATE CONSTRAINT expedition_term_created_at_type IF NOT EXISTS FOR (t:ExpeditionTerm) REQUIRE t.createdAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT expedition_term_updated_at_type IF NOT EXISTS FOR (t:ExpeditionTerm) REQUIRE t.updatedAt IS :: ZONED DATETIME",

		// Spec property types (see nodeToSpec in mapping.go).
		"CREATE CONSTRAINT spec_id_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.id IS :: STRING",
		"CREATE CONSTRAINT spec_workspace_id_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.workspaceId IS :: STRING",
		"CREATE CONSTRAINT spec_slug_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.slug IS :: STRING",
		"CREATE CONSTRAINT spec_feature_name_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.featureName IS :: STRING",
		"CREATE CONSTRAINT spec_requirements_overview_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.requirementsOverview IS :: STRING",
		"CREATE CONSTRAINT spec_requirements_stage_status_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.requirementsStageStatus IS :: STRING",
		"CREATE CONSTRAINT spec_requirements_denied_at_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.requirementsDeniedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT spec_requirements_last_denial_reason_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.requirementsLastDenialReason IS :: STRING",
		"CREATE CONSTRAINT spec_design_overview_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.designOverview IS :: STRING",
		"CREATE CONSTRAINT spec_design_architecture_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.designArchitecture IS :: STRING",
		"CREATE CONSTRAINT spec_design_data_model_overview_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.designDataModelOverview IS :: STRING",
		"CREATE CONSTRAINT spec_design_stage_status_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.designStageStatus IS :: STRING",
		"CREATE CONSTRAINT spec_design_denied_at_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.designDeniedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT spec_design_last_denial_reason_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.designLastDenialReason IS :: STRING",
		"CREATE CONSTRAINT spec_implementation_stage_status_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.implementationStageStatus IS :: STRING",
		"CREATE CONSTRAINT spec_implementation_denied_at_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.implementationDeniedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT spec_implementation_last_denial_reason_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.implementationLastDenialReason IS :: STRING",
		"CREATE CONSTRAINT spec_created_at_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.createdAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT spec_updated_at_type IF NOT EXISTS FOR (s:Spec) REQUIRE s.updatedAt IS :: ZONED DATETIME",

		// UserStory property types (see nodeToUserStory in mapping.go).
		"CREATE CONSTRAINT user_story_id_type IF NOT EXISTS FOR (u:UserStory) REQUIRE u.id IS :: STRING",
		"CREATE CONSTRAINT user_story_spec_id_type IF NOT EXISTS FOR (u:UserStory) REQUIRE u.specId IS :: STRING",
		"CREATE CONSTRAINT user_story_number_type IF NOT EXISTS FOR (u:UserStory) REQUIRE u.storyNumber IS :: INTEGER",
		"CREATE CONSTRAINT user_story_title_type IF NOT EXISTS FOR (u:UserStory) REQUIRE u.title IS :: STRING",
		"CREATE CONSTRAINT user_story_role_type IF NOT EXISTS FOR (u:UserStory) REQUIRE u.role IS :: STRING",
		"CREATE CONSTRAINT user_story_capability_type IF NOT EXISTS FOR (u:UserStory) REQUIRE u.capability IS :: STRING",
		"CREATE CONSTRAINT user_story_benefit_type IF NOT EXISTS FOR (u:UserStory) REQUIRE u.benefit IS :: STRING",
		"CREATE CONSTRAINT user_story_rationale_type IF NOT EXISTS FOR (u:UserStory) REQUIRE u.rationale IS :: STRING",

		// AcceptanceCriterion property types (see nodeToAcceptanceCriterion in mapping.go).
		"CREATE CONSTRAINT acceptance_criterion_id_type IF NOT EXISTS FOR (a:AcceptanceCriterion) REQUIRE a.id IS :: STRING",
		"CREATE CONSTRAINT acceptance_criterion_user_story_id_type IF NOT EXISTS FOR (a:AcceptanceCriterion) REQUIRE a.userStoryId IS :: STRING",
		"CREATE CONSTRAINT acceptance_criterion_number_type IF NOT EXISTS FOR (a:AcceptanceCriterion) REQUIRE a.criterionNumber IS :: INTEGER",
		"CREATE CONSTRAINT acceptance_criterion_ears_pattern_type IF NOT EXISTS FOR (a:AcceptanceCriterion) REQUIRE a.earsPattern IS :: STRING",
		"CREATE CONSTRAINT acceptance_criterion_trigger_clause_type IF NOT EXISTS FOR (a:AcceptanceCriterion) REQUIRE a.triggerClause IS :: STRING",
		"CREATE CONSTRAINT acceptance_criterion_condition_clause_type IF NOT EXISTS FOR (a:AcceptanceCriterion) REQUIRE a.conditionClause IS :: STRING",
		"CREATE CONSTRAINT acceptance_criterion_state_clause_type IF NOT EXISTS FOR (a:AcceptanceCriterion) REQUIRE a.stateClause IS :: STRING",
		"CREATE CONSTRAINT acceptance_criterion_response_clause_type IF NOT EXISTS FOR (a:AcceptanceCriterion) REQUIRE a.responseClause IS :: STRING",
		"CREATE CONSTRAINT acceptance_criterion_full_text_type IF NOT EXISTS FOR (a:AcceptanceCriterion) REQUIRE a.fullText IS :: STRING",

		// NonGoal property types (see nodeToNonGoal in mapping.go).
		"CREATE CONSTRAINT non_goal_id_type IF NOT EXISTS FOR (n:NonGoal) REQUIRE n.id IS :: STRING",
		"CREATE CONSTRAINT non_goal_spec_id_type IF NOT EXISTS FOR (n:NonGoal) REQUIRE n.specId IS :: STRING",
		"CREATE CONSTRAINT non_goal_ordinal_type IF NOT EXISTS FOR (n:NonGoal) REQUIRE n.ordinal IS :: INTEGER",
		"CREATE CONSTRAINT non_goal_description_type IF NOT EXISTS FOR (n:NonGoal) REQUIRE n.description IS :: STRING",

		// OpenQuestion property types (see nodeToOpenQuestion in mapping.go).
		"CREATE CONSTRAINT open_question_id_type IF NOT EXISTS FOR (o:OpenQuestion) REQUIRE o.id IS :: STRING",
		"CREATE CONSTRAINT open_question_spec_id_type IF NOT EXISTS FOR (o:OpenQuestion) REQUIRE o.specId IS :: STRING",
		"CREATE CONSTRAINT open_question_stage_type IF NOT EXISTS FOR (o:OpenQuestion) REQUIRE o.stage IS :: STRING",
		"CREATE CONSTRAINT open_question_target_id_type IF NOT EXISTS FOR (o:OpenQuestion) REQUIRE o.targetId IS :: STRING",
		"CREATE CONSTRAINT open_question_description_type IF NOT EXISTS FOR (o:OpenQuestion) REQUIRE o.description IS :: STRING",
		"CREATE CONSTRAINT open_question_raised_at_type IF NOT EXISTS FOR (o:OpenQuestion) REQUIRE o.raisedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT open_question_resolved_type IF NOT EXISTS FOR (o:OpenQuestion) REQUIRE o.resolved IS :: BOOLEAN",
		"CREATE CONSTRAINT open_question_resolved_at_type IF NOT EXISTS FOR (o:OpenQuestion) REQUIRE o.resolvedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT open_question_resolved_by_type IF NOT EXISTS FOR (o:OpenQuestion) REQUIRE o.resolvedBy IS :: STRING",
		"CREATE CONSTRAINT open_question_resolved_reason_type IF NOT EXISTS FOR (o:OpenQuestion) REQUIRE o.resolvedReason IS :: STRING",

		// GlossaryTerm property types (see nodeToGlossaryTerm in mapping.go).
		"CREATE CONSTRAINT glossary_term_id_type IF NOT EXISTS FOR (g:GlossaryTerm) REQUIRE g.id IS :: STRING",
		"CREATE CONSTRAINT glossary_term_spec_id_type IF NOT EXISTS FOR (g:GlossaryTerm) REQUIRE g.specId IS :: STRING",
		"CREATE CONSTRAINT glossary_term_term_type IF NOT EXISTS FOR (g:GlossaryTerm) REQUIRE g.term IS :: STRING",
		"CREATE CONSTRAINT glossary_term_definition_type IF NOT EXISTS FOR (g:GlossaryTerm) REQUIRE g.definition IS :: STRING",
		"CREATE CONSTRAINT glossary_term_external_reference_type IF NOT EXISTS FOR (g:GlossaryTerm) REQUIRE g.externalReference IS :: STRING",

		// DesignComponent property types (see nodeToDesignComponent in mapping.go).
		"CREATE CONSTRAINT design_component_id_type IF NOT EXISTS FOR (d:DesignComponent) REQUIRE d.id IS :: STRING",
		"CREATE CONSTRAINT design_component_spec_id_type IF NOT EXISTS FOR (d:DesignComponent) REQUIRE d.specId IS :: STRING",
		"CREATE CONSTRAINT design_component_slug_type IF NOT EXISTS FOR (d:DesignComponent) REQUIRE d.slug IS :: STRING",
		"CREATE CONSTRAINT design_component_display_name_type IF NOT EXISTS FOR (d:DesignComponent) REQUIRE d.displayName IS :: STRING",
		"CREATE CONSTRAINT design_component_ordinal_type IF NOT EXISTS FOR (d:DesignComponent) REQUIRE d.ordinal IS :: INTEGER",
		"CREATE CONSTRAINT design_component_created_at_type IF NOT EXISTS FOR (d:DesignComponent) REQUIRE d.createdAt IS :: ZONED DATETIME",

		// DataModelEntry property types (see nodeToDataModelEntry in mapping.go).
		"CREATE CONSTRAINT data_model_entry_id_type IF NOT EXISTS FOR (d:DataModelEntry) REQUIRE d.id IS :: STRING",
		"CREATE CONSTRAINT data_model_entry_spec_id_type IF NOT EXISTS FOR (d:DataModelEntry) REQUIRE d.specId IS :: STRING",
		"CREATE CONSTRAINT data_model_entry_ordinal_type IF NOT EXISTS FOR (d:DataModelEntry) REQUIRE d.ordinal IS :: INTEGER",
		"CREATE CONSTRAINT data_model_entry_name_type IF NOT EXISTS FOR (d:DataModelEntry) REQUIRE d.name IS :: STRING",
		"CREATE CONSTRAINT data_model_entry_kind_type IF NOT EXISTS FOR (d:DataModelEntry) REQUIRE d.kind IS :: STRING",
		"CREATE CONSTRAINT data_model_entry_content_type IF NOT EXISTS FOR (d:DataModelEntry) REQUIRE d.content IS :: STRING",

		// TraceabilityEntry property types (see nodeToTraceabilityEntry in mapping.go).
		"CREATE CONSTRAINT traceability_entry_id_type IF NOT EXISTS FOR (t:TraceabilityEntry) REQUIRE t.id IS :: STRING",
		"CREATE CONSTRAINT traceability_entry_spec_id_type IF NOT EXISTS FOR (t:TraceabilityEntry) REQUIRE t.specId IS :: STRING",
		"CREATE CONSTRAINT traceability_entry_user_story_id_type IF NOT EXISTS FOR (t:TraceabilityEntry) REQUIRE t.userStoryId IS :: STRING",
		"CREATE CONSTRAINT traceability_entry_requirement_label_type IF NOT EXISTS FOR (t:TraceabilityEntry) REQUIRE t.requirementLabel IS :: STRING",
		"CREATE CONSTRAINT traceability_entry_addressed_by_type IF NOT EXISTS FOR (t:TraceabilityEntry) REQUIRE t.addressedBy IS :: STRING",
		"CREATE CONSTRAINT traceability_entry_ordinal_type IF NOT EXISTS FOR (t:TraceabilityEntry) REQUIRE t.ordinal IS :: INTEGER",

		// Alternative property types (see nodeToAlternative in mapping.go).
		"CREATE CONSTRAINT alternative_id_type IF NOT EXISTS FOR (a:Alternative) REQUIRE a.id IS :: STRING",
		"CREATE CONSTRAINT alternative_spec_id_type IF NOT EXISTS FOR (a:Alternative) REQUIRE a.specId IS :: STRING",
		"CREATE CONSTRAINT alternative_ordinal_type IF NOT EXISTS FOR (a:Alternative) REQUIRE a.ordinal IS :: INTEGER",
		"CREATE CONSTRAINT alternative_description_type IF NOT EXISTS FOR (a:Alternative) REQUIRE a.description IS :: STRING",

		// OpenRisk property types (see nodeToOpenRisk in mapping.go).
		"CREATE CONSTRAINT open_risk_id_type IF NOT EXISTS FOR (o:OpenRisk) REQUIRE o.id IS :: STRING",
		"CREATE CONSTRAINT open_risk_spec_id_type IF NOT EXISTS FOR (o:OpenRisk) REQUIRE o.specId IS :: STRING",
		"CREATE CONSTRAINT open_risk_ordinal_type IF NOT EXISTS FOR (o:OpenRisk) REQUIRE o.ordinal IS :: INTEGER",
		"CREATE CONSTRAINT open_risk_description_type IF NOT EXISTS FOR (o:OpenRisk) REQUIRE o.description IS :: STRING",

		// TasksDoc property types (see nodeToTasksDoc in mapping.go).
		"CREATE CONSTRAINT tasks_doc_id_type IF NOT EXISTS FOR (t:TasksDoc) REQUIRE t.id IS :: STRING",
		"CREATE CONSTRAINT tasks_doc_spec_id_type IF NOT EXISTS FOR (t:TasksDoc) REQUIRE t.specId IS :: STRING",
		"CREATE CONSTRAINT tasks_doc_design_component_id_type IF NOT EXISTS FOR (t:TasksDoc) REQUIRE t.designComponentId IS :: STRING",
		"CREATE CONSTRAINT tasks_doc_component_slug_type IF NOT EXISTS FOR (t:TasksDoc) REQUIRE t.componentSlug IS :: STRING",
		"CREATE CONSTRAINT tasks_doc_component_name_type IF NOT EXISTS FOR (t:TasksDoc) REQUIRE t.componentName IS :: STRING",
		"CREATE CONSTRAINT tasks_doc_status_type IF NOT EXISTS FOR (t:TasksDoc) REQUIRE t.status IS :: STRING",
		"CREATE CONSTRAINT tasks_doc_denied_at_type IF NOT EXISTS FOR (t:TasksDoc) REQUIRE t.deniedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT tasks_doc_last_denial_reason_type IF NOT EXISTS FOR (t:TasksDoc) REQUIRE t.lastDenialReason IS :: STRING",
		"CREATE CONSTRAINT tasks_doc_created_at_type IF NOT EXISTS FOR (t:TasksDoc) REQUIRE t.createdAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT tasks_doc_updated_at_type IF NOT EXISTS FOR (t:TasksDoc) REQUIRE t.updatedAt IS :: ZONED DATETIME",

		// TaskItem property types (see nodeToTaskItem in mapping.go).
		"CREATE CONSTRAINT task_item_id_type IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.id IS :: STRING",
		"CREATE CONSTRAINT task_item_tasks_doc_id_type IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.tasksDocId IS :: STRING",
		"CREATE CONSTRAINT task_item_item_id_type IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.itemId IS :: STRING",
		"CREATE CONSTRAINT task_item_parent_item_id_type IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.parentItemId IS :: STRING",
		"CREATE CONSTRAINT task_item_execution_order_type IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.executionOrder IS :: INTEGER",
		"CREATE CONSTRAINT task_item_title_type IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.title IS :: STRING",
		"CREATE CONSTRAINT task_item_description_type IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.description IS :: STRING",
		"CREATE CONSTRAINT task_item_suggested_agent_type IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.suggestedAgent IS :: STRING",
		"CREATE CONSTRAINT task_item_acceptance_check_type IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.acceptanceCheck IS :: STRING",
		"CREATE CONSTRAINT task_item_is_checked_type IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.isChecked IS :: BOOLEAN",
		"CREATE CONSTRAINT task_item_created_at_type IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.createdAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT task_item_updated_at_type IF NOT EXISTS FOR (t:TaskItem) REQUIRE t.updatedAt IS :: ZONED DATETIME",

		// FileTouched property types (see nodeToFileTouched in mapping.go).
		"CREATE CONSTRAINT file_touched_id_type IF NOT EXISTS FOR (f:FileTouched) REQUIRE f.id IS :: STRING",
		"CREATE CONSTRAINT file_touched_task_item_id_type IF NOT EXISTS FOR (f:FileTouched) REQUIRE f.taskItemId IS :: STRING",
		"CREATE CONSTRAINT file_touched_ordinal_type IF NOT EXISTS FOR (f:FileTouched) REQUIRE f.ordinal IS :: INTEGER",
		"CREATE CONSTRAINT file_touched_file_path_type IF NOT EXISTS FOR (f:FileTouched) REQUIRE f.filePath IS :: STRING",

		// ParallelBatch property types (see nodeToParallelBatch in mapping.go).
		"CREATE CONSTRAINT parallel_batch_id_type IF NOT EXISTS FOR (p:ParallelBatch) REQUIRE p.id IS :: STRING",
		"CREATE CONSTRAINT parallel_batch_tasks_doc_id_type IF NOT EXISTS FOR (p:ParallelBatch) REQUIRE p.tasksDocId IS :: STRING",
		"CREATE CONSTRAINT parallel_batch_label_type IF NOT EXISTS FOR (p:ParallelBatch) REQUIRE p.batchLabel IS :: STRING",
		"CREATE CONSTRAINT parallel_batch_order_type IF NOT EXISTS FOR (p:ParallelBatch) REQUIRE p.batchOrder IS :: INTEGER",

		// DefinitionOfDoneItem property types (see nodeToDefinitionOfDoneItem in mapping.go).
		"CREATE CONSTRAINT dod_item_id_type IF NOT EXISTS FOR (d:DefinitionOfDoneItem) REQUIRE d.id IS :: STRING",
		"CREATE CONSTRAINT dod_item_spec_id_type IF NOT EXISTS FOR (d:DefinitionOfDoneItem) REQUIRE d.specId IS :: STRING",
		"CREATE CONSTRAINT dod_item_ordinal_type IF NOT EXISTS FOR (d:DefinitionOfDoneItem) REQUIRE d.ordinal IS :: INTEGER",
		"CREATE CONSTRAINT dod_item_description_type IF NOT EXISTS FOR (d:DefinitionOfDoneItem) REQUIRE d.description IS :: STRING",
		"CREATE CONSTRAINT dod_item_is_checked_type IF NOT EXISTS FOR (d:DefinitionOfDoneItem) REQUIRE d.isChecked IS :: BOOLEAN",

		// Handoff property types (see domain.Handoff / nodeToHandoff in mapping.go).
		"CREATE CONSTRAINT handoff_id_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.id IS :: STRING",
		"CREATE CONSTRAINT handoff_source_workspace_id_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.sourceWorkspaceId IS :: STRING",
		"CREATE CONSTRAINT handoff_target_workspace_id_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.targetWorkspaceId IS :: STRING",
		"CREATE CONSTRAINT handoff_title_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.title IS :: STRING",
		"CREATE CONSTRAINT handoff_body_markdown_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.bodyMarkdown IS :: STRING",
		"CREATE CONSTRAINT handoff_type_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.type IS :: STRING",
		"CREATE CONSTRAINT handoff_status_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.status IS :: STRING",
		"CREATE CONSTRAINT handoff_origin_expedition_id_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.originExpeditionId IS :: STRING",
		"CREATE CONSTRAINT handoff_origin_waypoint_id_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.originWaypointId IS :: STRING",
		"CREATE CONSTRAINT handoff_origin_commit_sha_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.originCommitSha IS :: STRING",
		"CREATE CONSTRAINT handoff_origin_session_id_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.originSessionId IS :: STRING",
		"CREATE CONSTRAINT handoff_sent_by_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.sentBy IS :: STRING",
		"CREATE CONSTRAINT handoff_sent_at_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.sentAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT handoff_read_at_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.readAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT handoff_resolution_note_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.resolutionNote IS :: STRING",
		"CREATE CONSTRAINT handoff_resolved_at_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.resolvedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT handoff_resolved_by_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.resolvedBy IS :: STRING",
		"CREATE CONSTRAINT handoff_created_at_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.createdAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT handoff_updated_at_type IF NOT EXISTS FOR (h:Handoff) REQUIRE h.updatedAt IS :: ZONED DATETIME",

		// HandoffAttachment property types (see domain.HandoffAttachment /
		// nodeToHandoffAttachment in mapping.go).
		"CREATE CONSTRAINT handoff_attachment_id_type IF NOT EXISTS FOR (a:HandoffAttachment) REQUIRE a.id IS :: STRING",
		"CREATE CONSTRAINT handoff_attachment_handoff_id_type IF NOT EXISTS FOR (a:HandoffAttachment) REQUIRE a.handoffId IS :: STRING",
		"CREATE CONSTRAINT handoff_attachment_ordinal_type IF NOT EXISTS FOR (a:HandoffAttachment) REQUIRE a.ordinal IS :: INTEGER",
		"CREATE CONSTRAINT handoff_attachment_repo_path_type IF NOT EXISTS FOR (a:HandoffAttachment) REQUIRE a.repoPath IS :: STRING",
		"CREATE CONSTRAINT handoff_attachment_commit_sha_type IF NOT EXISTS FOR (a:HandoffAttachment) REQUIRE a.commitSha IS :: STRING",
		"CREATE CONSTRAINT handoff_attachment_note_type IF NOT EXISTS FOR (a:HandoffAttachment) REQUIRE a.note IS :: STRING",

		// HandoffConversation property types (see domain.HandoffConversation in
		// handoffconversation.go).
		"CREATE CONSTRAINT handoff_conversation_id_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.id IS :: STRING",
		"CREATE CONSTRAINT handoff_conversation_handoff_id_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.handoffId IS :: STRING",
		"CREATE CONSTRAINT handoff_conversation_status_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.status IS :: STRING",
		"CREATE CONSTRAINT handoff_conversation_turn_cap_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.turnCap IS :: STRING",
		"CREATE CONSTRAINT handoff_conversation_escalation_reason_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.escalationReason IS :: STRING",
		"CREATE CONSTRAINT handoff_conversation_escalated_at_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.escalatedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT handoff_conversation_closed_at_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.closedAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT handoff_conversation_drafted_action_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.draftedAction IS :: STRING",
		"CREATE CONSTRAINT handoff_conversation_drafted_resolution_note_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.draftedResolutionNote IS :: STRING",
		"CREATE CONSTRAINT handoff_conversation_drafted_at_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.draftedAt IS :: STRING",
		"CREATE CONSTRAINT handoff_conversation_arbiter_session_id_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.arbiterSessionId IS :: STRING",
		"CREATE CONSTRAINT handoff_conversation_source_root_path_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.sourceRootPath IS :: STRING",
		"CREATE CONSTRAINT handoff_conversation_target_root_path_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.targetRootPath IS :: STRING",
		"CREATE CONSTRAINT handoff_conversation_created_at_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.createdAt IS :: ZONED DATETIME",
		"CREATE CONSTRAINT handoff_conversation_updated_at_type IF NOT EXISTS FOR (c:HandoffConversation) REQUIRE c.updatedAt IS :: ZONED DATETIME",

		// HandoffTurn property types (see domain.HandoffTurn in
		// handoffconversation.go).
		"CREATE CONSTRAINT handoff_turn_id_type IF NOT EXISTS FOR (t:HandoffTurn) REQUIRE t.id IS :: STRING",
		"CREATE CONSTRAINT handoff_turn_conversation_id_type IF NOT EXISTS FOR (t:HandoffTurn) REQUIRE t.conversationId IS :: STRING",
		"CREATE CONSTRAINT handoff_turn_number_type IF NOT EXISTS FOR (t:HandoffTurn) REQUIRE t.turnNumber IS :: INTEGER",
		"CREATE CONSTRAINT handoff_turn_speaker_type IF NOT EXISTS FOR (t:HandoffTurn) REQUIRE t.speaker IS :: STRING",
		"CREATE CONSTRAINT handoff_turn_content_type IF NOT EXISTS FOR (t:HandoffTurn) REQUIRE t.content IS :: STRING",
		"CREATE CONSTRAINT handoff_turn_verdict_type IF NOT EXISTS FOR (t:HandoffTurn) REQUIRE t.verdict IS :: STRING",
		"CREATE CONSTRAINT handoff_turn_created_at_type IF NOT EXISTS FOR (t:HandoffTurn) REQUIRE t.createdAt IS :: ZONED DATETIME",

		// TaskDependencyEdge has no node of its own — it's the BLOCKS relationship
		// between two TaskItem nodes, carrying only createdAt (see AddTaskDependencyEdge
		// in taskdependencies.go). Relationship property type constraints aren't
		// declaratively supported the same way node ones are, so createdAt on
		// that edge is left to application-level validation, matching how
		// WaypointDependencyEdge's createdAt is handled today.
	}

	for _, stmt := range requiredStmts {
		if err := s.runSchemaStmt(ctx, sess, stmt); err != nil {
			return fmt.Errorf("neo4jstore: ensure schema (%s): %w", stmt, err)
		}
	}

	for _, stmt := range typeStmts {
		if err := s.runSchemaStmt(ctx, sess, stmt); err != nil {
			if isEnterpriseOnlyConstraintErr(err) {
				slog.Warn("neo4jstore: skipping property type constraint, requires Neo4j Enterprise Edition", "stmt", stmt)
				continue
			}
			return fmt.Errorf("neo4jstore: ensure schema (%s): %w", stmt, err)
		}
	}
	return nil
}

func (s *Neo4jStore) runSchemaStmt(ctx context.Context, sess neo4j.SessionWithContext, stmt string) error {
	_, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (any, error) {
		return tx.Run(ctx, stmt, nil)
	})
	return err
}

// isEnterpriseOnlyConstraintErr reports whether err is Neo4j rejecting a
// constraint that only Enterprise Edition supports (property type,
// existence, and node-key constraints all fall under this on Community).
func isEnterpriseOnlyConstraintErr(err error) bool {
	var neo4jErr *neo4j.Neo4jError
	if !errors.As(err, &neo4jErr) {
		return false
	}
	return neo4jErr.Code == "Neo.DatabaseError.Schema.ConstraintCreationFailed" &&
		strings.Contains(neo4jErr.Msg, "Enterprise Edition")
}

var _ store.Store = (*Neo4jStore)(nil)
