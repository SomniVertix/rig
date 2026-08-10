package mcpserver

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

func registerWaypointTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name: "add_waypoint",
		Description: "Add a waypoint (one question, sized to one agent session) to an expedition. Created marked " +
			"by default — immediately frontier-eligible once unblocked. Pass sighted:true to add it as fog instead " +
			"(sensed but not yet a sharp question); graduate it later via update_waypoint's mark. Pass " +
			"resolution+resolutionGist to add it already reached, for a grilling conversation that resolves a " +
			"question the same breath it's raised — mutually exclusive with sighted.",
	}, addWaypoint(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_waypoints",
		Description: "List every waypoint on an expedition, in waypoint-number order.",
	}, listWaypoints(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_waypoint",
		Description: "Get one waypoint by id, including its full rehydrate history (if any), any flags raised on or by it (both directions, resolved and unresolved), and its attached assets — the zoom-in view get_expedition's map doesn't carry.",
	}, getWaypoint(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "update_waypoint",
		Description: "Update a waypoint's title, question, and/or approach. Pass mark:true to also graduate a " +
			"sighted (fog) waypoint to marked in the same call — sharpen title/question while promoting it. " +
			"Guarded: mark:true errors if the waypoint isn't currently sighted.",
	}, updateWaypoint(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_frontier",
		Description: "Get the frontier: marked or rehydrating waypoints on this expedition whose blockers have all terminated (reached or bypassed) — the edge of the known.",
	}, getFrontier(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "claim_waypoint",
		Description: "Mark a waypoint claimed by a session. A courtesy signal, not a lock: it isn't atomic and " +
			"doesn't expire, and claiming an already-claimed waypoint is not rejected.",
	}, claimWaypoint(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "release_waypoint",
		Description: "Clear a waypoint's claim without resolving it, so the marker doesn't sit stale.",
	}, releaseWaypoint(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "reach_waypoint",
		Description: "Resolve a waypoint: record the decision. Terminal; unblocks dependents.",
	}, reachWaypoint(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "bypass_waypoint",
		Description: "Rule a waypoint out of scope (past the destination). Terminal; unblocks dependents same as reaching it.",
	}, bypassWaypoint(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "unbypass_waypoint",
		Description: "Undo a bypass made in error: restores the waypoint to its exact pre-bypass status, clears the bypass reason, and records why on unbypassReason.",
	}, unbypassWaypoint(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "spur_waypoint",
		Description: "Spin a waypoint off into its own new expedition: creates the child expedition and reaches " +
			"the origin waypoint (recording the lineage edge) in one call. Legal from marked, claimed, or " +
			"rehydrating only, same as reach_waypoint; terminal; unblocks dependents. A waypoint can spur at most " +
			"one expedition.",
	}, spurWaypoint(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "unspur_waypoint",
		Description: "Undo a spur made in error: restores the origin waypoint to marked, removes the lineage edge, and records why on unspurReason. The now-parentless child expedition is reported, not touched.",
	}, unspurWaypoint(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "add_waypoint_dependency",
		Description: "Add a dependency edge: fromWaypointId must terminate (reached or bypassed) before " +
			"toWaypointId is frontier-eligible. Both waypoints must already exist and belong to the same " +
			"expedition. There is no cycle detection — a loop deadlocks every waypoint in it rather than being rejected.",
	}, addWaypointDependency(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "remove_waypoint_dependency",
		Description: "Remove a dependency edge.",
	}, removeWaypointDependency(svc))
}

type waypointResultOut struct {
	Waypoint waypointOut `json:"waypoint"`
}

type addWaypointIn struct {
	ExpeditionID   string  `json:"expeditionId" jsonschema:"the expedition's id"`
	Title          string  `json:"title" jsonschema:"short refer-by-name title, e.g. 'Pick the queue backend'"`
	Question       string  `json:"question" jsonschema:"the sharp question this waypoint drives to a decision"`
	Approach       *string `json:"approach,omitempty" jsonschema:"hint: grilling | research | prototype | task"`
	Sighted        bool    `json:"sighted,omitempty" jsonschema:"add as fog (sensed but not yet sharp) instead of marked; mutually exclusive with resolution"`
	Resolution     *string `json:"resolution,omitempty" jsonschema:"set together with resolutionGist to add this waypoint already reached"`
	ResolutionGist *string `json:"resolutionGist,omitempty" jsonschema:"one-line index entry; required alongside resolution"`
	ReachedIn      *string `json:"reachedIn,omitempty" jsonschema:"provenance session id, only meaningful alongside an inline resolution"`
}

func addWaypoint(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
		params := store.AddWaypointParams{
			Title:          in.Title,
			Question:       in.Question,
			Sighted:        in.Sighted,
			Resolution:     in.Resolution,
			ResolutionGist: in.ResolutionGist,
			ReachedIn:      in.ReachedIn,
		}
		if in.Approach != nil {
			a := domain.WaypointApproach(*in.Approach)
			params.Approach = &a
		}
		w, err := svc.AddWaypoint(ctx, in.ExpeditionID, params)
		if err != nil {
			return nil, waypointResultOut{}, err
		}
		return nil, waypointResultOut{Waypoint: newWaypointOut(w)}, nil
	}
}

type listWaypointsOut struct {
	Waypoints []waypointOut `json:"waypoints"`
}

func listWaypoints(svc *service.Service) func(context.Context, *mcp.CallToolRequest, expeditionIDIn) (*mcp.CallToolResult, listWaypointsOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in expeditionIDIn) (*mcp.CallToolResult, listWaypointsOut, error) {
		waypoints, err := svc.ListWaypoints(ctx, in.ExpeditionID)
		if err != nil {
			return nil, listWaypointsOut{}, err
		}
		return nil, listWaypointsOut{Waypoints: newWaypointOuts(waypoints)}, nil
	}
}

type waypointIDIn struct {
	WaypointID string `json:"waypointId" jsonschema:"the waypoint's id"`
}

func getWaypoint(svc *service.Service) func(context.Context, *mcp.CallToolRequest, waypointIDIn) (*mcp.CallToolResult, waypointResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in waypointIDIn) (*mcp.CallToolResult, waypointResultOut, error) {
		w, err := svc.GetWaypoint(ctx, in.WaypointID)
		if err != nil {
			return nil, waypointResultOut{}, err
		}
		out, err := newWaypointOutDetailed(ctx, svc, w)
		if err != nil {
			return nil, waypointResultOut{}, err
		}
		return nil, waypointResultOut{Waypoint: out}, nil
	}
}

// newWaypointOutDetailed extends newWaypointOut with the zoom-in fields
// get_waypoint carries but list_waypoints/get_frontier/the expedition map
// don't: full rehydrate history, any flags raised on or by this waypoint,
// and its attached assets. Deliberately not wired into newWaypointOuts
// (used by every list/map path) to avoid turning those into an N+1 query
// fan-out.
func newWaypointOutDetailed(ctx context.Context, svc *service.Service, w *domain.Waypoint) (waypointOut, error) {
	out := newWaypointOut(w)
	hist, err := svc.ListWaypointHistory(ctx, w.ID)
	if err != nil {
		return waypointOut{}, fmt.Errorf("list waypoint history: %w", err)
	}
	out.History = newWaypointHistoryOuts(hist)
	flags, err := svc.ListWaypointFlags(ctx, w.ID)
	if err != nil {
		return waypointOut{}, fmt.Errorf("list waypoint flags: %w", err)
	}
	out.Flags = newFlagOuts(flags)
	assets, err := svc.ListWaypointAssets(ctx, w.ID)
	if err != nil {
		return waypointOut{}, fmt.Errorf("list waypoint assets: %w", err)
	}
	out.Assets = newAssetOuts(assets)
	return out, nil
}

type updateWaypointIn struct {
	WaypointID string  `json:"waypointId" jsonschema:"the waypoint's id"`
	Title      *string `json:"title,omitempty"`
	Question   *string `json:"question,omitempty"`
	Approach   *string `json:"approach,omitempty" jsonschema:"grilling | research | prototype | task"`
	Mark       bool    `json:"mark,omitempty" jsonschema:"graduate a sighted waypoint to marked in this same call; errors if the waypoint isn't currently sighted"`
}

func updateWaypoint(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
		params := store.UpdateWaypointParams{Title: in.Title, Question: in.Question, Mark: in.Mark}
		if in.Approach != nil {
			a := domain.WaypointApproach(*in.Approach)
			params.Approach = &a
		}
		w, err := svc.UpdateWaypoint(ctx, in.WaypointID, params)
		if err != nil {
			return nil, waypointResultOut{}, err
		}
		return nil, waypointResultOut{Waypoint: newWaypointOut(w)}, nil
	}
}

func getFrontier(svc *service.Service) func(context.Context, *mcp.CallToolRequest, expeditionIDIn) (*mcp.CallToolResult, listWaypointsOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in expeditionIDIn) (*mcp.CallToolResult, listWaypointsOut, error) {
		waypoints, err := svc.GetFrontier(ctx, in.ExpeditionID)
		if err != nil {
			return nil, listWaypointsOut{}, err
		}
		return nil, listWaypointsOut{Waypoints: newWaypointOuts(waypoints)}, nil
	}
}

type claimWaypointIn struct {
	WaypointID string `json:"waypointId" jsonschema:"the waypoint's id"`
	ClaimedBy  string `json:"claimedBy" jsonschema:"this invocation's session id, never an ad-hoc label"`
}

func claimWaypoint(svc *service.Service) func(context.Context, *mcp.CallToolRequest, claimWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in claimWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
		w, err := svc.ClaimWaypoint(ctx, in.WaypointID, in.ClaimedBy)
		if err != nil {
			return nil, waypointResultOut{}, err
		}
		return nil, waypointResultOut{Waypoint: newWaypointOut(w)}, nil
	}
}

func releaseWaypoint(svc *service.Service) func(context.Context, *mcp.CallToolRequest, waypointIDIn) (*mcp.CallToolResult, waypointResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in waypointIDIn) (*mcp.CallToolResult, waypointResultOut, error) {
		w, err := svc.ReleaseWaypoint(ctx, in.WaypointID)
		if err != nil {
			return nil, waypointResultOut{}, err
		}
		return nil, waypointResultOut{Waypoint: newWaypointOut(w)}, nil
	}
}

type reachWaypointIn struct {
	WaypointID     string  `json:"waypointId" jsonschema:"the waypoint's id"`
	Resolution     string  `json:"resolution" jsonschema:"the full answer, buildable-from without re-reading the conversation"`
	ResolutionGist string  `json:"resolutionGist" jsonschema:"the one-line index entry"`
	Rationale      *string `json:"rationale,omitempty"`
	ReachedIn      *string `json:"reachedIn,omitempty" jsonschema:"this invocation's session id, same value used for claimedBy"`
}

func reachWaypoint(svc *service.Service) func(context.Context, *mcp.CallToolRequest, reachWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in reachWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
		w, err := svc.ReachWaypoint(ctx, in.WaypointID, store.ReachWaypointParams{
			Resolution: in.Resolution, ResolutionGist: in.ResolutionGist,
			Rationale: in.Rationale, ReachedIn: in.ReachedIn,
		})
		if err != nil {
			return nil, waypointResultOut{}, err
		}
		return nil, waypointResultOut{Waypoint: newWaypointOut(w)}, nil
	}
}

type bypassWaypointIn struct {
	WaypointID   string `json:"waypointId" jsonschema:"the waypoint's id"`
	BypassReason string `json:"bypassReason" jsonschema:"the gist plus why it's beyond the destination"`
}

func bypassWaypoint(svc *service.Service) func(context.Context, *mcp.CallToolRequest, bypassWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in bypassWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
		w, err := svc.BypassWaypoint(ctx, in.WaypointID, in.BypassReason)
		if err != nil {
			return nil, waypointResultOut{}, err
		}
		return nil, waypointResultOut{Waypoint: newWaypointOut(w)}, nil
	}
}

type reasonedWaypointIn struct {
	WaypointID string `json:"waypointId" jsonschema:"the waypoint's id"`
	Reason     string `json:"reason" jsonschema:"why this is being undone; recorded on the waypoint (unbypassReason for unbypass_waypoint, unspurReason for unspur_waypoint)"`
}

func unbypassWaypoint(svc *service.Service) func(context.Context, *mcp.CallToolRequest, reasonedWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in reasonedWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
		w, err := svc.UnbypassWaypoint(ctx, in.WaypointID, in.Reason)
		if err != nil {
			return nil, waypointResultOut{}, err
		}
		return nil, waypointResultOut{Waypoint: newWaypointOut(w)}, nil
	}
}

type spurWaypointIn struct {
	WaypointID  string  `json:"waypointId" jsonschema:"the origin waypoint's id"`
	WorkspaceID   string  `json:"workspaceId" jsonschema:"the resolved rig workspace id, from resolve_workspace_id"`
	Slug        string  `json:"slug" jsonschema:"kebab-case slug for the new child expedition, unique per workspace"`
	Title       string  `json:"title" jsonschema:"short human title for the child expedition"`
	Destination *string `json:"destination,omitempty"`
	Notes       *string `json:"notes,omitempty"`
	Rationale   *string `json:"rationale,omitempty" jsonschema:"recorded on the origin waypoint's reach"`
	ReachedIn   *string `json:"reachedIn,omitempty" jsonschema:"recorded on the origin waypoint's reach; this invocation's session id"`
}

type spurWaypointOut struct {
	ChildExpedition expeditionOut `json:"childExpedition"`
	OriginWaypoint  waypointOut   `json:"originWaypoint"`
}

func spurWaypoint(svc *service.Service) func(context.Context, *mcp.CallToolRequest, spurWaypointIn) (*mcp.CallToolResult, spurWaypointOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in spurWaypointIn) (*mcp.CallToolResult, spurWaypointOut, error) {
		origin, err := svc.GetWaypoint(ctx, in.WaypointID)
		if err != nil {
			return nil, spurWaypointOut{}, fmt.Errorf("get origin waypoint: %w", err)
		}
		briefingPrompt := fmt.Sprintf("Spurred from waypoint %q: %s", origin.Title, origin.Question)

		child, err := svc.SpurWaypoint(ctx, in.WaypointID, store.SpurWaypointParams{
			CreateExpeditionParams: store.CreateExpeditionParams{
				WorkspaceID:      in.WorkspaceID,
				Slug:           in.Slug,
				Title:          in.Title,
				BriefingPrompt: briefingPrompt,
				Destination:    in.Destination,
				Notes:          in.Notes,
			},
			Rationale: in.Rationale,
			ReachedIn: in.ReachedIn,
		})
		if err != nil {
			return nil, spurWaypointOut{}, err
		}
		originAfter, err := svc.GetWaypoint(ctx, in.WaypointID)
		if err != nil {
			return nil, spurWaypointOut{}, fmt.Errorf("re-fetch origin waypoint after spur: %w", err)
		}
		return nil, spurWaypointOut{ChildExpedition: newExpeditionOut(child), OriginWaypoint: newWaypointOut(originAfter)}, nil
	}
}

type unspurWaypointOut struct {
	OriginWaypoint waypointOut `json:"originWaypoint"`
}

func unspurWaypoint(svc *service.Service) func(context.Context, *mcp.CallToolRequest, reasonedWaypointIn) (*mcp.CallToolResult, unspurWaypointOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in reasonedWaypointIn) (*mcp.CallToolResult, unspurWaypointOut, error) {
		if err := svc.UnspurWaypoint(ctx, in.WaypointID, in.Reason); err != nil {
			return nil, unspurWaypointOut{}, err
		}
		w, err := svc.GetWaypoint(ctx, in.WaypointID)
		if err != nil {
			return nil, unspurWaypointOut{}, fmt.Errorf("re-fetch origin waypoint after unspur: %w", err)
		}
		return nil, unspurWaypointOut{OriginWaypoint: newWaypointOut(w)}, nil
	}
}

type waypointDependencyIn struct {
	FromWaypointID string `json:"fromWaypointId" jsonschema:"must terminate (reached or bypassed) before toWaypointId is frontier-eligible"`
	ToWaypointID   string `json:"toWaypointId"`
}

type okOut struct {
	OK bool `json:"ok"`
}

func addWaypointDependency(svc *service.Service) func(context.Context, *mcp.CallToolRequest, waypointDependencyIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in waypointDependencyIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.AddWaypointDependency(ctx, in.FromWaypointID, in.ToWaypointID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

func removeWaypointDependency(svc *service.Service) func(context.Context, *mcp.CallToolRequest, waypointDependencyIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in waypointDependencyIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.RemoveWaypointDependency(ctx, in.FromWaypointID, in.ToWaypointID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}
