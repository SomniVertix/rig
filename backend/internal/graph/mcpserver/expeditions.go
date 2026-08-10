package mcpserver

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

func registerExpeditionTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "create_expedition",
		Description: "Create an expedition: one effort to turn a loose idea into a destination.",
	}, createExpedition(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_expeditions",
		Description: "List a workspace's expeditions, each row carrying the same origin lineage get_expedition_lineage returns, so the lineage tree is browsable without a get_expedition per expedition.",
	}, listExpeditions(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_expedition",
		Description: "Get an expedition's computed live view: origin, decisions (reached), frontier (workable now), rehydrating (redos pending), fog (sighted), outOfScope (bypassed), spurs, claimed, terms, flags (unresolved, targeting this expedition's waypoints), and dependency edges.",
	}, getExpedition(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_expedition_by_spec",
		Description: "Get the same live view as get_expedition, looked up by the spec id it completed with (outcomeSpecId).",
	}, getExpeditionBySpec(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_expedition_lineage",
		Description: "Get an expedition's single parent edge: the session that chartered it, or the waypoint that spurred it. Null origin if neither.",
	}, getExpeditionLineage(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_expedition",
		Description: "Update an expedition's title, destination, and/or notes.",
	}, updateExpedition(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "complete_expedition",
		Description: "End an expedition: the way is clear, nothing left to decide. outcomeKind \"decision\"/\"change\" take an outcomeSummary. outcomeKind \"spec\" takes specSlug+featureName instead, creating the spec and linking it (expedition.outcomeSpecId) in one call — this is the only way a spec gets created; there is no standalone create_spec tool.",
	}, completeExpedition(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "abandon_expedition",
		Description: "Abandon an expedition: the effort is dropped short of the destination.",
	}, abandonExpedition(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "reopen_expedition",
		Description: "Restore a complete or abandoned expedition to active. outcomeKind/outcomeSpecId survive the reopen as a record of the prior completion; only outcomeSummary clears.",
	}, reopenExpedition(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "get_workspace_status",
		Description: "One-call replacement for the wayfinder skill's Status mode: every expedition in the workspace, " +
			"each row carrying its origin lineage same as list_expeditions. Expeditions-only for now — v2 has no spec " +
			"pipeline yet, so the response's specsNote explains why no spec data is included; see list_specs/get_spec.",
	}, getWorkspaceStatus(svc))
}

// --- shared helpers ---

type originOut struct {
	Kind       string  `json:"kind"`
	SessionID  *string `json:"sessionId,omitempty"`
	WaypointID *string `json:"waypointId,omitempty"`
	HandoffID  *string `json:"handoffId,omitempty"`
}

func buildOrigin(ctx context.Context, svc *service.Service, expeditionID string) (*originOut, error) {
	lineage, err := svc.GetExpeditionLineage(ctx, expeditionID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, nil
		}
		return nil, fmt.Errorf("get expedition lineage: %w", err)
	}
	return &originOut{
		Kind:       string(lineage.ParentKind),
		SessionID:  lineage.ParentSessionID,
		WaypointID: lineage.ParentWaypointID,
		HandoffID:  lineage.ParentHandoffID,
	}, nil
}

type decisionOut struct {
	WaypointID     string `json:"waypointId"`
	Number         int    `json:"number"`
	Title          string `json:"title"`
	ResolutionGist string `json:"resolutionGist,omitempty"`
}

type spurOut struct {
	WaypointID        string `json:"waypointId"`
	Number            int    `json:"number"`
	Title             string `json:"title"`
	ChildExpeditionID string `json:"childExpeditionId"`
}

// termOut is the wire shape of an ExpeditionTerm. ID is required so a
// caller can round-trip a listed term into update_expedition_term.
type termOut struct {
	ID           string `json:"id"`
	ExpeditionID string `json:"expeditionId"`
	Term         string `json:"term"`
	Definition   string `json:"definition"`
}

func newTermOut(t *domain.ExpeditionTerm) termOut {
	return termOut{ID: t.ID, ExpeditionID: t.ExpeditionID, Term: t.Term, Definition: t.Definition}
}

func newTermOuts(ts []*domain.ExpeditionTerm) []termOut {
	outs := make([]termOut, len(ts))
	for i, t := range ts {
		outs[i] = newTermOut(t)
	}
	return outs
}

type expeditionMapOut struct {
	Expedition  expeditionOut `json:"expedition"`
	Origin      *originOut    `json:"origin,omitempty"`
	Decisions   []decisionOut `json:"decisions"`
	Frontier    []waypointOut `json:"frontier"`
	Rehydrating []waypointOut `json:"rehydrating"`
	Fog         []waypointOut `json:"fog"`
	OutOfScope  []waypointOut `json:"outOfScope"`
	Spurs       []spurOut     `json:"spurs"`
	Claimed     []waypointOut `json:"claimed"`
	Terms       []termOut     `json:"terms"`
	Flags       []flagOut     `json:"flags"`
	Edges       []edgeOut     `json:"edges"`
}

func buildExpeditionMap(ctx context.Context, svc *service.Service, e *domain.Expedition) (expeditionMapOut, error) {
	waypoints, err := svc.ListWaypoints(ctx, e.ID)
	if err != nil {
		return expeditionMapOut{}, fmt.Errorf("list waypoints: %w", err)
	}
	frontierWPs, err := svc.GetFrontier(ctx, e.ID)
	if err != nil {
		return expeditionMapOut{}, fmt.Errorf("get frontier: %w", err)
	}
	edges, err := svc.ListWaypointDependencies(ctx, e.ID)
	if err != nil {
		return expeditionMapOut{}, fmt.Errorf("list waypoint dependencies: %w", err)
	}
	origin, err := buildOrigin(ctx, svc, e.ID)
	if err != nil {
		return expeditionMapOut{}, err
	}
	flags, err := svc.ListUnresolvedFlagsForExpedition(ctx, e.ID)
	if err != nil {
		return expeditionMapOut{}, fmt.Errorf("list unresolved flags: %w", err)
	}
	terms, err := svc.ListExpeditionTerms(ctx, e.ID)
	if err != nil {
		return expeditionMapOut{}, fmt.Errorf("list expedition terms: %w", err)
	}

	frontierIDs := make(map[string]bool, len(frontierWPs))
	for _, w := range frontierWPs {
		frontierIDs[w.ID] = true
	}

	m := expeditionMapOut{
		Expedition:  newExpeditionOut(e),
		Origin:      origin,
		Edges:       newEdgeOuts(edges),
		Decisions:   []decisionOut{},
		Frontier:    []waypointOut{},
		Rehydrating: []waypointOut{},
		Fog:         []waypointOut{},
		OutOfScope:  []waypointOut{},
		Spurs:       []spurOut{},
		Claimed:     []waypointOut{},
		Terms:       newTermOuts(terms),
		Flags:       newFlagOuts(flags),
	}

	for _, w := range waypoints {
		switch w.Status {
		case domain.WaypointReached:
			d := decisionOut{WaypointID: w.ID, Number: w.WaypointNumber, Title: w.Title}
			if w.ResolutionGist != nil {
				d.ResolutionGist = *w.ResolutionGist
			}
			m.Decisions = append(m.Decisions, d)
			if w.SpurredToExpeditionID != nil {
				m.Spurs = append(m.Spurs, spurOut{
					WaypointID: w.ID, Number: w.WaypointNumber, Title: w.Title,
					ChildExpeditionID: *w.SpurredToExpeditionID,
				})
			}
		case domain.WaypointBypassed:
			m.OutOfScope = append(m.OutOfScope, newWaypointOut(w))
		case domain.WaypointRehydrating:
			m.Rehydrating = append(m.Rehydrating, newWaypointOut(w))
		case domain.WaypointSighted:
			m.Fog = append(m.Fog, newWaypointOut(w))
		case domain.WaypointClaimed:
			m.Claimed = append(m.Claimed, newWaypointOut(w))
		}
		if frontierIDs[w.ID] {
			m.Frontier = append(m.Frontier, newWaypointOut(w))
		}
	}

	return m, nil
}

// --- tools ---

type expeditionResultOut struct {
	Expedition expeditionOut `json:"expedition"`
}

type createExpeditionIn struct {
	WorkspaceID     string  `json:"workspaceId" jsonschema:"the resolved rig workspace id, from resolve_workspace_id"`
	Slug            string  `json:"slug" jsonschema:"kebab-case expedition slug, unique per workspace"`
	Title           string  `json:"title" jsonschema:"short human title"`
	BriefingPrompt  string  `json:"briefingPrompt" jsonschema:"the user's initial ask, largely verbatim"`
	Destination     *string `json:"destination,omitempty" jsonschema:"what reaching the end looks like, one or two lines every session orients to"`
	Notes           *string `json:"notes,omitempty" jsonschema:"domain, skills every session should consult, standing preferences for this effort"`
	SessionID       *string `json:"sessionId,omitempty" jsonschema:"this invocation's start_session id, if the expedition is being chartered by a session"`
	OriginHandoffID *string `json:"originHandoffId,omitempty" jsonschema:"handoff id, if the expedition is being chartered from a handoff via create_expedition(originHandoffId=...)"`
}

func createExpedition(svc *service.Service) func(context.Context, *mcp.CallToolRequest, createExpeditionIn) (*mcp.CallToolResult, expeditionResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in createExpeditionIn) (*mcp.CallToolResult, expeditionResultOut, error) {
		params := store.CreateExpeditionParams{
			WorkspaceID:    in.WorkspaceID,
			Slug:           in.Slug,
			Title:          in.Title,
			BriefingPrompt: in.BriefingPrompt,
			Destination:    in.Destination,
			Notes:          in.Notes,
			SessionID:      in.SessionID,
		}

		var e *domain.Expedition
		var err error
		if in.OriginHandoffID != nil {
			e, err = svc.CreateExpeditionFromHandoff(ctx, *in.OriginHandoffID, params)
		} else {
			e, err = svc.CreateExpedition(ctx, params)
		}
		if err != nil {
			return nil, expeditionResultOut{}, err
		}
		return nil, expeditionResultOut{Expedition: newExpeditionOut(e)}, nil
	}
}

type listExpeditionsIn struct {
	WorkspaceID string  `json:"workspaceId" jsonschema:"the resolved rig workspace id, from resolve_workspace_id"`
	Status      *string `json:"status,omitempty" jsonschema:"filter: active | complete | abandoned"`
}

type expeditionListRowOut struct {
	expeditionOut
	Origin *originOut `json:"origin,omitempty"`
}

type listExpeditionsOut struct {
	Expeditions []expeditionListRowOut `json:"expeditions"`
}

func listExpeditions(svc *service.Service) func(context.Context, *mcp.CallToolRequest, listExpeditionsIn) (*mcp.CallToolResult, listExpeditionsOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in listExpeditionsIn) (*mcp.CallToolResult, listExpeditionsOut, error) {
		params := store.ListExpeditionsParams{WorkspaceID: in.WorkspaceID}
		if in.Status != nil {
			status := domain.ExpeditionStatus(*in.Status)
			params.Status = &status
		}
		rows, err := buildExpeditionListRows(ctx, svc, params)
		if err != nil {
			return nil, listExpeditionsOut{}, err
		}
		return nil, listExpeditionsOut{Expeditions: rows}, nil
	}
}

// buildExpeditionListRows fetches a workspace's expeditions and enriches each
// with its origin lineage — the shared row-building step behind both
// list_expeditions and get_workspace_status.
func buildExpeditionListRows(ctx context.Context, svc *service.Service, params store.ListExpeditionsParams) ([]expeditionListRowOut, error) {
	expeditions, err := svc.ListExpeditions(ctx, params)
	if err != nil {
		return nil, err
	}
	rows := make([]expeditionListRowOut, len(expeditions))
	for i, e := range expeditions {
		origin, err := buildOrigin(ctx, svc, e.ID)
		if err != nil {
			return nil, err
		}
		rows[i] = expeditionListRowOut{expeditionOut: newExpeditionOut(e), Origin: origin}
	}
	return rows, nil
}

const specsNotAvailableNote = "the spec pipeline is implemented (list_specs/get_spec are real, Neo4j-backed calls), " +
	"but this tool doesn't aggregate spec rows into its response yet — this response carries expeditions only. " +
	"Call list_specs separately if spec status is needed alongside this."

type workspaceStatusIn struct {
	WorkspaceID string `json:"workspaceId" jsonschema:"the resolved rig workspace id, from resolve_workspace_id"`
}

type handoffStatusRowOut struct {
	ID                      string    `json:"id"`
	Title                   string    `json:"title"`
	Type                    string    `json:"type"`
	Status                  string    `json:"status"`
	Direction               string    `json:"direction" jsonschema:"inbound or outbound relative to this workspace"`
	CounterpartyWorkspaceID string    `json:"counterpartyWorkspaceId"`
	SentAt                  time.Time `json:"sentAt"`
	HasConversation         bool      `json:"hasConversation"`
}

type workspaceStatusOut struct {
	Expeditions []expeditionListRowOut `json:"expeditions"`
	Handoffs    []handoffStatusRowOut  `json:"handoffs"`
	SpecsNote   string                 `json:"specsNote" jsonschema:"why no specs are included: this tool doesn't aggregate them yet, not that the pipeline is unimplemented"`
}

func getWorkspaceStatus(svc *service.Service) func(context.Context, *mcp.CallToolRequest, workspaceStatusIn) (*mcp.CallToolResult, workspaceStatusOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in workspaceStatusIn) (*mcp.CallToolResult, workspaceStatusOut, error) {
		rows, err := buildExpeditionListRows(ctx, svc, store.ListExpeditionsParams{WorkspaceID: in.WorkspaceID})
		if err != nil {
			return nil, workspaceStatusOut{}, err
		}

		// List handoffs in both directions, pending+read only
		handoffRows, err := buildHandoffStatusRows(ctx, svc, in.WorkspaceID)
		if err != nil {
			return nil, workspaceStatusOut{}, err
		}

		return nil, workspaceStatusOut{Expeditions: rows, Handoffs: handoffRows, SpecsNote: specsNotAvailableNote}, nil
	}
}

func buildHandoffStatusRows(ctx context.Context, svc *service.Service, workspaceID string) ([]handoffStatusRowOut, error) {
	// One call, unfiltered by status — get_workspace_status must stay a
	// single svc.ListHandoffs round-trip (the wayfinder skill's "Status mode
	// is a single call, not a fan-out" rule), so pending/read filtering
	// happens client-side below rather than as two separate status-filtered
	// calls.
	allHandoffs, err := svc.ListHandoffs(ctx, store.ListHandoffsParams{
		WorkspaceID: workspaceID,
		Direction:   string(store.HandoffDirectionBoth),
	})
	if err != nil {
		return nil, fmt.Errorf("list handoffs: %w", err)
	}

	var rows []handoffStatusRowOut
	for _, h := range allHandoffs {
		if h.Status != string(domain.HandoffStatusPending) && h.Status != string(domain.HandoffStatusRead) {
			continue
		}

		// Determine direction relative to this workspace
		var direction string
		var counterparty string
		if h.TargetWorkspaceID == workspaceID {
			direction = "inbound"
			counterparty = h.SourceWorkspaceID
		} else {
			direction = "outbound"
			counterparty = h.TargetWorkspaceID
		}

		// Check if handoff has a conversation. store.ErrNotFound means no —
		// any other error must propagate, not be silently reported as false.
		_, err := svc.GetHandoffConversationByHandoff(ctx, h.ID)
		hasConversation := false
		switch {
		case err == nil:
			hasConversation = true
		case err == store.ErrNotFound:
			hasConversation = false
		default:
			return nil, fmt.Errorf("check conversation for handoff %s: %w", h.ID, err)
		}

		rows = append(rows, handoffStatusRowOut{
			ID:                      h.ID,
			Title:                   h.Title,
			Type:                    h.Type,
			Status:                  h.Status,
			Direction:               direction,
			CounterpartyWorkspaceID: counterparty,
			SentAt:                  h.SentAt,
			HasConversation:         hasConversation,
		})
	}

	return rows, nil
}

type expeditionIDIn struct {
	ExpeditionID string `json:"expeditionId" jsonschema:"the expedition's id, from create_expedition/list_expeditions"`
}

func getExpedition(svc *service.Service) func(context.Context, *mcp.CallToolRequest, expeditionIDIn) (*mcp.CallToolResult, expeditionMapOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in expeditionIDIn) (*mcp.CallToolResult, expeditionMapOut, error) {
		e, err := svc.GetExpedition(ctx, in.ExpeditionID)
		if err != nil {
			return nil, expeditionMapOut{}, err
		}
		m, err := buildExpeditionMap(ctx, svc, e)
		if err != nil {
			return nil, expeditionMapOut{}, err
		}
		return nil, m, nil
	}
}

type specIDIn struct {
	SpecID string `json:"specId" jsonschema:"the linked spec's id (an expedition's outcomeSpecId)"`
}

func getExpeditionBySpec(svc *service.Service) func(context.Context, *mcp.CallToolRequest, specIDIn) (*mcp.CallToolResult, expeditionMapOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in specIDIn) (*mcp.CallToolResult, expeditionMapOut, error) {
		e, err := svc.GetExpeditionBySpec(ctx, in.SpecID)
		if err != nil {
			return nil, expeditionMapOut{}, err
		}
		m, err := buildExpeditionMap(ctx, svc, e)
		if err != nil {
			return nil, expeditionMapOut{}, err
		}
		return nil, m, nil
	}
}

type lineageOut struct {
	Origin *originOut `json:"origin,omitempty"`
}

func getExpeditionLineage(svc *service.Service) func(context.Context, *mcp.CallToolRequest, expeditionIDIn) (*mcp.CallToolResult, lineageOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in expeditionIDIn) (*mcp.CallToolResult, lineageOut, error) {
		origin, err := buildOrigin(ctx, svc, in.ExpeditionID)
		if err != nil {
			return nil, lineageOut{}, err
		}
		return nil, lineageOut{Origin: origin}, nil
	}
}

type updateExpeditionIn struct {
	ExpeditionID string  `json:"expeditionId" jsonschema:"the expedition's id"`
	Title        *string `json:"title,omitempty"`
	Destination  *string `json:"destination,omitempty"`
	Notes        *string `json:"notes,omitempty"`
}

func updateExpedition(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateExpeditionIn) (*mcp.CallToolResult, expeditionResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateExpeditionIn) (*mcp.CallToolResult, expeditionResultOut, error) {
		e, err := svc.UpdateExpedition(ctx, in.ExpeditionID, store.UpdateExpeditionParams{
			Title: in.Title, Destination: in.Destination, Notes: in.Notes,
		})
		if err != nil {
			return nil, expeditionResultOut{}, err
		}
		return nil, expeditionResultOut{Expedition: newExpeditionOut(e)}, nil
	}
}

type completeExpeditionIn struct {
	ExpeditionID   string  `json:"expeditionId" jsonschema:"the expedition's id"`
	OutcomeKind    string  `json:"outcomeKind" jsonschema:"decision | change | spec"`
	OutcomeSummary *string `json:"outcomeSummary,omitempty" jsonschema:"required for outcomeKind decision/change: what was decided or changed"`
	SpecSlug       *string `json:"specSlug,omitempty" jsonschema:"outcomeKind spec only, required: kebab-case slug for the new spec"`
	FeatureName    *string `json:"featureName,omitempty" jsonschema:"outcomeKind spec only, required: the spec's feature name"`
}

// completeExpedition's outcomeKind:"spec" branch creates the spec and links
// it to the expedition — mirroring v1's completeTrail, which did both in
// one Postgres transaction. Here it's two sequential calls, not one Neo4j
// transaction: a known, already-documented gap (see
// .meta/current/skills/wayfinder/SKILL.md's note that a failure partway
// through can leave a partial result), not something newly introduced by
// this spec-pipeline port.
func completeExpedition(svc *service.Service) func(context.Context, *mcp.CallToolRequest, completeExpeditionIn) (*mcp.CallToolResult, expeditionResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in completeExpeditionIn) (*mcp.CallToolResult, expeditionResultOut, error) {
		params := store.CompleteExpeditionParams{
			OutcomeKind:    domain.ExpeditionOutcomeKind(in.OutcomeKind),
			OutcomeSummary: in.OutcomeSummary,
		}
		if in.OutcomeKind == string(domain.ExpeditionOutcomeSpec) {
			if in.SpecSlug == nil || in.FeatureName == nil {
				return nil, expeditionResultOut{}, fmt.Errorf("mcpserver: complete_expedition outcomeKind \"spec\" requires both specSlug and featureName")
			}
			expedition, err := svc.GetExpedition(ctx, in.ExpeditionID)
			if err != nil {
				return nil, expeditionResultOut{}, err
			}
			spec, err := svc.CreateSpec(ctx, store.CreateSpecParams{
				WorkspaceID: expedition.WorkspaceID, Slug: *in.SpecSlug, FeatureName: *in.FeatureName,
			})
			if err != nil {
				return nil, expeditionResultOut{}, fmt.Errorf("mcpserver: complete_expedition: create spec: %w", err)
			}
			params.OutcomeSpecID = &spec.ID
		}
		e, err := svc.CompleteExpedition(ctx, in.ExpeditionID, params)
		if err != nil {
			return nil, expeditionResultOut{}, err
		}
		return nil, expeditionResultOut{Expedition: newExpeditionOut(e)}, nil
	}
}

func abandonExpedition(svc *service.Service) func(context.Context, *mcp.CallToolRequest, expeditionIDIn) (*mcp.CallToolResult, expeditionResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in expeditionIDIn) (*mcp.CallToolResult, expeditionResultOut, error) {
		e, err := svc.AbandonExpedition(ctx, in.ExpeditionID)
		if err != nil {
			return nil, expeditionResultOut{}, err
		}
		return nil, expeditionResultOut{Expedition: newExpeditionOut(e)}, nil
	}
}

type reopenExpeditionIn struct {
	ExpeditionID string `json:"expeditionId" jsonschema:"the expedition's id"`
	Reason       string `json:"reason" jsonschema:"why the completion/abandonment is being undone; recorded as the expedition's reopenReason"`
}

func reopenExpedition(svc *service.Service) func(context.Context, *mcp.CallToolRequest, reopenExpeditionIn) (*mcp.CallToolResult, expeditionResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in reopenExpeditionIn) (*mcp.CallToolResult, expeditionResultOut, error) {
		e, err := svc.ReopenExpedition(ctx, in.ExpeditionID, in.Reason)
		if err != nil {
			return nil, expeditionResultOut{}, err
		}
		return nil, expeditionResultOut{Expedition: newExpeditionOut(e)}, nil
	}
}
