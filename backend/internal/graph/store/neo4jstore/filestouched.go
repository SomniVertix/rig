package neo4jstore

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// maxFilesTouchedPerTaskItem is spec-pipeline-graph.md decision 14's hard
// cap — a structural signal that a task touching more files should be
// split rather than a rule enforced by drafter discipline alone.
const maxFilesTouchedPerTaskItem = 5

// AddFileTouched rejects a 6th entry for the same task item.
func (s *Neo4jStore) AddFileTouched(ctx context.Context, params store.AddFileTouchedParams) (*domain.FileTouched, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	id := uuid.NewString()
	cypher := `
		MATCH (item:TaskItem {id: $taskItemId})
		OPTIONAL MATCH (item)-[:HAS_FILE_TOUCHED]->(existing:FileTouched)
		WITH item, count(existing) AS existingCount, coalesce(max(existing.ordinal), 0) + 1 AS nextOrdinal
		WHERE existingCount < $maxFiles
		CREATE (f:FileTouched {id: $id, taskItemId: $taskItemId, ordinal: nextOrdinal, filePath: $filePath})
		CREATE (item)-[:HAS_FILE_TOUCHED]->(f)
		RETURN f`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"taskItemId": params.TaskItemID, "id": id, "filePath": params.FilePath, "maxFiles": maxFilesTouchedPerTaskItem,
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
		return nil, fmt.Errorf("neo4jstore: add file touched: %w", err)
	}
	if rec == nil {
		if _, err := s.GetTaskItem(ctx, params.TaskItemID); err != nil {
			return nil, fmt.Errorf("neo4jstore: add file touched: %w", err)
		}
		return nil, fmt.Errorf("neo4jstore: add file touched: %w: task item already has %d files touched (max)", store.ErrConflict, maxFilesTouchedPerTaskItem)
	}
	n, ok := singleNode(rec, "f")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToFileTouched(n)
}

func (s *Neo4jStore) DeleteFileTouched(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "FileTouched", id)
}

func (s *Neo4jStore) ListFilesTouched(ctx context.Context, taskItemID string) ([]*domain.FileTouched, error) {
	nodes, err := s.listOrdinalChildren(ctx, "TaskItem", taskItemID, "HAS_FILE_TOUCHED", "FileTouched", "f")
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list files touched: %w", err)
	}
	out := make([]*domain.FileTouched, 0, len(nodes))
	for _, n := range nodes {
		f, err := nodeToFileTouched(n)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, nil
}
