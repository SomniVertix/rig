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

// RehydrateWaypoint redoes a reached or bypassed waypoint's decision: it
// snapshots the waypoint's current terminal fields into a new, append-only
// WaypointHistoryEntry (nothing is ever deleted), then moves the waypoint to
// rehydrating — workable again exactly like marked. Unlike every other
// waypoint mutator, this one also gates on the owning Expedition's status:
// rehydrating only ever happens within an active expedition, so reopening
// one (reopen_expedition) is always a separate, deliberate step rather than
// an implicit side effect of this call. The live resolution/resolutionGist/
// rationale/bypassReason fields are deliberately left in place, not
// cleared — the last-known answer stays visible while the redo is pending;
// ReachWaypoint/BypassWaypoint clean up the opposite-path fields once the
// redo actually lands (see waypoints.go).
func (s *Neo4jStore) RehydrateWaypoint(ctx context.Context, id, reason string) (*domain.Waypoint, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	historyID := uuid.NewString()

	cypher := `
		MATCH (w:Waypoint {id: $id})
		MATCH (ex:Expedition {id: w.expeditionId})
		WHERE w.status IN [$reached, $bypassed]
		  AND ex.status = $active
		OPTIONAL MATCH (w)-[:HAD_STATE]->(existing:WaypointHistoryEntry)
		WITH w, w.status AS sourceStatus, coalesce(max(existing.ordinal), 0) + 1 AS nextOrdinal
		CREATE (h:WaypointHistoryEntry {
			id: $historyId, waypointId: w.id, ordinal: nextOrdinal,
			sourceStatus: sourceStatus,
			resolution: w.resolution, resolutionGist: w.resolutionGist, rationale: w.rationale,
			reachedIn: w.reachedIn, reachedAt: w.reachedAt, bypassReason: w.bypassReason,
			reason: $reason, supersededAt: $now, createdAt: $now
		})
		CREATE (w)-[:HAD_STATE]->(h)
		SET w.status = $rehydrating, w.updatedAt = $now
		RETURN w`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"id":          id,
			"historyId":   historyID,
			"reached":     string(domain.WaypointReached),
			"bypassed":    string(domain.WaypointBypassed),
			"active":      string(domain.ExpeditionStatusActive),
			"rehydrating": string(domain.WaypointRehydrating),
			"reason":      reason,
			"now":         now,
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
		return nil, fmt.Errorf("neo4jstore: rehydrate waypoint: %w", err)
	}
	if rec == nil {
		wp, err := s.GetWaypoint(ctx, id)
		if err != nil {
			return nil, fmt.Errorf("neo4jstore: rehydrate waypoint: %w", err)
		}
		if wp.Status != domain.WaypointReached && wp.Status != domain.WaypointBypassed {
			return nil, fmt.Errorf("neo4jstore: rehydrate waypoint: %w: waypoint is not reached or bypassed", store.ErrConflict)
		}
		return nil, fmt.Errorf("neo4jstore: rehydrate waypoint: %w: owning expedition is not active — reopen_expedition first", store.ErrConflict)
	}
	n, ok := singleNode(rec, "w")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: rehydrate waypoint: no waypoint returned")
	}
	return nodeToWaypoint(n)
}

// ListWaypointHistory returns a waypoint's full rehydrate history, oldest
// first.
func (s *Neo4jStore) ListWaypointHistory(ctx context.Context, waypointID string) ([]*domain.WaypointHistoryEntry, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:Waypoint {id: $waypointId})-[:HAD_STATE]->(h:WaypointHistoryEntry)
			RETURN h ORDER BY h.ordinal`, map[string]any{"waypointId": waypointID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list waypoint history: %w", err)
	}

	entries := make([]*domain.WaypointHistoryEntry, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "h")
		if !ok {
			continue
		}
		h, err := nodeToWaypointHistoryEntry(n)
		if err != nil {
			return nil, err
		}
		entries = append(entries, h)
	}
	return entries, nil
}
