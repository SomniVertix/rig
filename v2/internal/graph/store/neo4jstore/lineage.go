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

// SpurWaypoint spins a new expedition off waypointID's resolution, creating
// the child expedition, the (waypoint)-[:SPURRED]->(expedition) lineage
// edge, and reaching the origin waypoint, all in one transaction — no bare
// pointer to an expedition that may not exist yet, and no waypoint left
// dangling in marked/claimed/rehydrating after it's spurred an expedition. A
// waypoint spurs at most one expedition (mirrors
// waypoints_spurred_to_trail_id_key) and, like ReachWaypoint, is only legal
// from marked, claimed, or rehydrating. Also nulls unspurReason: a stale
// "why the previous spur was undone" reason shouldn't survive a fresh spur
// it no longer describes.
func (s *Neo4jStore) SpurWaypoint(ctx context.Context, waypointID string, params store.SpurWaypointParams) (*domain.Expedition, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	expeditionID := uuid.NewString()
	resolution := fmt.Sprintf("Spun off into expedition %q.", params.Slug)

	cypher := `
		MATCH (w:Waypoint {id: $waypointId})
		WHERE w.spurredToExpeditionId IS NULL
		  AND w.status IN [$marked, $claimed, $rehydrating]
		CREATE (e:Expedition {
			id: $expeditionId, workspaceId: $workspaceId, slug: $slug, title: $title,
			briefingPrompt: $briefingPrompt, destination: $destination,
			notes: $notes, status: $status,
			createdAt: $createdAt, updatedAt: $updatedAt
		})
		CREATE (w)-[:SPURRED]->(e)
		SET w.spurredToExpeditionId = $expeditionId,
		    w.status = $reached, w.resolution = $resolution, w.resolutionGist = $resolution,
		    w.rationale = $rationale, w.reachedIn = $reachedIn, w.reachedAt = $now, w.updatedAt = $now,
		    w.unspurReason = NULL
		RETURN e`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"waypointId":     waypointID,
			"expeditionId":   expeditionID,
			"workspaceId":      params.WorkspaceID,
			"slug":           params.Slug,
			"title":          params.Title,
			"briefingPrompt": params.BriefingPrompt,
			"destination":    derefStr(params.Destination),
			"notes":          derefStr(params.Notes),
			"status":         string(domain.ExpeditionStatusActive),
			"marked":         string(domain.WaypointMarked),
			"claimed":        string(domain.WaypointClaimed),
			"rehydrating":    string(domain.WaypointRehydrating),
			"reached":        string(domain.WaypointReached),
			"resolution":     resolution,
			"rationale":      derefStr(params.Rationale),
			"reachedIn":      derefStr(params.ReachedIn),
			"createdAt":      now,
			"updatedAt":      now,
			"now":            now,
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
		return nil, fmt.Errorf("neo4jstore: spur waypoint: %w", err)
	}
	if rec == nil {
		wp, err := s.GetWaypoint(ctx, waypointID)
		if err != nil {
			return nil, fmt.Errorf("neo4jstore: spur waypoint: %w", err)
		}
		if wp.SpurredToExpeditionID != nil {
			return nil, fmt.Errorf("neo4jstore: spur waypoint: %w: waypoint already spurred an expedition", store.ErrConflict)
		}
		return nil, fmt.Errorf("neo4jstore: spur waypoint: %w: waypoint is not marked, claimed, or rehydrating", store.ErrConflict)
	}
	n, ok := singleNode(rec, "e")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: spur waypoint: no expedition returned")
	}
	return nodeToExpedition(n)
}

// UnspurWaypoint removes the lineage edge and restores the origin waypoint
// to marked, without touching the now-parentless child expedition, matching
// v1 and the wayfinder skill's documented contract. Records reason on the
// waypoint (unspurReason).
func (s *Neo4jStore) UnspurWaypoint(ctx context.Context, waypointID, reason string) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	_, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (any, error) {
		return tx.Run(ctx, `
			MATCH (w:Waypoint {id: $waypointId})-[r:SPURRED]->(:Expedition)
			DELETE r
			SET w.spurredToExpeditionId = NULL, w.status = $marked, w.updatedAt = $now,
			    w.unspurReason = $reason`,
			map[string]any{
				"waypointId": waypointID,
				"marked":     string(domain.WaypointMarked),
				"reason":     reason,
				"now":        time.Now().UTC(),
			})
	})
	if err != nil {
		return fmt.Errorf("neo4jstore: unspur waypoint: %w", err)
	}
	return nil
}

// GetExpeditionLineage returns expeditionID's single parent edge, if any:
// either the session that chartered it, or the waypoint that spurred it.
func (s *Neo4jStore) GetExpeditionLineage(ctx context.Context, expeditionID string) (*domain.ExpeditionLineage, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (e:Expedition {id: $expeditionId})
			OPTIONAL MATCH (sess:Session)-[:CHARTERED]->(e)
			OPTIONAL MATCH (parentWaypoint:Waypoint)-[:SPURRED]->(e)
			RETURN e.createdAt AS createdAt, sess.id AS sessionId, parentWaypoint.id AS waypointId`,
			map[string]any{"expeditionId": expeditionID})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: get expedition lineage: %w", err)
	}
	if rec == nil {
		return nil, store.ErrNotFound
	}

	sessionID, _ := rec.Get("sessionId")
	waypointID, _ := rec.Get("waypointId")

	lineage := &domain.ExpeditionLineage{ChildExpeditionID: expeditionID}
	if wid, ok := waypointID.(string); ok {
		lineage.ParentKind = domain.LineageParentWaypoint
		lineage.ParentWaypointID = &wid
	} else if sid, ok := sessionID.(string); ok {
		lineage.ParentKind = domain.LineageParentSession
		lineage.ParentSessionID = &sid
	} else {
		return nil, store.ErrNotFound
	}
	return lineage, nil
}
