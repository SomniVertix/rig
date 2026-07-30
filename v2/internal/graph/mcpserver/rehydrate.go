package mcpserver

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

func registerRehydrateTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name: "rehydrate_waypoint",
		Description: "Redo a reached or bypassed waypoint's decision: snapshots its current resolution/bypass " +
			"reason into an append-only history record (nothing is deleted), then sets it to rehydrating — " +
			"frontier-eligible and claimable exactly like marked, but visually distinct as a redo rather than a " +
			"fresh waypoint. Legal only when the owning expedition is active; call reopen_expedition first if it " +
			"isn't — reopening is a separate, deliberate step, never an implicit side effect of this call. The " +
			"live resolution/resolutionGist/rationale/bypassReason fields are left in place, not cleared, so the " +
			"last-known answer stays visible while the redo is pending; reach_waypoint/bypass_waypoint overwrite " +
			"them once the redo actually lands.",
	}, rehydrateWaypoint(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "flag_waypoint",
		Description: "Raise a non-mutating marker that a waypoint's decision may need reconsidering. Targets a " +
			"waypoint in any expedition, regardless of that expedition's status (active/complete/abandoned) or " +
			"the waypoint's own status — this is the mechanism for a decision elsewhere to flag an " +
			"already-completed expedition's waypoint without forcing an immediate reopen. sourceWaypointId is " +
			"optional: a flag can be raised narratively (a human/agent observation) as well as by another " +
			"waypoint's decision. get_expedition's flags bucket surfaces unresolved flags targeting that " +
			"expedition's waypoints (incoming only, not flags its own waypoints raised elsewhere).",
	}, flagWaypoint(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "resolve_waypoint_flag",
		Description: "Mark a flag resolved — because rehydrate_waypoint was subsequently called on its target, " +
			"or because on inspection no rework was actually needed — without ever deleting the flag record.",
	}, resolveWaypointFlag(svc))
}

func rehydrateWaypoint(svc *service.Service) func(context.Context, *mcp.CallToolRequest, reasonedWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in reasonedWaypointIn) (*mcp.CallToolResult, waypointResultOut, error) {
		w, err := svc.RehydrateWaypoint(ctx, in.WaypointID, in.Reason)
		if err != nil {
			return nil, waypointResultOut{}, err
		}
		return nil, waypointResultOut{Waypoint: newWaypointOut(w)}, nil
	}
}

type flagWaypointIn struct {
	TargetWaypointID string  `json:"targetWaypointId" jsonschema:"the waypoint being flagged, in any expedition"`
	Note             string  `json:"note" jsonschema:"why this waypoint's decision may need reconsidering"`
	SourceWaypointID *string `json:"sourceWaypointId,omitempty" jsonschema:"the waypoint whose decision motivated this flag, if any"`
}

func flagWaypoint(svc *service.Service) func(context.Context, *mcp.CallToolRequest, flagWaypointIn) (*mcp.CallToolResult, flagResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in flagWaypointIn) (*mcp.CallToolResult, flagResultOut, error) {
		f, err := svc.FlagWaypoint(ctx, in.TargetWaypointID, store.FlagWaypointParams{
			Note: in.Note, SourceWaypointID: in.SourceWaypointID,
		})
		if err != nil {
			return nil, flagResultOut{}, err
		}
		return nil, flagResultOut{Flag: newFlagOut(f)}, nil
	}
}

type resolveFlagIn struct {
	FlagID string `json:"flagId" jsonschema:"the flag's id, from flag_waypoint or get_expedition's flags bucket"`
	Reason string `json:"reason" jsonschema:"why this flag no longer needs action"`
}

func resolveWaypointFlag(svc *service.Service) func(context.Context, *mcp.CallToolRequest, resolveFlagIn) (*mcp.CallToolResult, flagResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in resolveFlagIn) (*mcp.CallToolResult, flagResultOut, error) {
		f, err := svc.ResolveWaypointFlag(ctx, in.FlagID, in.Reason)
		if err != nil {
			return nil, flagResultOut{}, err
		}
		return nil, flagResultOut{Flag: newFlagOut(f)}, nil
	}
}
