package mcpserver

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/service"
)

func registerTermTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "add_expedition_term",
		Description: "Pin a piece of terminology to an expedition. Rejects a case-insensitive duplicate of an existing term on the same expedition — to fix a definition, use update_expedition_term instead of adding a second entry.",
	}, addExpeditionTerm(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_expedition_term",
		Description: "Correct an expedition term's definition. Only the definition is updatable; the term text itself is fixed once added.",
	}, updateExpeditionTerm(svc))
}

type addExpeditionTermIn struct {
	ExpeditionID string `json:"expeditionId" jsonschema:"the expedition's id"`
	Term         string `json:"term"`
	Definition   string `json:"definition"`
}

type termResultOut struct {
	Term termOut `json:"term"`
}

func addExpeditionTerm(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addExpeditionTermIn) (*mcp.CallToolResult, termResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addExpeditionTermIn) (*mcp.CallToolResult, termResultOut, error) {
		term, err := svc.AddExpeditionTerm(ctx, in.ExpeditionID, in.Term, in.Definition)
		if err != nil {
			return nil, termResultOut{}, err
		}
		return nil, termResultOut{Term: newTermOut(term)}, nil
	}
}

type updateExpeditionTermIn struct {
	TermID     string `json:"termId" jsonschema:"the term's id, from add_expedition_term or get_expedition's terms bucket"`
	Definition string `json:"definition"`
}

func updateExpeditionTerm(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateExpeditionTermIn) (*mcp.CallToolResult, termResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateExpeditionTermIn) (*mcp.CallToolResult, termResultOut, error) {
		term, err := svc.UpdateExpeditionTerm(ctx, in.TermID, in.Definition)
		if err != nil {
			return nil, termResultOut{}, err
		}
		return nil, termResultOut{Term: newTermOut(term)}, nil
	}
}
