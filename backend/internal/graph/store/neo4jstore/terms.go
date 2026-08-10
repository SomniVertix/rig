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

// AddExpeditionTerm pins a piece of terminology to an expedition. Rejects a
// case-insensitive duplicate of an existing term on the same expedition —
// a term is meant to be the canonical definition for a word, not free-form
// prose like a waypoint title, so two entries for the same word would be a
// real inconsistency. Case-insensitive uniqueness can't be expressed as a
// Neo4j constraint (constraints are exact-value only), so this check is
// app/query-level only, same "belt-and-suspenders where possible, app-layer
// where not" approach the package doc describes.
func (s *Neo4jStore) AddExpeditionTerm(ctx context.Context, expeditionID, term, definition string) (*domain.ExpeditionTerm, error) {
	// App-layer existence check first: once this passes, a zero-row result
	// from the write below is unambiguously the duplicate-term case.
	if _, err := s.GetExpedition(ctx, expeditionID); err != nil {
		return nil, fmt.Errorf("neo4jstore: add expedition term: %w", err)
	}

	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	id := uuid.NewString()

	cypher := `
		MATCH (ex:Expedition {id: $expeditionId})
		OPTIONAL MATCH (ex)-[:HAS_TERM]->(existing:ExpeditionTerm)
		WHERE toLower(existing.term) = toLower($term)
		WITH ex, count(existing) AS dupes
		WHERE dupes = 0
		CREATE (t:ExpeditionTerm {
			id: $id, expeditionId: $expeditionId, term: $term, definition: $definition,
			createdAt: $now, updatedAt: $now
		})
		CREATE (ex)-[:HAS_TERM]->(t)
		RETURN t`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"expeditionId": expeditionID,
			"id":           id,
			"term":         term,
			"definition":   definition,
			"now":          now,
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
		return nil, fmt.Errorf("neo4jstore: add expedition term: %w", err)
	}
	if rec == nil {
		return nil, fmt.Errorf("neo4jstore: add expedition term: %w: a term with this name already exists on this expedition", store.ErrConflict)
	}
	return recordToExpeditionTerm(rec, "t")
}

// UpdateExpeditionTerm changes a term's definition. Only the definition is
// updatable — renaming the term itself isn't supported; add a new term and
// leave the old one if the vocabulary itself changed.
func (s *Neo4jStore) UpdateExpeditionTerm(ctx context.Context, id, definition string) (*domain.ExpeditionTerm, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (t:ExpeditionTerm {id: $id})
			SET t.definition = $definition, t.updatedAt = $now
			RETURN t`, map[string]any{"id": id, "definition": definition, "now": now})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update expedition term: %w", err)
	}
	if rec == nil {
		return nil, fmt.Errorf("neo4jstore: update expedition term: %w", store.ErrNotFound)
	}
	return recordToExpeditionTerm(rec, "t")
}

// ListExpeditionTerms returns an expedition's terms alphabetically
// (case-insensitive) — a glossary is read by scanning for a word, not in
// creation order.
func (s *Neo4jStore) ListExpeditionTerms(ctx context.Context, expeditionID string) ([]*domain.ExpeditionTerm, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:Expedition {id: $expeditionId})-[:HAS_TERM]->(t:ExpeditionTerm)
			RETURN t ORDER BY toLower(t.term)`, map[string]any{"expeditionId": expeditionID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list expedition terms: %w", err)
	}
	return recordsToExpeditionTerms(records, "t")
}

func recordToExpeditionTerm(rec *neo4j.Record, key string) (*domain.ExpeditionTerm, error) {
	n, ok := singleNode(rec, key)
	if !ok {
		return nil, fmt.Errorf("neo4jstore: no %s returned", key)
	}
	return nodeToExpeditionTerm(n)
}

func recordsToExpeditionTerms(records []*neo4j.Record, key string) ([]*domain.ExpeditionTerm, error) {
	terms := make([]*domain.ExpeditionTerm, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, key)
		if !ok {
			continue
		}
		t, err := nodeToExpeditionTerm(n)
		if err != nil {
			return nil, err
		}
		terms = append(terms, t)
	}
	return terms, nil
}
