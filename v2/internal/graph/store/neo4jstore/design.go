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

func (s *Neo4jStore) AddDesignComponent(ctx context.Context, params store.AddDesignComponentParams) (*domain.DesignComponent, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	id := uuid.NewString()
	now := time.Now().UTC()
	cypher := `
		MATCH (spec:Spec {id: $specId})
		OPTIONAL MATCH (spec)-[:HAS_COMPONENT]->(existing:DesignComponent)
		WITH spec, coalesce(max(existing.ordinal), 0) + 1 AS nextOrdinal
		CREATE (d:DesignComponent {
			id: $id, specId: $specId, slug: $slug, displayName: $displayName,
			ordinal: nextOrdinal, createdAt: $now
		})
		CREATE (spec)-[:HAS_COMPONENT]->(d)
		RETURN d`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"specId": params.SpecID, "id": id, "slug": params.Slug,
			"displayName": params.DisplayName, "now": now,
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add design component: %w", err)
	}
	n, ok := singleNode(rec, "d")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: add design component: spec %s not found", params.SpecID)
	}
	return nodeToDesignComponent(n)
}

func (s *Neo4jStore) UpdateDesignComponent(ctx context.Context, id string, params store.UpdateDesignComponentParams) (*domain.DesignComponent, error) {
	sets := map[string]any{}
	if params.DisplayName != nil {
		sets["displayName"] = *params.DisplayName
	}
	n, err := s.setNodeFields(ctx, "DesignComponent", "d", id, sets)
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update design component: %w", err)
	}
	return nodeToDesignComponent(n)
}

func (s *Neo4jStore) DeleteDesignComponent(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "DesignComponent", id)
}

func (s *Neo4jStore) ListDesignComponents(ctx context.Context, specID string) ([]*domain.DesignComponent, error) {
	nodes, err := s.listOrdinalChildren(ctx, "Spec", specID, "HAS_COMPONENT", "DesignComponent", "d")
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list design components: %w", err)
	}
	out := make([]*domain.DesignComponent, 0, len(nodes))
	for _, n := range nodes {
		c, err := nodeToDesignComponent(n)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, nil
}

func (s *Neo4jStore) AddDataModelEntry(ctx context.Context, params store.AddDataModelEntryParams) (*domain.DataModelEntry, error) {
	n, err := s.addOrdinalChild(ctx, "Spec", params.SpecID, "HAS_DATA_MODEL_ENTRY", "DataModelEntry", "d", map[string]any{
		"specId": params.SpecID, "name": params.Name, "kind": params.Kind, "content": params.Content,
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add data model entry: %w", err)
	}
	return nodeToDataModelEntry(n)
}

func (s *Neo4jStore) UpdateDataModelEntry(ctx context.Context, id string, params store.UpdateDataModelEntryParams) (*domain.DataModelEntry, error) {
	sets := map[string]any{}
	if params.Name != nil {
		sets["name"] = *params.Name
	}
	if params.Kind != nil {
		sets["kind"] = *params.Kind
	}
	if params.Content != nil {
		sets["content"] = *params.Content
	}
	n, err := s.setNodeFields(ctx, "DataModelEntry", "d", id, sets)
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update data model entry: %w", err)
	}
	return nodeToDataModelEntry(n)
}

func (s *Neo4jStore) DeleteDataModelEntry(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "DataModelEntry", id)
}

func (s *Neo4jStore) ListDataModelEntries(ctx context.Context, specID string) ([]*domain.DataModelEntry, error) {
	nodes, err := s.listOrdinalChildren(ctx, "Spec", specID, "HAS_DATA_MODEL_ENTRY", "DataModelEntry", "d")
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list data model entries: %w", err)
	}
	out := make([]*domain.DataModelEntry, 0, len(nodes))
	for _, n := range nodes {
		e, err := nodeToDataModelEntry(n)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

// AddTraceabilityEntry links a design section/component to the user story
// it addresses. UserStoryID is optional and preserved as a nil-able
// REFERENCES target — RequirementLabel is the durable text fallback,
// mirroring v1's ON DELETE SET NULL semantics for a story that can no
// longer be resolved.
func (s *Neo4jStore) AddTraceabilityEntry(ctx context.Context, params store.AddTraceabilityEntryParams) (*domain.TraceabilityEntry, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	id := uuid.NewString()
	cypher := `
		MATCH (spec:Spec {id: $specId})
		OPTIONAL MATCH (spec)-[:HAS_TRACEABILITY_ENTRY]->(existing:TraceabilityEntry)
		WITH spec, coalesce(max(existing.ordinal), 0) + 1 AS nextOrdinal
		OPTIONAL MATCH (story:UserStory {id: $userStoryId})
		CREATE (t:TraceabilityEntry {
			id: $id, specId: $specId, userStoryId: $userStoryId,
			requirementLabel: $requirementLabel, addressedBy: $addressedBy,
			ordinal: nextOrdinal
		})
		CREATE (spec)-[:HAS_TRACEABILITY_ENTRY]->(t)
		FOREACH (_ IN CASE WHEN story IS NOT NULL THEN [1] ELSE [] END |
			CREATE (t)-[:REFERENCES]->(story)
		)
		RETURN t`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"specId": params.SpecID, "id": id,
			"userStoryId":      derefStr(params.UserStoryID),
			"requirementLabel": params.RequirementLabel,
			"addressedBy":      params.AddressedBy,
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add traceability entry: %w", err)
	}
	n, ok := singleNode(rec, "t")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: add traceability entry: spec %s not found", params.SpecID)
	}
	return nodeToTraceabilityEntry(n)
}

func (s *Neo4jStore) UpdateTraceabilityEntry(ctx context.Context, id string, params store.UpdateTraceabilityEntryParams) (*domain.TraceabilityEntry, error) {
	sets := map[string]any{}
	if params.UserStoryID != nil {
		sets["userStoryId"] = *params.UserStoryID
	}
	if params.RequirementLabel != nil {
		sets["requirementLabel"] = *params.RequirementLabel
	}
	if params.AddressedBy != nil {
		sets["addressedBy"] = *params.AddressedBy
	}
	n, err := s.setNodeFields(ctx, "TraceabilityEntry", "t", id, sets)
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update traceability entry: %w", err)
	}

	// REFERENCES is re-derived from the (possibly just-changed) userStoryId
	// rather than left stale, since UpdateTraceabilityEntry can repoint it.
	if params.UserStoryID != nil {
		sess := s.session(ctx)
		defer sess.Close(ctx)
		if _, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (any, error) {
			return tx.Run(ctx, `
				MATCH (t:TraceabilityEntry {id: $id})
				OPTIONAL MATCH (t)-[r:REFERENCES]->(:UserStory)
				DELETE r
				WITH t
				OPTIONAL MATCH (story:UserStory {id: $userStoryId})
				FOREACH (_ IN CASE WHEN story IS NOT NULL THEN [1] ELSE [] END |
					CREATE (t)-[:REFERENCES]->(story)
				)`, map[string]any{"id": id, "userStoryId": *params.UserStoryID})
		}); err != nil {
			return nil, fmt.Errorf("neo4jstore: update traceability entry: relink: %w", err)
		}
	}
	return nodeToTraceabilityEntry(n)
}

func (s *Neo4jStore) DeleteTraceabilityEntry(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "TraceabilityEntry", id)
}

func (s *Neo4jStore) ListTraceabilityEntries(ctx context.Context, specID string) ([]*domain.TraceabilityEntry, error) {
	nodes, err := s.listOrdinalChildren(ctx, "Spec", specID, "HAS_TRACEABILITY_ENTRY", "TraceabilityEntry", "t")
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list traceability entries: %w", err)
	}
	out := make([]*domain.TraceabilityEntry, 0, len(nodes))
	for _, n := range nodes {
		e, err := nodeToTraceabilityEntry(n)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, nil
}

func (s *Neo4jStore) AddAlternative(ctx context.Context, params store.AddAlternativeParams) (*domain.Alternative, error) {
	n, err := s.addOrdinalChild(ctx, "Spec", params.SpecID, "HAS_ALTERNATIVE", "Alternative", "a", map[string]any{
		"specId": params.SpecID, "description": params.Description,
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add alternative: %w", err)
	}
	return nodeToAlternative(n)
}

func (s *Neo4jStore) UpdateAlternative(ctx context.Context, id, description string) (*domain.Alternative, error) {
	n, err := s.setNodeFields(ctx, "Alternative", "a", id, map[string]any{"description": description})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update alternative: %w", err)
	}
	return nodeToAlternative(n)
}

func (s *Neo4jStore) DeleteAlternative(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "Alternative", id)
}

func (s *Neo4jStore) ListAlternatives(ctx context.Context, specID string) ([]*domain.Alternative, error) {
	nodes, err := s.listOrdinalChildren(ctx, "Spec", specID, "HAS_ALTERNATIVE", "Alternative", "a")
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list alternatives: %w", err)
	}
	out := make([]*domain.Alternative, 0, len(nodes))
	for _, n := range nodes {
		a, err := nodeToAlternative(n)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

func (s *Neo4jStore) AddOpenRisk(ctx context.Context, params store.AddOpenRiskParams) (*domain.OpenRisk, error) {
	n, err := s.addOrdinalChild(ctx, "Spec", params.SpecID, "HAS_OPEN_RISK", "OpenRisk", "o", map[string]any{
		"specId": params.SpecID, "description": params.Description,
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add open risk: %w", err)
	}
	return nodeToOpenRisk(n)
}

func (s *Neo4jStore) UpdateOpenRisk(ctx context.Context, id, description string) (*domain.OpenRisk, error) {
	n, err := s.setNodeFields(ctx, "OpenRisk", "o", id, map[string]any{"description": description})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update open risk: %w", err)
	}
	return nodeToOpenRisk(n)
}

func (s *Neo4jStore) DeleteOpenRisk(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "OpenRisk", id)
}

func (s *Neo4jStore) ListOpenRisks(ctx context.Context, specID string) ([]*domain.OpenRisk, error) {
	nodes, err := s.listOrdinalChildren(ctx, "Spec", specID, "HAS_OPEN_RISK", "OpenRisk", "o")
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list open risks: %w", err)
	}
	out := make([]*domain.OpenRisk, 0, len(nodes))
	for _, n := range nodes {
		r, err := nodeToOpenRisk(n)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}
