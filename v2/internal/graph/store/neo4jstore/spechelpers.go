package neo4jstore

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/somnivertix/rig/internal/graph/store"
)

// getNodeByID is the shared single-node-by-id lookup used by every spec
// pipeline artifact type that doesn't need bespoke traversal — labels are
// always code-controlled constants here, never user input, so
// fmt.Sprintf-ing them into the Cypher text is the same safety class as the
// existing getExpeditionBy property-name interpolation.
func (s *Neo4jStore) getNodeByID(ctx context.Context, label, varName, id string) (neo4j.Node, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	cypher := fmt.Sprintf("MATCH (%s:%s {id: $id}) RETURN %s", varName, label, varName)
	rec, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{"id": id})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return neo4j.Node{}, err
	}
	if rec == nil {
		return neo4j.Node{}, store.ErrNotFound
	}
	n, ok := singleNode(rec, varName)
	if !ok {
		return neo4j.Node{}, store.ErrNotFound
	}
	return n, nil
}

// setNodeFields applies a partial update (SET n += $sets) to a node by id,
// returning store.ErrNotFound if no such node exists.
func (s *Neo4jStore) setNodeFields(ctx context.Context, label, varName, id string, sets map[string]any) (neo4j.Node, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	cypher := fmt.Sprintf("MATCH (%s:%s {id: $id}) SET %s += $sets RETURN %s", varName, label, varName, varName)
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
		return neo4j.Node{}, err
	}
	if rec == nil {
		return neo4j.Node{}, store.ErrNotFound
	}
	n, ok := singleNode(rec, varName)
	if !ok {
		return neo4j.Node{}, store.ErrNotFound
	}
	return n, nil
}

// deleteNodeByID detach-deletes a node by id and label, returning
// store.ErrNotFound if it didn't exist.
func (s *Neo4jStore) deleteNodeByID(ctx context.Context, label, id string) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	cypher := fmt.Sprintf("MATCH (n:%s {id: $id}) DETACH DELETE n RETURN count(n) AS deleted", label)
	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{"id": id})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return err
	}
	deleted, _ := rec.Get("deleted")
	if n, ok := deleted.(int64); !ok || n == 0 {
		return store.ErrNotFound
	}
	return nil
}

// addOrdinalChild creates a child node under parentLabel/parentID via
// relType, auto-assigning ordinal as max+1 among existing same-typed
// children — the shared shape behind NonGoal, Alternative, OpenRisk,
// DataModelEntry, DefinitionOfDoneItem, and TraceabilityEntry. fields
// supplies every child property besides id/ordinal.
func (s *Neo4jStore) addOrdinalChild(ctx context.Context, parentLabel, parentID, relType, childLabel, varName string, fields map[string]any) (neo4j.Node, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	id := uuid.NewString()
	props := map[string]any{"id": id}
	for k, v := range fields {
		props[k] = v
	}

	cypher := fmt.Sprintf(`
		MATCH (parent:%s {id: $parentId})
		OPTIONAL MATCH (parent)-[:%s]->(existing:%s)
		WITH parent, coalesce(max(existing.ordinal), 0) + 1 AS nextOrdinal
		CREATE (%s:%s)
		SET %s = $props, %s.ordinal = nextOrdinal
		CREATE (parent)-[:%s]->(%s)
		RETURN %s`, parentLabel, relType, childLabel, varName, childLabel, varName, varName, relType, varName, varName)

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{"parentId": parentID, "props": props})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return neo4j.Node{}, err
	}
	n, ok := singleNode(rec, varName)
	if !ok {
		return neo4j.Node{}, fmt.Errorf("%s %s not found", parentLabel, parentID)
	}
	return n, nil
}

// listOrdinalChildren returns every relType child of parentLabel/parentID,
// ordered by ordinal.
func (s *Neo4jStore) listOrdinalChildren(ctx context.Context, parentLabel, parentID, relType, childLabel, varName string) ([]neo4j.Node, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	cypher := fmt.Sprintf(`
		MATCH (:%s {id: $parentId})-[:%s]->(%s:%s)
		RETURN %s ORDER BY %s.ordinal`, parentLabel, relType, varName, childLabel, varName, varName)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{"parentId": parentID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, err
	}
	nodes := make([]neo4j.Node, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, varName)
		if !ok {
			continue
		}
		nodes = append(nodes, n)
	}
	return nodes, nil
}
