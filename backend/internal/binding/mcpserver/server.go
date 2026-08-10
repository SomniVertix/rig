// Package mcpserver exposes the binding service's resolve capability as
// an MCP tool, so an MCP client can resolve its own working directory to a
// rig workspaceId directly (no separate resolver subprocess, unlike v1).
package mcpserver

import (
	"context"
	"net/http"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/binding/registry"
)

type resolveArgs struct {
	Cwd string `json:"cwd" jsonschema:"the MCP client's current working directory; used to determine which workspace it should bind to"`
}

type resolveOutput struct {
	WorkspaceID string `json:"workspaceId"`
}

type listWorkspacesOutput struct {
	Workspaces []registry.WorkspaceDetail `json:"workspaces"`
}

// NewHandler returns an http.Handler serving the binding service's MCP
// tools over the streamable HTTP transport (see [MCP spec]).
//
// [MCP spec]: https://modelcontextprotocol.io/2025/03/26/streamable-http-transport.html
func NewHandler(reg *registry.Registry) http.Handler {
	server := mcp.NewServer(&mcp.Implementation{Name: "rig-binding", Version: "0.1.0"}, nil)
	RegisterTools(server, reg)

	return mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server {
		return server
	}, nil)
}

// RegisterTools registers the workspace-domain MCP tool(s) onto an existing
// server, so cmd/rig can fold them into the single "rig" server alongside
// graph's tools instead of running a workspace-only server of its own.
func RegisterTools(server *mcp.Server, reg *registry.Registry) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "resolve_workspace_id",
		Description: "Resolve a working directory to the rig workspaceId of the workspace whose folders claim it.",
	}, resolveWorkspaceID(reg))

	mcp.AddTool(server, &mcp.Tool{
		Name: "list_workspaces",
		Description: "List all available workspaces by id/slug/name/rootPath. Intended for harness-generic " +
			"subagent spawning (rootPath binding) and human-friendly name resolution. Distinctly differs from " +
			"resolve_workspace_id which maps the caller's own cwd to its own workspace.",
	}, listWorkspaces(reg))
}

func resolveWorkspaceID(reg *registry.Registry) func(context.Context, *mcp.CallToolRequest, resolveArgs) (*mcp.CallToolResult, resolveOutput, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, args resolveArgs) (*mcp.CallToolResult, resolveOutput, error) {
		if args.Cwd == "" {
			return toolError("cwd is required"), resolveOutput{}, nil
		}

		workspaceID, err := reg.Resolve(args.Cwd)
		if err != nil {
			return toolError(err.Error()), resolveOutput{}, nil
		}

		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: "resolved workspaceId: " + workspaceID}},
		}, resolveOutput{WorkspaceID: workspaceID}, nil
	}
}

func listWorkspaces(reg *registry.Registry) func(context.Context, *mcp.CallToolRequest, struct{}) (*mcp.CallToolResult, listWorkspacesOutput, error) {
	return func(ctx context.Context, req *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, listWorkspacesOutput, error) {
		return nil, listWorkspacesOutput{Workspaces: reg.ListDetailed()}, nil
	}
}

// toolError reports a business-logic failure (not found, ambiguous, bad
// input) as tool content rather than a protocol-level error, so the calling
// model can see what went wrong and self-correct.
func toolError(message string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		IsError: true,
		Content: []mcp.Content{&mcp.TextContent{Text: message}},
	}
}
