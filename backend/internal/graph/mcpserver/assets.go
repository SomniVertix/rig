package mcpserver

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

func registerAssetTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name: "add_waypoint_asset",
		Description: "Attach an asset to a waypoint: what resolving it produced. A document stored whole " +
			"(contentMarkdown), or a reference to prototype code committed to main (repoPath, optional " +
			"commitSha) — exactly one of the two. Unguarded: legal regardless of the waypoint's current status, " +
			"since an asset can be produced while working toward a decision, not only after it's reached.",
	}, addWaypointAsset(svc))
}

type addWaypointAssetIn struct {
	WaypointID      string  `json:"waypointId" jsonschema:"the waypoint's id"`
	Kind            string  `json:"kind" jsonschema:"e.g. research_summary, analysis, prototype_ref"`
	Title           string  `json:"title"`
	ContentMarkdown *string `json:"contentMarkdown,omitempty" jsonschema:"documents stored whole; exactly one of contentMarkdown/repoPath"`
	RepoPath        *string `json:"repoPath,omitempty" jsonschema:"prototype code committed to main; exactly one of contentMarkdown/repoPath"`
	CommitSHA       *string `json:"commitSha,omitempty" jsonschema:"only meaningful alongside repoPath"`
}

func addWaypointAsset(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addWaypointAssetIn) (*mcp.CallToolResult, assetResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addWaypointAssetIn) (*mcp.CallToolResult, assetResultOut, error) {
		asset, err := svc.AddWaypointAsset(ctx, in.WaypointID, store.AddWaypointAssetParams{
			Kind: in.Kind, Title: in.Title,
			ContentMarkdown: in.ContentMarkdown, RepoPath: in.RepoPath, CommitSHA: in.CommitSHA,
		})
		if err != nil {
			return nil, assetResultOut{}, err
		}
		return nil, assetResultOut{Asset: newAssetOut(asset)}, nil
	}
}
