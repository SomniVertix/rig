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

func (s *Neo4jStore) CreateExpedition(ctx context.Context, params store.CreateExpeditionParams) (*domain.Expedition, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	id := uuid.NewString()

	cypher := `
		CREATE (e:Expedition {
			id: $id, workspaceId: $workspaceId, slug: $slug, title: $title,
			briefingPrompt: $briefingPrompt, destination: $destination,
			notes: $notes, status: $status, sessionId: $sessionId,
			createdAt: $createdAt, updatedAt: $updatedAt
		})
		WITH e
		OPTIONAL MATCH (sess:Session {id: $sessionId})
		FOREACH (_ IN CASE WHEN sess IS NOT NULL THEN [1] ELSE [] END |
			CREATE (sess)-[:CHARTERED]->(e)
		)
		RETURN e`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"id":             id,
			"workspaceId":      params.WorkspaceID,
			"slug":           params.Slug,
			"title":          params.Title,
			"briefingPrompt": params.BriefingPrompt,
			"destination":    derefStr(params.Destination),
			"notes":          derefStr(params.Notes),
			"status":         string(domain.ExpeditionStatusActive),
			"sessionId":      derefStr(params.SessionID),
			"createdAt":      now,
			"updatedAt":      now,
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: create expedition: %w", err)
	}

	n, ok := singleNode(rec, "e")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: create expedition: no node returned")
	}
	return nodeToExpedition(n)
}

func (s *Neo4jStore) GetExpedition(ctx context.Context, id string) (*domain.Expedition, error) {
	return s.getExpeditionBy(ctx, "id", id)
}

func (s *Neo4jStore) GetExpeditionBySpec(ctx context.Context, specID string) (*domain.Expedition, error) {
	return s.getExpeditionBy(ctx, "outcomeSpecId", specID)
}

func (s *Neo4jStore) getExpeditionBy(ctx context.Context, prop, value string) (*domain.Expedition, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	cypher := fmt.Sprintf("MATCH (e:Expedition {%s: $value}) RETURN e", prop)
	rec, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{"value": value})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: get expedition: %w", err)
	}
	if rec == nil {
		return nil, store.ErrNotFound
	}
	n, ok := singleNode(rec, "e")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToExpedition(n)
}

func (s *Neo4jStore) ListExpeditions(ctx context.Context, params store.ListExpeditionsParams) ([]*domain.Expedition, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	cypher := "MATCH (e:Expedition {workspaceId: $workspaceId}) "
	qparams := map[string]any{"workspaceId": params.WorkspaceID}
	if params.Status != nil {
		cypher += "WHERE e.status = $status "
		qparams["status"] = string(*params.Status)
	}
	cypher += "RETURN e ORDER BY e.createdAt DESC"

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, qparams)
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list expeditions: %w", err)
	}

	expeditions := make([]*domain.Expedition, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "e")
		if !ok {
			continue
		}
		ex, err := nodeToExpedition(n)
		if err != nil {
			return nil, err
		}
		expeditions = append(expeditions, ex)
	}
	return expeditions, nil
}

func (s *Neo4jStore) UpdateExpedition(ctx context.Context, id string, params store.UpdateExpeditionParams) (*domain.Expedition, error) {
	sets := map[string]any{"updatedAt": time.Now().UTC()}
	if params.Title != nil {
		sets["title"] = *params.Title
	}
	if params.Destination != nil {
		sets["destination"] = *params.Destination
	}
	if params.Notes != nil {
		sets["notes"] = *params.Notes
	}
	return s.updateExpeditionFields(ctx, id, sets)
}

func (s *Neo4jStore) CompleteExpedition(ctx context.Context, id string, params store.CompleteExpeditionParams) (*domain.Expedition, error) {
	sets := map[string]any{
		"status":      string(domain.ExpeditionStatusComplete),
		"outcomeKind": string(params.OutcomeKind),
		"updatedAt":   time.Now().UTC(),
	}
	if params.OutcomeSpecID != nil {
		sets["outcomeSpecId"] = *params.OutcomeSpecID
	}
	if params.OutcomeSummary != nil {
		sets["outcomeSummary"] = *params.OutcomeSummary
	}
	return s.updateExpeditionFields(ctx, id, sets)
}

func (s *Neo4jStore) AbandonExpedition(ctx context.Context, id string) (*domain.Expedition, error) {
	return s.updateExpeditionFields(ctx, id, map[string]any{
		"status":    string(domain.ExpeditionStatusAbandoned),
		"updatedAt": time.Now().UTC(),
	})
}

func (s *Neo4jStore) ReopenExpedition(ctx context.Context, id, reason string) (*domain.Expedition, error) {
	// outcome_kind / outcome_spec_id deliberately survive reopen, mirroring
	// v1's trails_outcome_only_when_complete constraint removal: they record
	// the expedition's most recent completion even while status is active
	// again. outcomeSummary clears — it described that completion's
	// specifics, which this reopen now supersedes; reopenReason records why.
	return s.updateExpeditionFields(ctx, id, map[string]any{
		"status":         string(domain.ExpeditionStatusActive),
		"outcomeSummary": nil,
		"reopenReason":   reason,
		"updatedAt":      time.Now().UTC(),
	})
}

func (s *Neo4jStore) updateExpeditionFields(ctx context.Context, id string, sets map[string]any) (*domain.Expedition, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, "MATCH (e:Expedition {id: $id}) SET e += $sets RETURN e", map[string]any{
			"id":   id,
			"sets": sets,
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
		return nil, fmt.Errorf("neo4jstore: update expedition: %w", err)
	}
	if rec == nil {
		return nil, store.ErrNotFound
	}
	n, ok := singleNode(rec, "e")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToExpedition(n)
}

func derefStr(s *string) any {
	if s == nil {
		return nil
	}
	return *s
}
