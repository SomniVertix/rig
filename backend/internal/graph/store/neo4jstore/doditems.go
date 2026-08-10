package neo4jstore

import (
	"context"
	"fmt"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// AddDefinitionOfDoneItem adds one entry to the spec-wide Definition of
// Done, shared across every component's TasksDoc under this Spec — never
// duplicated per component.
func (s *Neo4jStore) AddDefinitionOfDoneItem(ctx context.Context, params store.AddDefinitionOfDoneItemParams) (*domain.DefinitionOfDoneItem, error) {
	n, err := s.addOrdinalChild(ctx, "Spec", params.SpecID, "HAS_DOD_ITEM", "DefinitionOfDoneItem", "d", map[string]any{
		"specId": params.SpecID, "description": params.Description, "isChecked": false,
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add definition of done item: %w", err)
	}
	return nodeToDefinitionOfDoneItem(n)
}

func (s *Neo4jStore) UpdateDefinitionOfDoneItem(ctx context.Context, id string, params store.UpdateDefinitionOfDoneItemParams) (*domain.DefinitionOfDoneItem, error) {
	sets := map[string]any{}
	if params.Description != nil {
		sets["description"] = *params.Description
	}
	if params.IsChecked != nil {
		sets["isChecked"] = *params.IsChecked
	}
	n, err := s.setNodeFields(ctx, "DefinitionOfDoneItem", "d", id, sets)
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update definition of done item: %w", err)
	}
	return nodeToDefinitionOfDoneItem(n)
}

func (s *Neo4jStore) DeleteDefinitionOfDoneItem(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "DefinitionOfDoneItem", id)
}

func (s *Neo4jStore) ListDefinitionOfDoneItems(ctx context.Context, specID string) ([]*domain.DefinitionOfDoneItem, error) {
	nodes, err := s.listOrdinalChildren(ctx, "Spec", specID, "HAS_DOD_ITEM", "DefinitionOfDoneItem", "d")
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list definition of done items: %w", err)
	}
	out := make([]*domain.DefinitionOfDoneItem, 0, len(nodes))
	for _, n := range nodes {
		item, err := nodeToDefinitionOfDoneItem(n)
		if err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, nil
}
