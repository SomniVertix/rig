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

func (s *Neo4jStore) CreateSpec(ctx context.Context, params store.CreateSpecParams) (*domain.Spec, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	id := uuid.NewString()

	cypher := `
		CREATE (s:Spec {
			id: $id, workspaceId: $workspaceId, slug: $slug, featureName: $featureName,
			requirementsOverview: "", requirementsStageStatus: $notStarted,
			requirementsDeniedAt: NULL, requirementsLastDenialReason: NULL,
			designOverview: "", designArchitecture: "", designDataModelOverview: NULL,
			designStageStatus: $notStarted, designDeniedAt: NULL, designLastDenialReason: NULL,
			implementationStageStatus: $notStarted, implementationDeniedAt: NULL, implementationLastDenialReason: NULL,
			createdAt: $now, updatedAt: $now
		})
		RETURN s`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"id":          id,
			"workspaceId": params.WorkspaceID,
			"slug":        params.Slug,
			"featureName": params.FeatureName,
			"notStarted":  string(domain.SpecStageNotStarted),
			"now":         now,
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: create spec: %w", err)
	}
	n, ok := singleNode(rec, "s")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: create spec: no node returned")
	}
	return nodeToSpec(n)
}

func (s *Neo4jStore) GetSpec(ctx context.Context, id string) (*domain.Spec, error) {
	return s.getSpecBy(ctx, "id", id)
}

func (s *Neo4jStore) GetSpecBySlug(ctx context.Context, workspaceID, slug string) (*domain.Spec, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, "MATCH (s:Spec {workspaceId: $workspaceId, slug: $slug}) RETURN s", map[string]any{
			"workspaceId": workspaceID,
			"slug":        slug,
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
		return nil, fmt.Errorf("neo4jstore: get spec by slug: %w", err)
	}
	if rec == nil {
		return nil, store.ErrNotFound
	}
	n, ok := singleNode(rec, "s")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToSpec(n)
}

func (s *Neo4jStore) getSpecBy(ctx context.Context, prop, value string) (*domain.Spec, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	cypher := fmt.Sprintf("MATCH (s:Spec {%s: $value}) RETURN s", prop)
	rec, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{"value": value})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: get spec: %w", err)
	}
	if rec == nil {
		return nil, store.ErrNotFound
	}
	n, ok := singleNode(rec, "s")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToSpec(n)
}

func (s *Neo4jStore) ListSpecs(ctx context.Context, workspaceID string) ([]*domain.Spec, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, "MATCH (s:Spec {workspaceId: $workspaceId}) RETURN s", map[string]any{"workspaceId": workspaceID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list specs: %w", err)
	}

	specs := make([]*domain.Spec, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "s")
		if !ok {
			continue
		}
		spec, err := nodeToSpec(n)
		if err != nil {
			return nil, err
		}
		specs = append(specs, spec)
	}
	return specs, nil
}

func (s *Neo4jStore) UpdateSpecStageText(ctx context.Context, specID string, params store.UpdateSpecStageTextParams) (*domain.Spec, error) {
	sets := map[string]any{"updatedAt": time.Now().UTC()}
	if params.RequirementsOverview != nil {
		sets["requirementsOverview"] = *params.RequirementsOverview
	}
	if params.DesignOverview != nil {
		sets["designOverview"] = *params.DesignOverview
	}
	if params.DesignArchitecture != nil {
		sets["designArchitecture"] = *params.DesignArchitecture
	}
	if params.DesignDataModelOverview != nil {
		sets["designDataModelOverview"] = *params.DesignDataModelOverview
	}
	return s.updateSpecFields(ctx, specID, sets)
}

func (s *Neo4jStore) updateSpecFields(ctx context.Context, id string, sets map[string]any) (*domain.Spec, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, "MATCH (s:Spec {id: $id}) SET s += $sets RETURN s", map[string]any{
			"id":   id,
			"sets": sets,
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
		return nil, fmt.Errorf("neo4jstore: update spec: %w", err)
	}
	if rec == nil {
		return nil, store.ErrNotFound
	}
	n, ok := singleNode(rec, "s")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToSpec(n)
}

// --- Stage transitions -------------------------------------------------
//
// finalize (not_started -> in_review) and approve/deny (in_review ->
// approved | not_started) mirror v1's finalizeStage/transitionStageStatus:
// deny resets straight to not_started (no separate "denied" status) and
// persists deniedAt/lastDenialReason, without touching any drafted content
// (spec-pipeline-graph.md decision 9). The *business* gates that decide
// whether a finalize/approve/deny is actually allowed (open questions,
// zero-user-stories, orphaned components, ...) live in the service layer —
// these store methods are the raw, ungated transitions it calls after its
// own checks pass.

func (s *Neo4jStore) FinalizeRequirementsStage(ctx context.Context, specID string) (*domain.Spec, error) {
	return s.transitionSpecStage(ctx, specID, "requirementsStageStatus", domain.SpecStageNotStarted, domain.SpecStageInReview, nil, nil)
}

func (s *Neo4jStore) ApproveRequirementsStage(ctx context.Context, specID string) (*domain.Spec, error) {
	return s.transitionSpecStage(ctx, specID, "requirementsStageStatus", domain.SpecStageInReview, domain.SpecStageApproved, nil, nil)
}

func (s *Neo4jStore) DenyRequirementsStage(ctx context.Context, specID, reason string) (*domain.Spec, error) {
	return s.transitionSpecStage(ctx, specID, "requirementsStageStatus", domain.SpecStageInReview, domain.SpecStageNotStarted, &reason, boolPtr(true))
}

// FinalizeDesignStage moves design not_started -> in_review and, in the
// same write, seeds one TasksDoc per DesignComponent that doesn't already
// have one — mirroring v1's seed_component_tasks_docs trigger (insert-only,
// idempotent: never deletes or duplicates a doc). This is the only place
// TasksDoc creation happens.
func (s *Neo4jStore) FinalizeDesignStage(ctx context.Context, specID string) (*domain.Spec, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	// The OPTIONAL MATCH + immediately-following WHERE is folded into the
	// pattern itself (no intervening WITH), so a spec with zero components,
	// or none needing a doc, still yields one row with c bound to null —
	// collect(c) then naturally yields [] and FOREACH does nothing, rather
	// than the whole row (and the transitioned spec) silently vanishing.
	cypher := `
		MATCH (spec:Spec {id: $id})
		WHERE spec.designStageStatus = $from
		SET spec.designStageStatus = $to, spec.designDeniedAt = NULL, spec.designLastDenialReason = NULL, spec.updatedAt = $now
		WITH spec
		OPTIONAL MATCH (spec)-[:HAS_COMPONENT]->(c:DesignComponent)
		WHERE NOT EXISTS { (c)-[:HAS_TASKS_DOC]->(:TasksDoc) }
		WITH spec, collect(c) AS toSeed
		FOREACH (comp IN toSeed |
			CREATE (t:TasksDoc {
				id: randomUUID(), specId: spec.id, designComponentId: comp.id,
				componentSlug: comp.slug, componentName: comp.displayName,
				status: $notStarted, deniedAt: NULL, lastDenialReason: NULL,
				createdAt: $now, updatedAt: $now
			})
			CREATE (comp)-[:HAS_TASKS_DOC]->(t)
		)
		RETURN spec`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"id": specID, "from": string(domain.SpecStageNotStarted), "to": string(domain.SpecStageInReview),
			"notStarted": string(domain.SpecStageNotStarted), "now": now,
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
		return nil, fmt.Errorf("neo4jstore: finalize design stage: %w", err)
	}
	if rec == nil {
		if _, err := s.GetSpec(ctx, specID); err != nil {
			return nil, fmt.Errorf("neo4jstore: finalize design stage: %w", err)
		}
		return nil, fmt.Errorf("neo4jstore: finalize design stage: %w: not in %q status", store.ErrConflict, domain.SpecStageNotStarted)
	}
	n, ok := singleNode(rec, "spec")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToSpec(n)
}

func (s *Neo4jStore) ApproveDesignStage(ctx context.Context, specID string) (*domain.Spec, error) {
	return s.transitionSpecStage(ctx, specID, "designStageStatus", domain.SpecStageInReview, domain.SpecStageApproved, nil, nil)
}

func (s *Neo4jStore) DenyDesignStage(ctx context.Context, specID, reason string) (*domain.Spec, error) {
	return s.transitionSpecStage(ctx, specID, "designStageStatus", domain.SpecStageInReview, domain.SpecStageNotStarted, &reason, boolPtr(true))
}

func (s *Neo4jStore) FinalizeImplementationStage(ctx context.Context, specID string) (*domain.Spec, error) {
	return s.transitionSpecStage(ctx, specID, "implementationStageStatus", domain.SpecStageNotStarted, domain.SpecStageInReview, nil, nil)
}

func (s *Neo4jStore) ApproveImplementationStage(ctx context.Context, specID string) (*domain.Spec, error) {
	return s.transitionSpecStage(ctx, specID, "implementationStageStatus", domain.SpecStageInReview, domain.SpecStageApproved, nil, nil)
}

func (s *Neo4jStore) DenyImplementationStage(ctx context.Context, specID, reason string) (*domain.Spec, error) {
	return s.transitionSpecStage(ctx, specID, "implementationStageStatus", domain.SpecStageInReview, domain.SpecStageNotStarted, &reason, boolPtr(true))
}

// transitionSpecStage moves the named status property from "from" to "to",
// atomically checking the precondition in the same MATCH/WHERE — a status
// that's already moved on (e.g. a concurrent finalize) fails as
// store.ErrConflict rather than silently double-applying. denied non-nil
// means this transition is a deny: it also stamps the paired
// "<field>DeniedAt"/"<field>LastDenialReason" properties (derived from
// statusField's "requirements"/"design" prefix); an approve/finalize clears
// them back to NULL.
func (s *Neo4jStore) transitionSpecStage(ctx context.Context, specID, statusField string, from, to domain.SpecStageStatus, reason *string, denied *bool) (*domain.Spec, error) {
	var prefix string
	switch statusField {
	case "designStageStatus":
		prefix = "design"
	case "implementationStageStatus":
		prefix = "implementation"
	default:
		prefix = "requirements"
	}
	deniedAtField := prefix + "DeniedAt"
	reasonField := prefix + "LastDenialReason"

	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	var deniedAt any
	var reasonVal any
	if denied != nil && *denied {
		deniedAt = now
		if reason != nil {
			reasonVal = *reason
		}
	}

	cypher := fmt.Sprintf(`
		MATCH (s:Spec {id: $id})
		WHERE s.%s = $from
		SET s.%s = $to, s.%s = $deniedAt, s.%s = $reasonVal, s.updatedAt = $now
		RETURN s`, statusField, statusField, deniedAtField, reasonField)

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"id":        specID,
			"from":      string(from),
			"to":        string(to),
			"deniedAt":  deniedAt,
			"reasonVal": reasonVal,
			"now":       now,
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
		return nil, fmt.Errorf("neo4jstore: transition spec stage: %w", err)
	}
	if rec == nil {
		if _, err := s.GetSpec(ctx, specID); err != nil {
			return nil, fmt.Errorf("neo4jstore: transition spec stage: %w", err)
		}
		return nil, fmt.Errorf("neo4jstore: transition spec stage: %w: not in %q status", store.ErrConflict, from)
	}
	n, ok := singleNode(rec, "s")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToSpec(n)
}

func boolPtr(b bool) *bool { return &b }
