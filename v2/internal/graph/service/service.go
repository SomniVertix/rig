// Package service holds the graph service's business logic: validation and
// lifecycle rules that sit above the storage port, kept independent of both
// the HTTP transport and the Neo4j backend.
package service

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// ErrInvalidSlug mirrors v1's trails_slug_is_kebab_case check constraint.
var ErrInvalidSlug = errors.New("service: slug must be kebab-case ([a-z0-9]+(-[a-z0-9]+)*)")

// ErrOutcomeSpecRequired mirrors v1's trails_spec_outcome_has_spec_kind check:
// an outcome_spec_id may only be set alongside outcome kind "spec", and a
// "spec" outcome must carry one.
var ErrOutcomeSpecRequired = errors.New("service: outcome kind \"spec\" requires an outcome spec id")

// Service is the graph service's core: a thin layer over store.Store that
// enforces the lifecycle rules v1 expressed as Postgres constraints and
// canonical hand-written queries.
type Service struct {
	store store.Store
}

// New constructs a Service.
func New(s store.Store) *Service {
	return &Service{store: s}
}

func (svc *Service) CreateExpedition(ctx context.Context, params store.CreateExpeditionParams) (*domain.Expedition, error) {
	if !slugPattern.MatchString(params.Slug) {
		return nil, ErrInvalidSlug
	}
	return svc.store.CreateExpedition(ctx, params)
}

func (svc *Service) GetExpedition(ctx context.Context, id string) (*domain.Expedition, error) {
	return svc.store.GetExpedition(ctx, id)
}

func (svc *Service) GetExpeditionBySpec(ctx context.Context, specID string) (*domain.Expedition, error) {
	return svc.store.GetExpeditionBySpec(ctx, specID)
}

func (svc *Service) ListExpeditions(ctx context.Context, params store.ListExpeditionsParams) ([]*domain.Expedition, error) {
	return svc.store.ListExpeditions(ctx, params)
}

func (svc *Service) UpdateExpedition(ctx context.Context, id string, params store.UpdateExpeditionParams) (*domain.Expedition, error) {
	return svc.store.UpdateExpedition(ctx, id, params)
}

func (svc *Service) CompleteExpedition(ctx context.Context, id string, params store.CompleteExpeditionParams) (*domain.Expedition, error) {
	hasSpec := params.OutcomeSpecID != nil
	if (params.OutcomeKind == domain.ExpeditionOutcomeSpec) != hasSpec {
		return nil, ErrOutcomeSpecRequired
	}
	return svc.store.CompleteExpedition(ctx, id, params)
}

func (svc *Service) AbandonExpedition(ctx context.Context, id string) (*domain.Expedition, error) {
	return svc.store.AbandonExpedition(ctx, id)
}

func (svc *Service) ReopenExpedition(ctx context.Context, id, reason string) (*domain.Expedition, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, fmt.Errorf("service: reopen_expedition requires a non-empty reason")
	}
	return svc.store.ReopenExpedition(ctx, id, reason)
}

func (svc *Service) AddWaypoint(ctx context.Context, expeditionID string, params store.AddWaypointParams) (*domain.Waypoint, error) {
	hasResolution := params.Resolution != nil
	hasGist := params.ResolutionGist != nil
	if hasResolution != hasGist {
		return nil, fmt.Errorf("service: inline resolution requires both resolution and resolutionGist")
	}
	if params.Sighted && hasResolution {
		return nil, fmt.Errorf("service: a sighted waypoint can't be added with an inline resolution")
	}
	return svc.store.AddWaypoint(ctx, expeditionID, params)
}

func (svc *Service) GetWaypoint(ctx context.Context, id string) (*domain.Waypoint, error) {
	return svc.store.GetWaypoint(ctx, id)
}

func (svc *Service) ListWaypoints(ctx context.Context, expeditionID string) ([]*domain.Waypoint, error) {
	return svc.store.ListWaypoints(ctx, expeditionID)
}

func (svc *Service) UpdateWaypoint(ctx context.Context, id string, params store.UpdateWaypointParams) (*domain.Waypoint, error) {
	return svc.store.UpdateWaypoint(ctx, id, params)
}

func (svc *Service) ClaimWaypoint(ctx context.Context, id, claimedBy string) (*domain.Waypoint, error) {
	return svc.store.ClaimWaypoint(ctx, id, claimedBy)
}

func (svc *Service) ReleaseWaypoint(ctx context.Context, id string) (*domain.Waypoint, error) {
	return svc.store.ReleaseWaypoint(ctx, id)
}

func (svc *Service) ReachWaypoint(ctx context.Context, id string, params store.ReachWaypointParams) (*domain.Waypoint, error) {
	return svc.store.ReachWaypoint(ctx, id, params)
}

func (svc *Service) BypassWaypoint(ctx context.Context, id, reason string) (*domain.Waypoint, error) {
	return svc.store.BypassWaypoint(ctx, id, reason)
}

func (svc *Service) UnbypassWaypoint(ctx context.Context, id, reason string) (*domain.Waypoint, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, fmt.Errorf("service: unbypass_waypoint requires a non-empty reason")
	}
	return svc.store.UnbypassWaypoint(ctx, id, reason)
}

func (svc *Service) GetFrontier(ctx context.Context, expeditionID string) ([]*domain.Waypoint, error) {
	return svc.store.GetFrontier(ctx, expeditionID)
}

func (svc *Service) AddWaypointDependency(ctx context.Context, fromWaypointID, toWaypointID string) error {
	return svc.store.AddWaypointDependency(ctx, fromWaypointID, toWaypointID)
}

func (svc *Service) RemoveWaypointDependency(ctx context.Context, fromWaypointID, toWaypointID string) error {
	return svc.store.RemoveWaypointDependency(ctx, fromWaypointID, toWaypointID)
}

func (svc *Service) ListWaypointDependencies(ctx context.Context, expeditionID string) ([]domain.WaypointDependencyEdge, error) {
	return svc.store.ListWaypointDependencies(ctx, expeditionID)
}

func (svc *Service) SpurWaypoint(ctx context.Context, waypointID string, params store.SpurWaypointParams) (*domain.Expedition, error) {
	if !slugPattern.MatchString(params.Slug) {
		return nil, ErrInvalidSlug
	}
	return svc.store.SpurWaypoint(ctx, waypointID, params)
}

func (svc *Service) UnspurWaypoint(ctx context.Context, waypointID, reason string) error {
	if strings.TrimSpace(reason) == "" {
		return fmt.Errorf("service: unspur_waypoint requires a non-empty reason")
	}
	return svc.store.UnspurWaypoint(ctx, waypointID, reason)
}

func (svc *Service) GetExpeditionLineage(ctx context.Context, expeditionID string) (*domain.ExpeditionLineage, error) {
	return svc.store.GetExpeditionLineage(ctx, expeditionID)
}

// StartSession passes straight through to the store, which returns
// store.ErrNotImplemented today — see
// internal/graph/store/neo4jstore/deferred.go. Kept here (rather than
// skipped) so callers go through the same service layer as every other
// operation and get one consistent error shape back.
func (svc *Service) StartSession(ctx context.Context, params store.StartSessionParams) (*domain.Session, error) {
	return svc.store.StartSession(ctx, params)
}

func (svc *Service) AddWaypointAsset(ctx context.Context, waypointID string, params store.AddWaypointAssetParams) (*domain.WaypointAsset, error) {
	hasContent := params.ContentMarkdown != nil
	hasRepo := params.RepoPath != nil
	if hasContent == hasRepo {
		return nil, fmt.Errorf("service: waypoint asset requires exactly one of contentMarkdown or repoPath")
	}
	if params.CommitSHA != nil && !hasRepo {
		return nil, fmt.Errorf("service: commitSha requires repoPath")
	}
	if strings.TrimSpace(params.Kind) == "" {
		return nil, fmt.Errorf("service: waypoint asset requires a non-empty kind")
	}
	if strings.TrimSpace(params.Title) == "" {
		return nil, fmt.Errorf("service: waypoint asset requires a non-empty title")
	}
	return svc.store.AddWaypointAsset(ctx, waypointID, params)
}

func (svc *Service) ListWaypointAssets(ctx context.Context, waypointID string) ([]*domain.WaypointAsset, error) {
	return svc.store.ListWaypointAssets(ctx, waypointID)
}

func (svc *Service) AddExpeditionTerm(ctx context.Context, expeditionID, term, definition string) (*domain.ExpeditionTerm, error) {
	if strings.TrimSpace(term) == "" {
		return nil, fmt.Errorf("service: expedition term requires a non-empty term")
	}
	if strings.TrimSpace(definition) == "" {
		return nil, fmt.Errorf("service: expedition term requires a non-empty definition")
	}
	return svc.store.AddExpeditionTerm(ctx, expeditionID, term, definition)
}

func (svc *Service) UpdateExpeditionTerm(ctx context.Context, id, definition string) (*domain.ExpeditionTerm, error) {
	if strings.TrimSpace(definition) == "" {
		return nil, fmt.Errorf("service: expedition term update requires a non-empty definition")
	}
	return svc.store.UpdateExpeditionTerm(ctx, id, definition)
}

func (svc *Service) ListExpeditionTerms(ctx context.Context, expeditionID string) ([]*domain.ExpeditionTerm, error) {
	return svc.store.ListExpeditionTerms(ctx, expeditionID)
}

func (svc *Service) RehydrateWaypoint(ctx context.Context, id, reason string) (*domain.Waypoint, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, fmt.Errorf("service: rehydrate_waypoint requires a non-empty reason")
	}
	return svc.store.RehydrateWaypoint(ctx, id, reason)
}

func (svc *Service) ListWaypointHistory(ctx context.Context, waypointID string) ([]*domain.WaypointHistoryEntry, error) {
	return svc.store.ListWaypointHistory(ctx, waypointID)
}

func (svc *Service) FlagWaypoint(ctx context.Context, targetWaypointID string, params store.FlagWaypointParams) (*domain.WaypointFlag, error) {
	if strings.TrimSpace(params.Note) == "" {
		return nil, fmt.Errorf("service: flag_waypoint requires a non-empty note")
	}
	return svc.store.FlagWaypoint(ctx, targetWaypointID, params)
}

func (svc *Service) ResolveWaypointFlag(ctx context.Context, flagID, reason string) (*domain.WaypointFlag, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, fmt.Errorf("service: resolve_waypoint_flag requires a non-empty reason")
	}
	return svc.store.ResolveWaypointFlag(ctx, flagID, reason)
}

func (svc *Service) ListWaypointFlags(ctx context.Context, waypointID string) ([]*domain.WaypointFlag, error) {
	return svc.store.ListWaypointFlags(ctx, waypointID)
}

func (svc *Service) ListUnresolvedFlagsForExpedition(ctx context.Context, expeditionID string) ([]*domain.WaypointFlag, error) {
	return svc.store.ListUnresolvedFlagsForExpedition(ctx, expeditionID)
}
