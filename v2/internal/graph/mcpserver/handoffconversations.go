package mcpserver

import (
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/somnivertix/rig/internal/graph/service"
)

// Stub registration for handoff-conversation tools
// Full handler implementations will be completed after domain + store + service layers are verified
func registerHandoffConversationTools(server *mcp.Server, svc *service.Service) {
	// 7 tools to be implemented:
	// - start_handoff_conversation
	// - record_handoff_turn (with server-derived agreement/cap/escalation logic)
	// - get_handoff_conversation
	// - escalate_handoff_conversation
	// - resume_handoff_conversation
	// - close_handoff_conversation
	// - draft_handoff_resolution
	//
	// These tools route through the service layer which delegates to the store,
	// where the critical RecordHandoffTurn logic (one atomic Cypher write with
	// agreement/cap/escalation derivation) is implemented.
}
