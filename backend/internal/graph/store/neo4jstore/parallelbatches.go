package neo4jstore

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

func (s *Neo4jStore) AddParallelBatch(ctx context.Context, params store.AddParallelBatchParams) (*domain.ParallelBatch, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	id := uuid.NewString()
	cypher := `
		MATCH (doc:TasksDoc {id: $tasksDocId})
		OPTIONAL MATCH (doc)-[:HAS_BATCH]->(existing:ParallelBatch)
		WITH doc, coalesce(max(existing.batchOrder), 0) + 1 AS nextOrder
		CREATE (p:ParallelBatch {id: $id, tasksDocId: $tasksDocId, batchLabel: $batchLabel, batchOrder: nextOrder})
		CREATE (doc)-[:HAS_BATCH]->(p)
		RETURN p`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"tasksDocId": params.TasksDocID, "id": id, "batchLabel": params.BatchLabel,
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add parallel batch: %w", err)
	}
	n, ok := singleNode(rec, "p")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: add parallel batch: tasks doc %s not found", params.TasksDocID)
	}
	return nodeToParallelBatch(n)
}

func (s *Neo4jStore) ListParallelBatches(ctx context.Context, tasksDocID string) ([]*domain.ParallelBatch, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:TasksDoc {id: $tasksDocId})-[:HAS_BATCH]->(p:ParallelBatch)
			RETURN p ORDER BY p.batchOrder`, map[string]any{"tasksDocId": tasksDocID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list parallel batches: %w", err)
	}
	out := make([]*domain.ParallelBatch, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "p")
		if !ok {
			continue
		}
		b, err := nodeToParallelBatch(n)
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, nil
}

func (s *Neo4jStore) DeleteParallelBatch(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "ParallelBatch", id)
}

// AddParallelBatchMember links an existing TaskItem into a batch — a pure
// HAS_MEMBER relationship, no separate node type (unlike v1's
// parallel_batch_members table, which had no properties beyond the two
// foreign keys it joined).
func (s *Neo4jStore) AddParallelBatchMember(ctx context.Context, batchID, taskItemID string) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	_, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (any, error) {
		return tx.Run(ctx, `
			MATCH (b:ParallelBatch {id: $batchId}), (item:TaskItem {id: $taskItemId})
			MERGE (b)-[:HAS_MEMBER]->(item)`, map[string]any{"batchId": batchID, "taskItemId": taskItemID})
	})
	if err != nil {
		return fmt.Errorf("neo4jstore: add parallel batch member: %w", err)
	}
	return nil
}

func (s *Neo4jStore) RemoveParallelBatchMember(ctx context.Context, batchID, taskItemID string) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	_, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (any, error) {
		return tx.Run(ctx, `
			MATCH (:ParallelBatch {id: $batchId})-[r:HAS_MEMBER]->(:TaskItem {id: $taskItemId})
			DELETE r`, map[string]any{"batchId": batchID, "taskItemId": taskItemID})
	})
	if err != nil {
		return fmt.Errorf("neo4jstore: remove parallel batch member: %w", err)
	}
	return nil
}

func (s *Neo4jStore) ListParallelBatchMembers(ctx context.Context, batchID string) ([]*domain.TaskItem, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:ParallelBatch {id: $batchId})-[:HAS_MEMBER]->(item:TaskItem)
			RETURN item ORDER BY item.executionOrder`, map[string]any{"batchId": batchID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list parallel batch members: %w", err)
	}
	out := make([]*domain.TaskItem, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "item")
		if !ok {
			continue
		}
		item, err := nodeToTaskItem(n)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, nil
}
