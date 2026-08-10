package mcpserver

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

// registerSessionStubTools registers a placeholder for start_session, whose
// backing store method is itself store.ErrNotImplemented (see
// internal/graph/store/neo4jstore/deferred.go). Session bookkeeping is
// non-graph-shaped satellite/audit data, deliberately deferred until it's
// needed for something beyond the sessionId string callers already thread
// through claimedBy/reachedIn by hand. Registered here — rather than left
// out of the tool catalog entirely — so a calling agent gets a clear "not
// implemented yet" tool error instead of an unknown-tool failure.
//
// Waypoint assets and expedition terms, formerly deferred alongside
// sessions in this file, are implemented — see assets.go and terms.go.
func registerSessionStubTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "start_session",
		Description: "NOT YET IMPLEMENTED in v2. Stamp a wayfinder/grilling invocation as a session. Always errors today — see graph/README.md 'What's implemented vs. deferred'. Callers must still mint some stable identifier for claimedBy/reachedIn in the meantime.",
	}, startSession(svc))
}

type startSessionIn struct {
	Label *string `json:"label,omitempty" jsonschema:"a short note on what this invocation is doing"`
}

type sessionOut struct {
	SessionID string `json:"sessionId"`
}

func startSession(svc *service.Service) func(context.Context, *mcp.CallToolRequest, startSessionIn) (*mcp.CallToolResult, sessionOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in startSessionIn) (*mcp.CallToolResult, sessionOut, error) {
		sess, err := svc.StartSession(ctx, store.StartSessionParams{Actor: "claude", Label: in.Label, Kind: domain.SessionKindDiscovery})
		if err != nil {
			return nil, sessionOut{}, err
		}
		return nil, sessionOut{SessionID: sess.ID}, nil
	}
}
