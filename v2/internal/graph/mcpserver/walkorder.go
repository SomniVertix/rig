package mcpserver

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
)

func registerWalkOrderTool(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name: "render_walk_order",
		Description: "Topologically sort every marked or rehydrating waypoint on an expedition by its dependency " +
			"edges — blockers before dependents, frontier first, stable by waypoint number where order doesn't " +
			"matter — and render it in the wayfinder skill's fixed handoff-command shape (one " +
			"'/wayfinder <slug> W<n> — <title>' line per waypoint, annotated inline with what a not-yet-frontier " +
			"waypoint is waiting on). Sighted (fog) waypoints are left out. Replaces hand-sorting + " +
			"hand-formatting the walk order.",
	}, renderWalkOrder(svc))
}

type walkOrderLineOut struct {
	WaypointID string        `json:"waypointId"`
	Number     int           `json:"number"`
	Title      string        `json:"title"`
	WaitingOn  []waypointRef `json:"waitingOn,omitempty"`
	Line       string        `json:"line"`
}

type renderWalkOrderOut struct {
	ExpeditionSlug string             `json:"expeditionSlug"`
	Lines          []walkOrderLineOut `json:"lines"`
	Markdown       string             `json:"markdown" jsonschema:"the ready-to-paste fenced code block, exactly as the wayfinder skill's handoff-command shape requires"`
	CycleWarning   string             `json:"cycleWarning,omitempty" jsonschema:"set if a dependency cycle among marked/rehydrating waypoints meant a full topological order wasn't possible — the server does not reject cycles, see add_waypoint_dependency"`
}

func renderWalkOrder(svc *service.Service) func(context.Context, *mcp.CallToolRequest, expeditionIDIn) (*mcp.CallToolResult, renderWalkOrderOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in expeditionIDIn) (*mcp.CallToolResult, renderWalkOrderOut, error) {
		e, err := svc.GetExpedition(ctx, in.ExpeditionID)
		if err != nil {
			return nil, renderWalkOrderOut{}, err
		}
		waypoints, err := svc.ListWaypoints(ctx, in.ExpeditionID)
		if err != nil {
			return nil, renderWalkOrderOut{}, fmt.Errorf("list waypoints: %w", err)
		}
		edges, err := svc.ListWaypointDependencies(ctx, in.ExpeditionID)
		if err != nil {
			return nil, renderWalkOrderOut{}, fmt.Errorf("list waypoint dependencies: %w", err)
		}
		frontierWPs, err := svc.GetFrontier(ctx, in.ExpeditionID)
		if err != nil {
			return nil, renderWalkOrderOut{}, fmt.Errorf("get frontier: %w", err)
		}

		out := buildWalkOrder(e.Slug, waypoints, edges, frontierWPs)
		return nil, out, nil
	}
}

func buildWalkOrder(expeditionSlug string, waypoints []*domain.Waypoint, edges []domain.WaypointDependencyEdge, frontierWPs []*domain.Waypoint) renderWalkOrderOut {
	byID := make(map[string]*domain.Waypoint, len(waypoints))
	for _, w := range waypoints {
		byID[w.ID] = w
	}

	// workable mirrors the frontier-eligibility rule: marked or rehydrating,
	// both printed in the walk order the same way.
	var workable []*domain.Waypoint
	workableSet := make(map[string]bool)
	for _, w := range waypoints {
		if w.Status == domain.WaypointMarked || w.Status == domain.WaypointRehydrating {
			workable = append(workable, w)
			workableSet[w.ID] = true
		}
	}

	frontierIDs := make(map[string]bool, len(frontierWPs))
	for _, w := range frontierWPs {
		frontierIDs[w.ID] = true
	}

	// blockersOf[to] = every from-side waypoint of an edge that terminates at
	// "to", regardless of whether "from" is itself marked — an unterminated
	// blocker outside the marked set (sighted or claimed) still explains why
	// "to" isn't in the frontier yet.
	blockersOf := make(map[string][]string)
	for _, edge := range edges {
		blockersOf[edge.ToWaypointID] = append(blockersOf[edge.ToWaypointID], edge.FromWaypointID)
	}
	waitingOn := func(w *domain.Waypoint) []waypointRef {
		var refs []waypointRef
		for _, blockerID := range blockersOf[w.ID] {
			blocker, ok := byID[blockerID]
			if !ok {
				continue
			}
			if blocker.Status != domain.WaypointReached && blocker.Status != domain.WaypointBypassed {
				refs = append(refs, newWaypointRef(blocker))
			}
		}
		sort.Slice(refs, func(i, j int) bool { return refs[i].Number < refs[j].Number })
		return refs
	}

	// Kahn's topological sort, restricted to edges internal to the workable
	// set (only marked/rehydrating waypoints are printed), tie-broken
	// frontier-first then by waypoint number.
	remaining := make(map[string]int, len(workable))
	adj := make(map[string][]string)
	for _, w := range workable {
		remaining[w.ID] = 0
	}
	for _, edge := range edges {
		if workableSet[edge.FromWaypointID] && workableSet[edge.ToWaypointID] {
			remaining[edge.ToWaypointID]++
			adj[edge.FromWaypointID] = append(adj[edge.FromWaypointID], edge.ToWaypointID)
		}
	}

	emitted := make(map[string]bool, len(workable))
	var ordered []*domain.Waypoint
	for len(ordered) < len(workable) {
		var candidates []*domain.Waypoint
		for _, w := range workable {
			if !emitted[w.ID] && remaining[w.ID] == 0 {
				candidates = append(candidates, w)
			}
		}
		if len(candidates) == 0 {
			break // cycle among workable waypoints; handled below
		}
		sort.Slice(candidates, func(i, j int) bool {
			fi, fj := frontierIDs[candidates[i].ID], frontierIDs[candidates[j].ID]
			if fi != fj {
				return fi
			}
			return candidates[i].WaypointNumber < candidates[j].WaypointNumber
		})
		next := candidates[0]
		ordered = append(ordered, next)
		emitted[next.ID] = true
		for _, to := range adj[next.ID] {
			remaining[to]--
		}
	}

	var cycleWarning string
	if len(ordered) < len(workable) {
		var leftover []*domain.Waypoint
		for _, w := range workable {
			if !emitted[w.ID] {
				leftover = append(leftover, w)
			}
		}
		sort.Slice(leftover, func(i, j int) bool { return leftover[i].WaypointNumber < leftover[j].WaypointNumber })
		names := make([]string, len(leftover))
		for i, w := range leftover {
			names[i] = fmt.Sprintf("W%d", w.WaypointNumber)
		}
		cycleWarning = fmt.Sprintf(
			"Dependency cycle detected among marked/rehydrating waypoints %s — the server doesn't reject cycles, "+
				"so this couldn't be fully topologically sorted. Listed last, in waypoint-number order instead.",
			strings.Join(names, ", "))
		ordered = append(ordered, leftover...)
	}

	lines := make([]walkOrderLineOut, len(ordered))
	rendered := make([]string, len(ordered))
	for i, w := range ordered {
		wo := waitingOn(w)
		line := fmt.Sprintf("/wayfinder %s W%d — %s", expeditionSlug, w.WaypointNumber, w.Title)
		if len(wo) > 0 {
			parts := make([]string, len(wo))
			for j, ref := range wo {
				parts[j] = fmt.Sprintf("W%d", ref.Number)
			}
			line += fmt.Sprintf("   (after %s)", strings.Join(parts, ", "))
		}
		lines[i] = walkOrderLineOut{WaypointID: w.ID, Number: w.WaypointNumber, Title: w.Title, WaitingOn: wo, Line: line}
		rendered[i] = line
	}

	var markdown string
	if len(rendered) > 0 {
		markdown = "```\n" + strings.Join(rendered, "\n") + "\n```"
	}

	return renderWalkOrderOut{ExpeditionSlug: expeditionSlug, Lines: lines, Markdown: markdown, CycleWarning: cycleWarning}
}
