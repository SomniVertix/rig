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

// AddWaypointAsset attaches what resolving a waypoint produced — a document
// stored whole, or a reference to code committed on main. Unguarded: legal
// regardless of the waypoint's own status, since an asset can be produced
// while working toward a decision, not only after reach_waypoint records it.
func (s *Neo4jStore) AddWaypointAsset(ctx context.Context, waypointID string, params store.AddWaypointAssetParams) (*domain.WaypointAsset, error) {
	// App-layer existence check first, mirroring FlagWaypoint — avoids a
	// silent no-op CREATE against a missing waypoint.
	if _, err := s.GetWaypoint(ctx, waypointID); err != nil {
		return nil, fmt.Errorf("neo4jstore: add waypoint asset: %w", err)
	}

	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	id := uuid.NewString()

	cypher := `
		MATCH (w:Waypoint {id: $waypointId})
		OPTIONAL MATCH (w)-[:HAS_ASSET]->(existing:WaypointAsset)
		WITH w, coalesce(max(existing.ordinal), 0) + 1 AS nextOrdinal
		CREATE (a:WaypointAsset {
			id: $id, waypointId: $waypointId, ordinal: nextOrdinal,
			kind: $kind, title: $title,
			contentMarkdown: $contentMarkdown, repoPath: $repoPath, commitSha: $commitSha,
			createdAt: $now
		})
		CREATE (w)-[:HAS_ASSET]->(a)
		RETURN a`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"waypointId":      waypointID,
			"id":              id,
			"kind":            params.Kind,
			"title":           params.Title,
			"contentMarkdown": derefStr(params.ContentMarkdown),
			"repoPath":        derefStr(params.RepoPath),
			"commitSha":       derefStr(params.CommitSHA),
			"now":             now,
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add waypoint asset: %w", err)
	}
	return recordToWaypointAsset(rec, "a")
}

// ListWaypointAssets returns every asset attached to waypointID, oldest
// first — the get_waypoint zoom-in.
func (s *Neo4jStore) ListWaypointAssets(ctx context.Context, waypointID string) ([]*domain.WaypointAsset, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:Waypoint {id: $waypointId})-[:HAS_ASSET]->(a:WaypointAsset)
			RETURN a ORDER BY a.ordinal`, map[string]any{"waypointId": waypointID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list waypoint assets: %w", err)
	}
	return recordsToWaypointAssets(records, "a")
}

func recordToWaypointAsset(rec *neo4j.Record, key string) (*domain.WaypointAsset, error) {
	n, ok := singleNode(rec, key)
	if !ok {
		return nil, fmt.Errorf("neo4jstore: no %s returned", key)
	}
	return nodeToWaypointAsset(n)
}

func recordsToWaypointAssets(records []*neo4j.Record, key string) ([]*domain.WaypointAsset, error) {
	assets := make([]*domain.WaypointAsset, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, key)
		if !ok {
			continue
		}
		a, err := nodeToWaypointAsset(n)
		if err != nil {
			return nil, err
		}
		assets = append(assets, a)
	}
	return assets, nil
}
