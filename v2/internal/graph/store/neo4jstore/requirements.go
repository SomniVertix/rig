package neo4jstore

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

func (s *Neo4jStore) AddUserStory(ctx context.Context, params store.AddUserStoryParams) (*domain.UserStory, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	id := uuid.NewString()
	cypher := `
		MATCH (spec:Spec {id: $specId})
		OPTIONAL MATCH (spec)-[:HAS_USER_STORY]->(existing:UserStory)
		WITH spec, coalesce(max(existing.storyNumber), 0) + 1 AS nextNumber
		CREATE (u:UserStory {
			id: $id, specId: $specId, storyNumber: nextNumber,
			title: $title, role: $role, capability: $capability,
			benefit: $benefit, rationale: $rationale
		})
		CREATE (spec)-[:HAS_USER_STORY]->(u)
		RETURN u`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"specId": params.SpecID, "id": id, "title": params.Title,
			"role": params.Role, "capability": params.Capability,
			"benefit": params.Benefit, "rationale": params.Rationale,
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add user story: %w", err)
	}
	n, ok := singleNode(rec, "u")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: add user story: spec %s not found", params.SpecID)
	}
	return nodeToUserStory(n)
}

func (s *Neo4jStore) GetUserStory(ctx context.Context, id string) (*domain.UserStory, error) {
	n, err := s.getNodeByID(ctx, "UserStory", "u", id)
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: get user story: %w", err)
	}
	return nodeToUserStory(n)
}

func (s *Neo4jStore) ListUserStories(ctx context.Context, specID string) ([]*domain.UserStory, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:Spec {id: $specId})-[:HAS_USER_STORY]->(u:UserStory)
			RETURN u ORDER BY u.storyNumber`, map[string]any{"specId": specID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list user stories: %w", err)
	}
	stories := make([]*domain.UserStory, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "u")
		if !ok {
			continue
		}
		story, err := nodeToUserStory(n)
		if err != nil {
			return nil, err
		}
		stories = append(stories, story)
	}
	return stories, nil
}

func (s *Neo4jStore) UpdateUserStory(ctx context.Context, id string, params store.UpdateUserStoryParams) (*domain.UserStory, error) {
	sets := map[string]any{}
	if params.Title != nil {
		sets["title"] = *params.Title
	}
	if params.Role != nil {
		sets["role"] = *params.Role
	}
	if params.Capability != nil {
		sets["capability"] = *params.Capability
	}
	if params.Benefit != nil {
		sets["benefit"] = *params.Benefit
	}
	if params.Rationale != nil {
		sets["rationale"] = *params.Rationale
	}
	n, err := s.setNodeFields(ctx, "UserStory", "u", id, sets)
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update user story: %w", err)
	}
	return nodeToUserStory(n)
}

func (s *Neo4jStore) DeleteUserStory(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "UserStory", id)
}

func (s *Neo4jStore) AddAcceptanceCriterion(ctx context.Context, params store.AddAcceptanceCriterionParams) (*domain.AcceptanceCriterion, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	id := uuid.NewString()
	cypher := `
		MATCH (u:UserStory {id: $userStoryId})
		OPTIONAL MATCH (u)-[:HAS_CRITERION]->(existing:AcceptanceCriterion)
		WITH u, coalesce(max(existing.criterionNumber), 0) + 1 AS nextNumber
		CREATE (a:AcceptanceCriterion {
			id: $id, userStoryId: $userStoryId, criterionNumber: nextNumber,
			earsPattern: $earsPattern, triggerClause: $triggerClause,
			conditionClause: $conditionClause, stateClause: $stateClause,
			responseClause: $responseClause, fullText: $fullText
		})
		CREATE (u)-[:HAS_CRITERION]->(a)
		RETURN a`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"userStoryId":     params.UserStoryID,
			"id":              id,
			"earsPattern":     string(params.EarsPattern),
			"triggerClause":   derefStr(params.TriggerClause),
			"conditionClause": derefStr(params.ConditionClause),
			"stateClause":     derefStr(params.StateClause),
			"responseClause":  params.ResponseClause,
			"fullText":        params.FullText,
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add acceptance criterion: %w", err)
	}
	n, ok := singleNode(rec, "a")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: add acceptance criterion: user story %s not found", params.UserStoryID)
	}
	return nodeToAcceptanceCriterion(n)
}

func (s *Neo4jStore) GetAcceptanceCriterion(ctx context.Context, id string) (*domain.AcceptanceCriterion, error) {
	n, err := s.getNodeByID(ctx, "AcceptanceCriterion", "a", id)
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: get acceptance criterion: %w", err)
	}
	return nodeToAcceptanceCriterion(n)
}

func (s *Neo4jStore) ListAcceptanceCriteria(ctx context.Context, userStoryID string) ([]*domain.AcceptanceCriterion, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:UserStory {id: $userStoryId})-[:HAS_CRITERION]->(a:AcceptanceCriterion)
			RETURN a ORDER BY a.criterionNumber`, map[string]any{"userStoryId": userStoryID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list acceptance criteria: %w", err)
	}
	criteria := make([]*domain.AcceptanceCriterion, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "a")
		if !ok {
			continue
		}
		c, err := nodeToAcceptanceCriterion(n)
		if err != nil {
			return nil, err
		}
		criteria = append(criteria, c)
	}
	return criteria, nil
}

func (s *Neo4jStore) UpdateAcceptanceCriterion(ctx context.Context, id string, params store.UpdateAcceptanceCriterionParams) (*domain.AcceptanceCriterion, error) {
	sets := map[string]any{}
	if params.EarsPattern != nil {
		sets["earsPattern"] = string(*params.EarsPattern)
	}
	if params.TriggerClause != nil {
		sets["triggerClause"] = *params.TriggerClause
	}
	if params.ConditionClause != nil {
		sets["conditionClause"] = *params.ConditionClause
	}
	if params.StateClause != nil {
		sets["stateClause"] = *params.StateClause
	}
	if params.ResponseClause != nil {
		sets["responseClause"] = *params.ResponseClause
	}
	if params.FullText != nil {
		sets["fullText"] = *params.FullText
	}
	n, err := s.setNodeFields(ctx, "AcceptanceCriterion", "a", id, sets)
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update acceptance criterion: %w", err)
	}
	return nodeToAcceptanceCriterion(n)
}

func (s *Neo4jStore) DeleteAcceptanceCriterion(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "AcceptanceCriterion", id)
}

func (s *Neo4jStore) AddNonGoal(ctx context.Context, specID, description string) (*domain.NonGoal, error) {
	n, err := s.addOrdinalChild(ctx, "Spec", specID, "HAS_NON_GOAL", "NonGoal", "n", map[string]any{"specId": specID, "description": description})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add non goal: %w", err)
	}
	return nodeToNonGoal(n)
}

func (s *Neo4jStore) UpdateNonGoal(ctx context.Context, id, description string) (*domain.NonGoal, error) {
	n, err := s.setNodeFields(ctx, "NonGoal", "n", id, map[string]any{"description": description})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update non goal: %w", err)
	}
	return nodeToNonGoal(n)
}

func (s *Neo4jStore) DeleteNonGoal(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "NonGoal", id)
}

func (s *Neo4jStore) ListNonGoals(ctx context.Context, specID string) ([]*domain.NonGoal, error) {
	records, err := s.listOrdinalChildren(ctx, "Spec", specID, "HAS_NON_GOAL", "NonGoal", "n")
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list non goals: %w", err)
	}
	out := make([]*domain.NonGoal, 0, len(records))
	for _, n := range records {
		g, err := nodeToNonGoal(n)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, nil
}

func (s *Neo4jStore) AddGlossaryTerm(ctx context.Context, params store.AddGlossaryTermParams) (*domain.GlossaryTerm, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	id := uuid.NewString()
	cypher := `
		MATCH (spec:Spec {id: $specId})
		CREATE (g:GlossaryTerm {
			id: $id, specId: $specId, term: $term,
			definition: $definition, externalReference: $externalReference
		})
		CREATE (spec)-[:HAS_GLOSSARY_TERM]->(g)
		RETURN g`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"specId": params.SpecID, "id": id, "term": params.Term,
			"definition":        derefStr(params.Definition),
			"externalReference": derefStr(params.ExternalReference),
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add glossary term: %w", err)
	}
	n, ok := singleNode(rec, "g")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: add glossary term: spec %s not found", params.SpecID)
	}
	return nodeToGlossaryTerm(n)
}

func (s *Neo4jStore) UpdateGlossaryTerm(ctx context.Context, id string, params store.UpdateGlossaryTermParams) (*domain.GlossaryTerm, error) {
	sets := map[string]any{}
	if params.Definition != nil {
		sets["definition"] = *params.Definition
	}
	if params.ExternalReference != nil {
		sets["externalReference"] = *params.ExternalReference
	}
	n, err := s.setNodeFields(ctx, "GlossaryTerm", "g", id, sets)
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: update glossary term: %w", err)
	}
	return nodeToGlossaryTerm(n)
}

func (s *Neo4jStore) DeleteGlossaryTerm(ctx context.Context, id string) error {
	return s.deleteNodeByID(ctx, "GlossaryTerm", id)
}

func (s *Neo4jStore) ListGlossaryTerms(ctx context.Context, specID string) ([]*domain.GlossaryTerm, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:Spec {id: $specId})-[:HAS_GLOSSARY_TERM]->(g:GlossaryTerm)
			RETURN g ORDER BY g.term`, map[string]any{"specId": specID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list glossary terms: %w", err)
	}
	terms := make([]*domain.GlossaryTerm, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "g")
		if !ok {
			continue
		}
		t, err := nodeToGlossaryTerm(n)
		if err != nil {
			return nil, err
		}
		terms = append(terms, t)
	}
	return terms, nil
}
