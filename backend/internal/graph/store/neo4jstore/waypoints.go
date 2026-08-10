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

func (s *Neo4jStore) AddWaypoint(ctx context.Context, expeditionID string, params store.AddWaypointParams) (*domain.Waypoint, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	id := uuid.NewString()

	status := domain.WaypointMarked
	if params.Sighted {
		status = domain.WaypointSighted
	}
	var reachedAt any
	if params.Resolution != nil {
		status = domain.WaypointReached
		reachedAt = now
	}

	cypher := `
		MATCH (ex:Expedition {id: $expeditionId})
		OPTIONAL MATCH (ex)-[:HAS_WAYPOINT]->(existing:Waypoint)
		WITH ex, coalesce(max(existing.waypointNumber), 0) + 1 AS nextNumber
		CREATE (w:Waypoint {
			id: $id, expeditionId: $expeditionId, waypointNumber: nextNumber,
			title: $title, question: $question, approach: $approach,
			status: $status, resolution: $resolution, resolutionGist: $resolutionGist,
			reachedIn: $reachedIn, reachedAt: $reachedAt,
			createdAt: $createdAt, updatedAt: $updatedAt
		})
		CREATE (ex)-[:HAS_WAYPOINT]->(w)
		RETURN w`

	var approach any
	if params.Approach != nil {
		approach = string(*params.Approach)
	}

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"expeditionId":   expeditionID,
			"id":             id,
			"title":          params.Title,
			"question":       params.Question,
			"approach":       approach,
			"status":         string(status),
			"resolution":     derefStr(params.Resolution),
			"resolutionGist": derefStr(params.ResolutionGist),
			"reachedIn":      derefStr(params.ReachedIn),
			"reachedAt":      reachedAt,
			"createdAt":      now,
			"updatedAt":      now,
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add waypoint: %w", err)
	}
	n, ok := singleNode(rec, "w")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: add waypoint: expedition %s not found", expeditionID)
	}
	return nodeToWaypoint(n)
}

func (s *Neo4jStore) GetWaypoint(ctx context.Context, id string) (*domain.Waypoint, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, "MATCH (w:Waypoint {id: $id}) RETURN w", map[string]any{"id": id})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: get waypoint: %w", err)
	}
	if rec == nil {
		return nil, store.ErrNotFound
	}
	n, ok := singleNode(rec, "w")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToWaypoint(n)
}

func (s *Neo4jStore) ListWaypoints(ctx context.Context, expeditionID string) ([]*domain.Waypoint, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:Expedition {id: $expeditionId})-[:HAS_WAYPOINT]->(w:Waypoint)
			RETURN w ORDER BY w.waypointNumber`, map[string]any{"expeditionId": expeditionID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list waypoints: %w", err)
	}

	waypoints := make([]*domain.Waypoint, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "w")
		if !ok {
			continue
		}
		w, err := nodeToWaypoint(n)
		if err != nil {
			return nil, err
		}
		waypoints = append(waypoints, w)
	}
	return waypoints, nil
}

func (s *Neo4jStore) UpdateWaypoint(ctx context.Context, id string, params store.UpdateWaypointParams) (*domain.Waypoint, error) {
	sets := map[string]any{"updatedAt": time.Now().UTC()}
	if params.Title != nil {
		sets["title"] = *params.Title
	}
	if params.Question != nil {
		sets["question"] = *params.Question
	}
	if params.Approach != nil {
		sets["approach"] = string(*params.Approach)
	}
	if !params.Mark {
		return s.updateWaypointFields(ctx, "MATCH (w:Waypoint {id: $id}) SET w += $sets RETURN w", id, sets)
	}

	// Mark graduates a sighted waypoint to marked, guarded like every other
	// status transition — a plain SET += (the path above) doesn't check the
	// waypoint's current status, but this one deliberately does.
	sets["status"] = string(domain.WaypointMarked)

	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (w:Waypoint {id: $id})
			WHERE w.status = $sighted
			SET w += $sets
			RETURN w`, map[string]any{
			"id":      id,
			"sighted": string(domain.WaypointSighted),
			"sets":    sets,
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
		return nil, fmt.Errorf("neo4jstore: update waypoint: %w", err)
	}
	if rec == nil {
		if _, err := s.GetWaypoint(ctx, id); err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("neo4jstore: update waypoint: %w: waypoint is not sighted, can't mark", store.ErrConflict)
	}
	n, ok := singleNode(rec, "w")
	if !ok {
		return nil, store.ErrConflict
	}
	return nodeToWaypoint(n)
}

// ClaimWaypoint is the canonical atomic claim: only a marked or rehydrating
// waypoint is claimable; an already-claimed (or otherwise ineligible)
// waypoint is a no-op, surfaced here as store.ErrConflict rather than a
// zero-row UPDATE. There is no automatic reclaim — a claim only ever clears
// via ReleaseWaypoint.
func (s *Neo4jStore) ClaimWaypoint(ctx context.Context, id, claimedBy string) (*domain.Waypoint, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()

	cypher := `
		MATCH (w:Waypoint {id: $id})
		WHERE w.status IN [$marked, $rehydrating]
		SET w.status = $claimed, w.claimedBy = $claimedBy, w.claimedAt = $now, w.updatedAt = $now
		RETURN w`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"id":          id,
			"marked":      string(domain.WaypointMarked),
			"rehydrating": string(domain.WaypointRehydrating),
			"claimed":     string(domain.WaypointClaimed),
			"claimedBy":   claimedBy,
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
		return nil, fmt.Errorf("neo4jstore: claim waypoint: %w", err)
	}
	if rec == nil {
		if _, err := s.GetWaypoint(ctx, id); err != nil {
			return nil, err
		}
		return nil, store.ErrConflict
	}
	n, ok := singleNode(rec, "w")
	if !ok {
		return nil, store.ErrConflict
	}
	return nodeToWaypoint(n)
}

func (s *Neo4jStore) ReleaseWaypoint(ctx context.Context, id string) (*domain.Waypoint, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (w:Waypoint {id: $id})
			WHERE w.status = $claimed
			SET w.status = $marked, w.claimedBy = NULL, w.claimedAt = NULL, w.updatedAt = $now
			RETURN w`, map[string]any{
			"id":      id,
			"claimed": string(domain.WaypointClaimed),
			"marked":  string(domain.WaypointMarked),
			"now":     time.Now().UTC(),
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
		return nil, fmt.Errorf("neo4jstore: release waypoint: %w", err)
	}
	if rec == nil {
		if _, err := s.GetWaypoint(ctx, id); err != nil {
			return nil, err
		}
		return nil, store.ErrConflict
	}
	n, ok := singleNode(rec, "w")
	if !ok {
		return nil, store.ErrConflict
	}
	return nodeToWaypoint(n)
}

// ReachWaypoint also nulls out bypassReason: once rehydrate_waypoint made a
// second termination possible (bypassed -> rehydrating -> reached), a stale
// bypassReason from a prior life would otherwise survive describing nothing
// real.
func (s *Neo4jStore) ReachWaypoint(ctx context.Context, id string, params store.ReachWaypointParams) (*domain.Waypoint, error) {
	now := time.Now().UTC()
	sets := map[string]any{
		"status":         string(domain.WaypointReached),
		"resolution":     params.Resolution,
		"resolutionGist": params.ResolutionGist,
		"bypassReason":   nil,
		"reachedAt":      now,
		"updatedAt":      now,
	}
	if params.Rationale != nil {
		sets["rationale"] = *params.Rationale
	}
	if params.ReachedIn != nil {
		sets["reachedIn"] = *params.ReachedIn
	}
	return s.updateWaypointFields(ctx, "MATCH (w:Waypoint {id: $id}) SET w += $sets RETURN w", id, sets)
}

// BypassWaypoint also nulls out resolution/resolutionGist/rationale/
// reachedIn/reachedAt — same reasoning as ReachWaypoint's bypassReason
// nulling, for the symmetric reached -> rehydrating -> bypassed path. Also
// nulls unbypassReason: a stale "why the previous bypass was undone" reason
// shouldn't survive a fresh bypass it no longer describes.
func (s *Neo4jStore) BypassWaypoint(ctx context.Context, id, reason string) (*domain.Waypoint, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (w:Waypoint {id: $id})
			SET w.previousStatus = w.status, w.status = $bypassed,
			    w.bypassReason = $reason, w.updatedAt = $now,
			    w.resolution = NULL, w.resolutionGist = NULL, w.rationale = NULL,
			    w.reachedIn = NULL, w.reachedAt = NULL, w.unbypassReason = NULL
			RETURN w`, map[string]any{
			"id":       id,
			"bypassed": string(domain.WaypointBypassed),
			"reason":   reason,
			"now":      time.Now().UTC(),
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: bypass waypoint: %w", err)
	}
	n, ok := singleNode(rec, "w")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToWaypoint(n)
}

func (s *Neo4jStore) UnbypassWaypoint(ctx context.Context, id, reason string) (*domain.Waypoint, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (w:Waypoint {id: $id})
			WHERE w.status = $bypassed AND w.previousStatus IS NOT NULL
			SET w.status = w.previousStatus, w.updatedAt = $now, w.unbypassReason = $reason
			REMOVE w.previousStatus, w.bypassReason
			RETURN w`, map[string]any{
			"id":       id,
			"bypassed": string(domain.WaypointBypassed),
			"reason":   reason,
			"now":      time.Now().UTC(),
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
		return nil, fmt.Errorf("neo4jstore: unbypass waypoint: %w", err)
	}
	if rec == nil {
		if _, err := s.GetWaypoint(ctx, id); err != nil {
			return nil, err
		}
		return nil, store.ErrConflict
	}
	n, ok := singleNode(rec, "w")
	if !ok {
		return nil, store.ErrConflict
	}
	return nodeToWaypoint(n)
}

// GetFrontier is the canonical frontier query: marked or rehydrating
// waypoints whose blockers have all terminated (reached or bypassed), in
// waypoint_number order.
func (s *Neo4jStore) GetFrontier(ctx context.Context, expeditionID string) ([]*domain.Waypoint, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	cypher := `
		MATCH (:Expedition {id: $expeditionId})-[:HAS_WAYPOINT]->(w:Waypoint)
		WHERE w.status IN [$marked, $rehydrating]
		  AND NOT EXISTS {
		      MATCH (blocker:Waypoint)-[:BLOCKS]->(w)
		      WHERE NOT blocker.status IN [$reached, $bypassed]
		  }
		RETURN w ORDER BY w.waypointNumber`

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"expeditionId": expeditionID,
			"marked":       string(domain.WaypointMarked),
			"rehydrating":  string(domain.WaypointRehydrating),
			"reached":      string(domain.WaypointReached),
			"bypassed":     string(domain.WaypointBypassed),
		})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: get frontier: %w", err)
	}

	waypoints := make([]*domain.Waypoint, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "w")
		if !ok {
			continue
		}
		w, err := nodeToWaypoint(n)
		if err != nil {
			return nil, err
		}
		waypoints = append(waypoints, w)
	}
	return waypoints, nil
}

func (s *Neo4jStore) updateWaypointFields(ctx context.Context, cypher, id string, sets map[string]any) (*domain.Waypoint, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{"id": id, "sets": sets})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update waypoint: %w", err)
	}
	if rec == nil {
		return nil, store.ErrNotFound
	}
	n, ok := singleNode(rec, "w")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToWaypoint(n)
}
