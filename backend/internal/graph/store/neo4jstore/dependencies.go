package neo4jstore

import (
	"context"
	"fmt"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// AddWaypointDependency records that fromWaypointID must terminate (reached
// or bypassed) before toWaypointID is frontier-eligible. Edges must stay
// within one expedition and may not be self-loops, matching v1's
// reject_cross_trail_waypoint_edge trigger and waypoint_edge_not_self check
// — enforced here at the application layer rather than a database trigger.
// No cycle detection, matching v1.
func (s *Neo4jStore) AddWaypointDependency(ctx context.Context, fromWaypointID, toWaypointID string) error {
	if fromWaypointID == toWaypointID {
		return fmt.Errorf("neo4jstore: add waypoint dependency: %w: from and to are the same waypoint", store.ErrConflict)
	}

	from, err := s.GetWaypoint(ctx, fromWaypointID)
	if err != nil {
		return fmt.Errorf("neo4jstore: add waypoint dependency: from: %w", err)
	}
	to, err := s.GetWaypoint(ctx, toWaypointID)
	if err != nil {
		return fmt.Errorf("neo4jstore: add waypoint dependency: to: %w", err)
	}
	if from.ExpeditionID != to.ExpeditionID {
		return fmt.Errorf("neo4jstore: add waypoint dependency: %w: from and to belong to different expeditions", store.ErrConflict)
	}

	sess := s.session(ctx)
	defer sess.Close(ctx)

	_, err = neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (any, error) {
		return tx.Run(ctx, `
			MATCH (from:Waypoint {id: $fromId}), (to:Waypoint {id: $toId})
			MERGE (from)-[:BLOCKS]->(to)`, map[string]any{
			"fromId": fromWaypointID,
			"toId":   toWaypointID,
		})
	})
	if err != nil {
		return fmt.Errorf("neo4jstore: add waypoint dependency: %w", err)
	}
	return nil
}

// ListWaypointDependencies returns every BLOCKS edge between two waypoints
// that both belong to expeditionID, in no particular order.
func (s *Neo4jStore) ListWaypointDependencies(ctx context.Context, expeditionID string) ([]domain.WaypointDependencyEdge, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:Expedition {id: $expeditionId})-[:HAS_WAYPOINT]->(from:Waypoint)-[r:BLOCKS]->(to:Waypoint)
			RETURN from.id AS fromId, to.id AS toId, r.createdAt AS createdAt`, map[string]any{
			"expeditionId": expeditionID,
		})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list waypoint dependencies: %w", err)
	}

	edges := make([]domain.WaypointDependencyEdge, 0, len(records))
	for _, rec := range records {
		fromID, _ := rec.Get("fromId")
		toID, _ := rec.Get("toId")
		edge := domain.WaypointDependencyEdge{}
		if s, ok := fromID.(string); ok {
			edge.FromWaypointID = s
		}
		if s, ok := toID.(string); ok {
			edge.ToWaypointID = s
		}
		if createdAt, ok := rec.Get("createdAt"); ok {
			if t, ok := createdAt.(time.Time); ok {
				edge.CreatedAt = t
			}
		}
		edges = append(edges, edge)
	}
	return edges, nil
}

func (s *Neo4jStore) RemoveWaypointDependency(ctx context.Context, fromWaypointID, toWaypointID string) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	_, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (any, error) {
		return tx.Run(ctx, `
			MATCH (:Waypoint {id: $fromId})-[r:BLOCKS]->(:Waypoint {id: $toId})
			DELETE r`, map[string]any{
			"fromId": fromWaypointID,
			"toId":   toWaypointID,
		})
	})
	if err != nil {
		return fmt.Errorf("neo4jstore: remove waypoint dependency: %w", err)
	}
	return nil
}
