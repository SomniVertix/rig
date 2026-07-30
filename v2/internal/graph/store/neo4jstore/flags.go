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

// FlagWaypoint raises a non-mutating marker on targetWaypointID. Unlike
// AddWaypointDependency, this deliberately has no same-expedition
// requirement — it's the one place in the schema where two waypoints in
// different expeditions reference each other, since the whole point is
// letting a live decision flag a waypoint sitting in a different (possibly
// already-completed) expedition without forcing a reopen. Don't "fix" this
// by adding a same-expedition guard by reflex.
func (s *Neo4jStore) FlagWaypoint(ctx context.Context, targetWaypointID string, params store.FlagWaypointParams) (*domain.WaypointFlag, error) {
	// App-layer existence checks first, mirroring AddWaypointDependency —
	// avoids a silent no-op CREATE against a missing node.
	if _, err := s.GetWaypoint(ctx, targetWaypointID); err != nil {
		return nil, fmt.Errorf("neo4jstore: flag waypoint: target: %w", err)
	}
	if params.SourceWaypointID != nil {
		if _, err := s.GetWaypoint(ctx, *params.SourceWaypointID); err != nil {
			return nil, fmt.Errorf("neo4jstore: flag waypoint: source: %w", err)
		}
	}

	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	id := uuid.NewString()

	cypher := `
		MATCH (target:Waypoint {id: $targetWaypointId})
		OPTIONAL MATCH (source:Waypoint {id: $sourceWaypointId})
		CREATE (f:WaypointFlag {
			id: $id, targetWaypointId: $targetWaypointId, sourceWaypointId: $sourceWaypointId,
			note: $note, raisedAt: $now, resolved: false, resolvedAt: NULL, resolvedReason: NULL
		})
		CREATE (f)-[:FLAGS]->(target)
		FOREACH (_ IN CASE WHEN source IS NOT NULL THEN [1] ELSE [] END |
			CREATE (source)-[:RAISED]->(f)
		)
		RETURN f`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"targetWaypointId": targetWaypointID,
			"sourceWaypointId": derefStr(params.SourceWaypointID),
			"id":               id,
			"note":             params.Note,
			"now":              now,
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: flag waypoint: %w", err)
	}
	return recordToWaypointFlag(rec, "f")
}

// ResolveWaypointFlag marks a flag resolved — never deletes it. An
// already-resolved flag is a conflict, matching the codebase's existing
// guarded-mutation convention (idempotent success would be a defensible
// alternative, but this keeps the same "no silent no-op" discipline as
// ClaimWaypoint/UnbypassWaypoint).
func (s *Neo4jStore) ResolveWaypointFlag(ctx context.Context, flagID, reason string) (*domain.WaypointFlag, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (f:WaypointFlag {id: $id})
			WHERE f.resolved = false
			SET f.resolved = true, f.resolvedAt = $now, f.resolvedReason = $reason
			RETURN f`, map[string]any{"id": flagID, "now": now, "reason": reason})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: resolve waypoint flag: %w", err)
	}
	if rec == nil {
		if _, err := s.getFlagByID(ctx, flagID); err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("neo4jstore: resolve waypoint flag: %w: flag already resolved", store.ErrConflict)
	}
	return recordToWaypointFlag(rec, "f")
}

func (s *Neo4jStore) getFlagByID(ctx context.Context, flagID string) (*domain.WaypointFlag, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, "MATCH (f:WaypointFlag {id: $id}) RETURN f", map[string]any{"id": flagID})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: get flag: %w", err)
	}
	if rec == nil {
		return nil, store.ErrNotFound
	}
	return recordToWaypointFlag(rec, "f")
}

// ListWaypointFlags returns every flag touching waypointID, both as target
// and as source, resolved and unresolved — the get_waypoint zoom-in.
func (s *Neo4jStore) ListWaypointFlags(ctx context.Context, waypointID string) ([]*domain.WaypointFlag, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	cypher := `
		MATCH (f:WaypointFlag)-[:FLAGS]->(:Waypoint {id: $waypointId})
		RETURN f
		UNION
		MATCH (:Waypoint {id: $waypointId})-[:RAISED]->(f:WaypointFlag)
		RETURN f`

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{"waypointId": waypointID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list waypoint flags: %w", err)
	}
	return recordsToWaypointFlags(records, "f")
}

// ListUnresolvedFlagsForExpedition returns every unresolved flag targeting
// any of expeditionID's waypoints — incoming only, for get_expedition's
// flags bucket. Traverses from the already-uniquely-indexed Expedition node
// through HAS_WAYPOINT then reverse-FLAGS, the same shape every other
// per-expedition waypoint query uses — no new index required for this path.
func (s *Neo4jStore) ListUnresolvedFlagsForExpedition(ctx context.Context, expeditionID string) ([]*domain.WaypointFlag, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	cypher := `
		MATCH (:Expedition {id: $expeditionId})-[:HAS_WAYPOINT]->(:Waypoint)<-[:FLAGS]-(f:WaypointFlag)
		WHERE f.resolved = false
		RETURN f`

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{"expeditionId": expeditionID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list unresolved flags for expedition: %w", err)
	}
	return recordsToWaypointFlags(records, "f")
}

func recordToWaypointFlag(rec *neo4j.Record, key string) (*domain.WaypointFlag, error) {
	n, ok := singleNode(rec, key)
	if !ok {
		return nil, fmt.Errorf("neo4jstore: no %s returned", key)
	}
	return nodeToWaypointFlag(n)
}

func recordsToWaypointFlags(records []*neo4j.Record, key string) ([]*domain.WaypointFlag, error) {
	flags := make([]*domain.WaypointFlag, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, key)
		if !ok {
			continue
		}
		f, err := nodeToWaypointFlag(n)
		if err != nil {
			return nil, err
		}
		flags = append(flags, f)
	}
	return flags, nil
}
