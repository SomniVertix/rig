// Package mcpserver exposes the graph service's expedition/waypoint domain,
// and the spec pipeline (specs -> requirements -> design -> tasks) built on
// top of it, as MCP tools — wrapping service.Service in-process the same
// way internal/binding/mcpserver wraps its registry, no HTTP round-trip
// to the REST API this same process also serves.
//
// Tool names and shapes follow the mcp__rig__* catalog documented in
// .meta/current/skills/wayfinder/SKILL.md (expedition/waypoint) and
// .meta/spec/README.md (spec pipeline) one-for-one, matching the Go domain
// types underneath (see graph/README.md and spec-pipeline-graph.md at the
// repo root for the design record the spec pipeline port is derived from).
//
// approve_stage/deny_stage are deliberately NOT exposed as MCP tools —
// approve/deny is a human-only action (see .meta/spec/README.md); an agent
// can only finalize_stage (-> in_review) and report. Spec creation is
// likewise not its own tool: it only happens via complete_expedition's
// outcomeKind:"spec" branch, mirroring v1's completeTrail.
//
// start_session remains a deliberate stub: it wraps a store method that is
// itself still store.ErrNotImplemented (see
// internal/graph/store/neo4jstore/deferred.go) — session bookkeeping is
// non-graph-shaped satellite data deferred until it's needed for more than
// the sessionId string callers already thread through claimedBy/reachedIn
// by hand. get_workspace_status is a real, expeditions-only implementation
// (see expeditions.go) rather than a stub: it replaces the wayfinder
// skill's Status-mode hand-join of list_expeditions with a single call, and
// reports its own specsNote explaining that spec data isn't included yet
// rather than erroring.
package mcpserver

import (
	"net/http"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/service"
)

// NewHandler returns an http.Handler serving the graph service's MCP tools
// over the streamable HTTP transport.
func NewHandler(svc *service.Service) http.Handler {
	server := mcp.NewServer(&mcp.Implementation{Name: "rig-graph", Version: "0.1.0"}, nil)
	RegisterTools(server, svc)

	return mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server {
		return server
	}, nil)
}

// RegisterTools registers every graph-domain MCP tool onto an existing
// server, so cmd/rig can fold them into the single "rig" server alongside
// workspace's tools instead of running a graph-only server of its own.
func RegisterTools(server *mcp.Server, svc *service.Service) {
	registerExpeditionTools(server, svc)
	registerWaypointTools(server, svc)
	registerWalkOrderTool(server, svc)
	registerRehydrateTools(server, svc)
	registerAssetTools(server, svc)
	registerTermTools(server, svc)
	registerSessionStubTools(server, svc)
	registerHandoffTools(server, svc)
	registerHandoffConversationTools(server, svc)
	registerSpecTools(server, svc)
	registerRequirementsTools(server, svc)
	registerOpenQuestionTools(server, svc)
	registerDesignTools(server, svc)
	registerTasksTools(server, svc)
}

// toolError reports a business-logic failure (not found, conflict, bad
// input, not implemented) as tool content rather than a protocol-level
// error, so the calling model can see what went wrong and self-correct.
// Returning a plain error from a ToolHandlerFor produces the identical
// IsError CallToolResult shape automatically (see the SDK's SetError), so
// most tools below just return the error directly — toolError only earns
// its keep where a handler wants a custom message distinct from err.Error().
func toolError(message string) *mcp.CallToolResult {
	return &mcp.CallToolResult{
		IsError: true,
		Content: []mcp.Content{&mcp.TextContent{Text: message}},
	}
}
