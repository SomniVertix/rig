package neo4jstore

import (
	"context"
	"fmt"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// AddTaskDependencyEdge records that fromTaskItemID must complete before
// toTaskItemID — additive to each component's own intra-component Order.
// Cross-component only: same-tasksDoc edges are rejected here, mirroring
// v1's reject_same_component_task_dependency_edge trigger. No cycle
// detection on insert, matching v1 — see HasTaskDependencyCycle, checked
// explicitly by finalize_stage("tasks").
func (s *Neo4jStore) AddTaskDependencyEdge(ctx context.Context, specID, fromTaskItemID, toTaskItemID string) error {
	if fromTaskItemID == toTaskItemID {
		return fmt.Errorf("neo4jstore: add task dependency edge: %w: from and to are the same task item", store.ErrConflict)
	}

	from, err := s.GetTaskItem(ctx, fromTaskItemID)
	if err != nil {
		return fmt.Errorf("neo4jstore: add task dependency edge: from: %w", err)
	}
	to, err := s.GetTaskItem(ctx, toTaskItemID)
	if err != nil {
		return fmt.Errorf("neo4jstore: add task dependency edge: to: %w", err)
	}
	if from.TasksDocID == to.TasksDocID {
		return fmt.Errorf("neo4jstore: add task dependency edge: %w: from and to belong to the same component — cross-component only", store.ErrConflict)
	}

	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	_, err = neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (any, error) {
		return tx.Run(ctx, `
			MATCH (from:TaskItem {id: $fromId}), (to:TaskItem {id: $toId})
			MERGE (from)-[r:BLOCKS]->(to)
			ON CREATE SET r.specId = $specId, r.createdAt = $now`, map[string]any{
			"fromId": fromTaskItemID, "toId": toTaskItemID, "specId": specID, "now": now,
		})
	})
	if err != nil {
		return fmt.Errorf("neo4jstore: add task dependency edge: %w", err)
	}
	return nil
}

func (s *Neo4jStore) DeleteTaskDependencyEdge(ctx context.Context, fromTaskItemID, toTaskItemID string) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	_, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (any, error) {
		return tx.Run(ctx, `
			MATCH (:TaskItem {id: $fromId})-[r:BLOCKS]->(:TaskItem {id: $toId})
			DELETE r`, map[string]any{"fromId": fromTaskItemID, "toId": toTaskItemID})
	})
	if err != nil {
		return fmt.Errorf("neo4jstore: delete task dependency edge: %w", err)
	}
	return nil
}

func (s *Neo4jStore) ListTaskDependencyEdges(ctx context.Context, specID string) ([]domain.TaskDependencyEdge, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (from:TaskItem)-[r:BLOCKS {specId: $specId}]->(to:TaskItem)
			RETURN from.id AS fromId, to.id AS toId, r.createdAt AS createdAt`, map[string]any{"specId": specID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list task dependency edges: %w", err)
	}

	edges := make([]domain.TaskDependencyEdge, 0, len(records))
	for _, rec := range records {
		edge := domain.TaskDependencyEdge{SpecID: specID}
		if v, ok := rec.Get("fromId"); ok {
			if str, ok := v.(string); ok {
				edge.FromTaskItemID = str
			}
		}
		if v, ok := rec.Get("toId"); ok {
			if str, ok := v.(string); ok {
				edge.ToTaskItemID = str
			}
		}
		if v, ok := rec.Get("createdAt"); ok {
			if t, ok := v.(time.Time); ok {
				edge.CreatedAt = t
			}
		}
		edges = append(edges, edge)
	}
	return edges, nil
}

// HasTaskDependencyCycle walks every BLOCKS edge scoped to specID looking
// for any node reachable from itself — a single variable-length match,
// simpler than v1's WITH RECURSIVE CTE. Run explicitly by
// finalize_stage("tasks"), not on every edge insert.
func (s *Neo4jStore) HasTaskDependencyCycle(ctx context.Context, specID string) (bool, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (t:TaskItem)-[:BLOCKS* {specId: $specId}]->(t)
			RETURN count(t) > 0 AS hasCycle`, map[string]any{"specId": specID})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return false, fmt.Errorf("neo4jstore: has task dependency cycle: %w", err)
	}
	v, _ := rec.Get("hasCycle")
	b, _ := v.(bool)
	return b, nil
}
