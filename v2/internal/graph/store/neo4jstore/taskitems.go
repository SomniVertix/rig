package neo4jstore

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// AddTaskItem enforces, at insert time rather than deferred to finalize:
//   - the 2-level hierarchy cap (spec-pipeline-graph.md decision 12): a
//     subtask's declared parent must itself be top-level;
//   - the SATISFIES requirement (decision 13): a top-level item needs at
//     least one target AcceptanceCriterion id; a subtask's is optional.
//
// itemId/executionOrder are derived from call order — never caller-
// supplied — matching v1's "the sequence you call this in is the Order
// section" rule (see tasks-drafter.md).
func (s *Neo4jStore) AddTaskItem(ctx context.Context, params store.AddTaskItemParams) (*domain.TaskItem, error) {
	if params.ParentItemID != nil {
		parent, err := s.GetTaskItem(ctx, *params.ParentItemID)
		if err != nil {
			return nil, fmt.Errorf("neo4jstore: add task item: parent: %w", err)
		}
		if parent.ParentItemID != nil {
			return nil, fmt.Errorf("neo4jstore: add task item: %w: parent %s is already a subtask — max 2-level hierarchy", store.ErrConflict, *params.ParentItemID)
		}
		if parent.TasksDocID != params.TasksDocID {
			return nil, fmt.Errorf("neo4jstore: add task item: %w: parent belongs to a different tasks doc", store.ErrConflict)
		}
	} else if len(params.SatisfiesCriterionIDs) == 0 {
		return nil, fmt.Errorf("neo4jstore: add task item: %w: a top-level task item requires at least one SATISFIES acceptance criterion", store.ErrConflict)
	}

	for _, critID := range params.SatisfiesCriterionIDs {
		if _, err := s.GetAcceptanceCriterion(ctx, critID); err != nil {
			return nil, fmt.Errorf("neo4jstore: add task item: acceptance criterion %s: %w", critID, err)
		}
	}

	suggestedAgent := params.SuggestedAgent
	if suggestedAgent == "" {
		suggestedAgent = "none"
	}

	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	id := uuid.NewString()
	args := map[string]any{
		"tasksDocId": params.TasksDocID, "id": id, "title": params.Title,
		"description": params.Description, "suggestedAgent": suggestedAgent,
		"acceptanceCheck": params.AcceptanceCheck, "now": now,
		"criterionIds": params.SatisfiesCriterionIDs,
	}

	var cypher string
	if params.ParentItemID == nil {
		cypher = `
			MATCH (doc:TasksDoc {id: $tasksDocId})
			OPTIONAL MATCH (topLevel:TaskItem {tasksDocId: $tasksDocId})
			WHERE topLevel.parentItemId IS NULL
			WITH doc, count(topLevel) AS topLevelCount
			OPTIONAL MATCH (any:TaskItem {tasksDocId: $tasksDocId})
			WITH doc, topLevelCount, coalesce(max(any.executionOrder), 0) + 1 AS nextOrder
			CREATE (item:TaskItem {
				id: $id, tasksDocId: $tasksDocId, itemId: toString(topLevelCount + 1),
				parentItemId: NULL, executionOrder: nextOrder,
				title: $title, description: $description, suggestedAgent: $suggestedAgent,
				acceptanceCheck: $acceptanceCheck, isChecked: false, createdAt: $now, updatedAt: $now
			})
			CREATE (doc)-[:HAS_TASK_ITEM]->(item)
			WITH item
			UNWIND $criterionIds AS critId
			MATCH (crit:AcceptanceCriterion {id: critId})
			CREATE (item)-[:SATISFIES]->(crit)
			RETURN DISTINCT item`
	} else {
		args["parentItemId"] = *params.ParentItemID
		// criterionIds may legitimately be empty for a subtask — UNWIND of
		// an empty list yields zero rows, which would silently drop the
		// already-created item from the result set too, so a null
		// placeholder guarantees at least one pass-through row.
		cypher = `
			MATCH (doc:TasksDoc {id: $tasksDocId})
			MATCH (parent:TaskItem {id: $parentItemId})
			OPTIONAL MATCH (sibling:TaskItem {parentItemId: $parentItemId})
			WITH doc, parent, count(sibling) AS siblingCount
			OPTIONAL MATCH (any:TaskItem {tasksDocId: $tasksDocId})
			WITH doc, parent, siblingCount, coalesce(max(any.executionOrder), 0) + 1 AS nextOrder
			CREATE (item:TaskItem {
				id: $id, tasksDocId: $tasksDocId, itemId: parent.itemId + "." + toString(siblingCount + 1),
				parentItemId: parent.id, executionOrder: nextOrder,
				title: $title, description: $description, suggestedAgent: $suggestedAgent,
				acceptanceCheck: $acceptanceCheck, isChecked: false, createdAt: $now, updatedAt: $now
			})
			CREATE (parent)-[:HAS_SUBTASK]->(item)
			WITH item
			UNWIND (CASE WHEN size($criterionIds) = 0 THEN [NULL] ELSE $criterionIds END) AS critId
			OPTIONAL MATCH (crit:AcceptanceCriterion {id: critId})
			FOREACH (_ IN CASE WHEN crit IS NOT NULL THEN [1] ELSE [] END | CREATE (item)-[:SATISFIES]->(crit))
			RETURN DISTINCT item`
	}

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, args)
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add task item: %w", err)
	}
	n, ok := singleNode(rec, "item")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: add task item: tasks doc %s not found", params.TasksDocID)
	}
	return nodeToTaskItem(n)
}

func (s *Neo4jStore) GetTaskItem(ctx context.Context, id string) (*domain.TaskItem, error) {
	n, err := s.getNodeByID(ctx, "TaskItem", "item", id)
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: get task item: %w", err)
	}
	return nodeToTaskItem(n)
}

func (s *Neo4jStore) ListTaskItems(ctx context.Context, tasksDocID string) ([]*domain.TaskItem, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (item:TaskItem {tasksDocId: $tasksDocId})
			RETURN item ORDER BY item.executionOrder`, map[string]any{"tasksDocId": tasksDocID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list task items: %w", err)
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

func (s *Neo4jStore) UpdateTaskItem(ctx context.Context, id string, params store.UpdateTaskItemParams) (*domain.TaskItem, error) {
	sets := map[string]any{"updatedAt": time.Now().UTC()}
	if params.Title != nil {
		sets["title"] = *params.Title
	}
	if params.Description != nil {
		sets["description"] = *params.Description
	}
	if params.SuggestedAgent != nil {
		sets["suggestedAgent"] = *params.SuggestedAgent
	}
	if params.AcceptanceCheck != nil {
		sets["acceptanceCheck"] = *params.AcceptanceCheck
	}
	if params.IsChecked != nil {
		sets["isChecked"] = *params.IsChecked
	}
	n, err := s.setNodeFields(ctx, "TaskItem", "item", id, sets)
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update task item: %w", err)
	}
	return nodeToTaskItem(n)
}

// DeleteTaskItem cascades to a top-level item's direct subtasks — the only
// possible depth given the 2-level cap — mirroring v1's parent_item_id ON
// DELETE CASCADE.
func (s *Neo4jStore) DeleteTaskItem(ctx context.Context, id string) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (t:TaskItem {id: $id})
			OPTIONAL MATCH (t)-[:HAS_SUBTASK]->(child:TaskItem)
			WITH t, collect(child) AS children
			FOREACH (c IN children | DETACH DELETE c)
			DETACH DELETE t
			RETURN count(t) AS deleted`, map[string]any{"id": id})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return fmt.Errorf("neo4jstore: delete task item: %w", err)
	}
	deleted, _ := rec.Get("deleted")
	if n, ok := deleted.(int64); !ok || n == 0 {
		return store.ErrNotFound
	}
	return nil
}

func (s *Neo4jStore) ListSatisfiedCriteria(ctx context.Context, taskItemID string) ([]*domain.AcceptanceCriterion, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:TaskItem {id: $taskItemId})-[:SATISFIES]->(c:AcceptanceCriterion)
			RETURN c ORDER BY c.criterionNumber`, map[string]any{"taskItemId": taskItemID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list satisfied criteria: %w", err)
	}
	out := make([]*domain.AcceptanceCriterion, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "c")
		if !ok {
			continue
		}
		c, err := nodeToAcceptanceCriterion(n)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}
