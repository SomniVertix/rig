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

// AddOpenQuestion raises a question against specID, unifying v1's
// assumptions_open_questions/design_flags/tasks_flags into one artifact
// (spec-pipeline-graph.md decision 5). Unlike v1's flags, this always
// starts with a resolution lifecycle (resolved: false) rather than being
// purely informational.
func (s *Neo4jStore) AddOpenQuestion(ctx context.Context, params store.AddOpenQuestionParams) (*domain.OpenQuestion, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	id := uuid.NewString()
	now := time.Now().UTC()
	cypher := `
		MATCH (spec:Spec {id: $specId})
		CREATE (o:OpenQuestion {
			id: $id, specId: $specId, stage: $stage, targetId: $targetId,
			description: $description, raisedAt: $now,
			resolved: false, resolvedAt: NULL, resolvedBy: NULL, resolvedReason: NULL
		})
		CREATE (spec)-[:HAS_OPEN_QUESTION]->(o)
		RETURN o`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"specId": params.SpecID, "id": id, "stage": string(params.Stage),
			"targetId": derefStr(params.TargetID), "description": params.Description, "now": now,
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add open question: %w", err)
	}
	n, ok := singleNode(rec, "o")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: add open question: spec %s not found", params.SpecID)
	}
	return nodeToOpenQuestion(n)
}

func (s *Neo4jStore) UpdateOpenQuestion(ctx context.Context, id, description string) (*domain.OpenQuestion, error) {
	n, err := s.setNodeFields(ctx, "OpenQuestion", "o", id, map[string]any{"description": description})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update open question: %w", err)
	}
	return nodeToOpenQuestion(n)
}

// ResolveOpenQuestion marks a question resolved — never deletes it,
// mirroring ResolveWaypointFlag. An already-resolved question is a
// conflict, keeping the same "no silent no-op" discipline used elsewhere.
func (s *Neo4jStore) ResolveOpenQuestion(ctx context.Context, id string, params store.ResolveOpenQuestionParams) (*domain.OpenQuestion, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (o:OpenQuestion {id: $id})
			WHERE o.resolved = false
			SET o.resolved = true, o.resolvedAt = $now, o.resolvedBy = $resolvedBy, o.resolvedReason = $resolvedReason
			RETURN o`, map[string]any{
			"id": id, "now": now, "resolvedBy": params.ResolvedBy, "resolvedReason": params.ResolvedReason,
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
		return nil, fmt.Errorf("neo4jstore: resolve open question: %w", err)
	}
	if rec == nil {
		if _, err := s.getNodeByID(ctx, "OpenQuestion", "o", id); err != nil {
			return nil, fmt.Errorf("neo4jstore: resolve open question: %w", err)
		}
		return nil, fmt.Errorf("neo4jstore: resolve open question: %w: already resolved", store.ErrConflict)
	}
	n, ok := singleNode(rec, "o")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToOpenQuestion(n)
}

func (s *Neo4jStore) DeleteOpenQuestion(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "OpenQuestion", id)
}

func (s *Neo4jStore) ListOpenQuestions(ctx context.Context, specID string) ([]*domain.OpenQuestion, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:Spec {id: $specId})-[:HAS_OPEN_QUESTION]->(o:OpenQuestion)
			RETURN o ORDER BY o.raisedAt`, map[string]any{"specId": specID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list open questions: %w", err)
	}
	return recordsToOpenQuestions(records)
}

// ListUnresolvedOpenQuestions scopes to one stage — the gate finalize_stage
// and approve both check before proceeding (decision 6: unresolved open
// questions block both).
func (s *Neo4jStore) ListUnresolvedOpenQuestions(ctx context.Context, specID string, stage domain.SpecStage) ([]*domain.OpenQuestion, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:Spec {id: $specId})-[:HAS_OPEN_QUESTION]->(o:OpenQuestion)
			WHERE o.stage = $stage AND o.resolved = false
			RETURN o ORDER BY o.raisedAt`, map[string]any{"specId": specID, "stage": string(stage)})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list unresolved open questions: %w", err)
	}
	return recordsToOpenQuestions(records)
}

func recordsToOpenQuestions(records []*neo4j.Record) ([]*domain.OpenQuestion, error) {
	out := make([]*domain.OpenQuestion, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "o")
		if !ok {
			continue
		}
		q, err := nodeToOpenQuestion(n)
		if err != nil {
			return nil, err
		}
		out = append(out, q)
	}
	return out, nil
}
