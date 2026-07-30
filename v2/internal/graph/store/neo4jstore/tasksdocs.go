package neo4jstore

import (
	"context"
	"fmt"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

func (s *Neo4jStore) ListTasksDocs(ctx context.Context, specID string) ([]*domain.TasksDoc, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:Spec {id: $specId})-[:HAS_COMPONENT]->(:DesignComponent)-[:HAS_TASKS_DOC]->(t:TasksDoc)
			RETURN t ORDER BY t.componentSlug`, map[string]any{"specId": specID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list tasks docs: %w", err)
	}
	return recordsToTasksDocs(records)
}

func (s *Neo4jStore) GetTasksDoc(ctx context.Context, id string) (*domain.TasksDoc, error) {
	n, err := s.getNodeByID(ctx, "TasksDoc", "t", id)
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: get tasks doc: %w", err)
	}
	return nodeToTasksDoc(n)
}

func (s *Neo4jStore) GetTasksDocByComponent(ctx context.Context, designComponentID string) (*domain.TasksDoc, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:DesignComponent {id: $designComponentId})-[:HAS_TASKS_DOC]->(t:TasksDoc)
			RETURN t`, map[string]any{"designComponentId": designComponentID})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: get tasks doc by component: %w", err)
	}
	if rec == nil {
		return nil, store.ErrNotFound
	}
	n, ok := singleNode(rec, "t")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToTasksDoc(n)
}

// ListOrphanedTasksDocs returns every TasksDoc under specID whose
// DesignComponent no longer exists (removed in a design redraft). Per
// spec-pipeline-graph.md decision 10, ANY orphaned doc blocks design's
// finalize_stage — unlike v1, there is no silent-delete-if-empty path here
// at all; the service layer checks this list and rejects if non-empty.
func (s *Neo4jStore) ListOrphanedTasksDocs(ctx context.Context, specID string) ([]*domain.TasksDoc, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (t:TasksDoc {specId: $specId})
			WHERE NOT EXISTS { (:DesignComponent)-[:HAS_TASKS_DOC]->(t) }
			RETURN t`, map[string]any{"specId": specID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list orphaned tasks docs: %w", err)
	}
	return recordsToTasksDocs(records)
}

func recordsToTasksDocs(records []*neo4j.Record) ([]*domain.TasksDoc, error) {
	out := make([]*domain.TasksDoc, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "t")
		if !ok {
			continue
		}
		doc, err := nodeToTasksDoc(n)
		if err != nil {
			return nil, err
		}
		out = append(out, doc)
	}
	return out, nil
}

// --- Tasks stage transitions ---------------------------------------------
//
// Unlike requirements/design, tasks has no spec-wide stored status — each
// TasksDoc (one per component) has its own independent lifecycle, exactly
// like v1. finalize/approve/deny operate per-doc; DeriveTasksStageStatus
// computes the spec-wide aggregate live, mirroring v1's
// deriveTasksAggregateStatus (SpecRepository).

func (s *Neo4jStore) FinalizeTasksStage(ctx context.Context, tasksDocID string) (*domain.TasksDoc, error) {
	return s.transitionTasksDocStage(ctx, tasksDocID, domain.SpecStageNotStarted, domain.SpecStageInReview, nil, nil)
}

func (s *Neo4jStore) ApproveTasksStage(ctx context.Context, tasksDocID string) (*domain.TasksDoc, error) {
	return s.transitionTasksDocStage(ctx, tasksDocID, domain.SpecStageInReview, domain.SpecStageApproved, nil, nil)
}

func (s *Neo4jStore) DenyTasksStage(ctx context.Context, tasksDocID, reason string) (*domain.TasksDoc, error) {
	return s.transitionTasksDocStage(ctx, tasksDocID, domain.SpecStageInReview, domain.SpecStageNotStarted, &reason, boolPtr(true))
}

func (s *Neo4jStore) transitionTasksDocStage(ctx context.Context, tasksDocID string, from, to domain.SpecStageStatus, reason *string, denied *bool) (*domain.TasksDoc, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	var deniedAt any
	var reasonVal any
	if denied != nil && *denied {
		deniedAt = now
		if reason != nil {
			reasonVal = *reason
		}
	}

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (t:TasksDoc {id: $id})
			WHERE t.status = $from
			SET t.status = $to, t.deniedAt = $deniedAt, t.lastDenialReason = $reasonVal, t.updatedAt = $now
			RETURN t`, map[string]any{
			"id": tasksDocID, "from": string(from), "to": string(to),
			"deniedAt": deniedAt, "reasonVal": reasonVal, "now": now,
		})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: transition tasks doc stage: %w", err)
	}
	if rec == nil {
		if _, err := s.GetTasksDoc(ctx, tasksDocID); err != nil {
			return nil, fmt.Errorf("neo4jstore: transition tasks doc stage: %w", err)
		}
		return nil, fmt.Errorf("neo4jstore: transition tasks doc stage: %w: not in %q status", store.ErrConflict, from)
	}
	n, ok := singleNode(rec, "t")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToTasksDoc(n)
}

// DeriveTasksStageStatus mirrors v1's deriveTasksAggregateStatus exactly:
// not_started if there are no docs yet or every doc is still not_started;
// approved only once every doc is approved; in_review otherwise.
func (s *Neo4jStore) DeriveTasksStageStatus(ctx context.Context, specID string) (domain.SpecStageStatus, error) {
	docs, err := s.ListTasksDocs(ctx, specID)
	if err != nil {
		return "", fmt.Errorf("neo4jstore: derive tasks stage status: %w", err)
	}
	if len(docs) == 0 {
		return domain.SpecStageNotStarted, nil
	}
	allNotStarted := true
	allApproved := true
	for _, d := range docs {
		if d.Status != domain.SpecStageNotStarted {
			allNotStarted = false
		}
		if d.Status != domain.SpecStageApproved {
			allApproved = false
		}
	}
	switch {
	case allNotStarted:
		return domain.SpecStageNotStarted, nil
	case allApproved:
		return domain.SpecStageApproved, nil
	default:
		return domain.SpecStageInReview, nil
	}
}
