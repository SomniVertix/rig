package mcpserver

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

// registerOpenQuestionTools wires the single :OpenQuestion artifact type
// that unifies v1's assumptions_open_questions/design_flags/tasks_flags
// (spec-pipeline-graph.md decision 5), used at every stage.
func registerOpenQuestionTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name: "add_open_question",
		Description: "Raise an open question against a spec, optionally scoped to one component/task via targetId. " +
			"Unresolved open questions block BOTH finalize_stage and approve for their stage (spec-pipeline-graph.md " +
			"decision 6) — if you hit a real gap from an insufficient prior stage, raise it here and stop; do not " +
			"self-resolve with a best-effort assumption and keep drafting (decision 7). A human answers it, then " +
			"re-invoke fresh to reconcile and finish (decision 8).",
	}, addOpenQuestion(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_open_question",
		Description: "Update an open question's description.",
	}, updateOpenQuestion(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "resolve_open_question",
		Description: "Resolve an open question — never deletes it, just marks it answered. Required once to unblock finalize_stage/approve for its stage.",
	}, resolveOpenQuestion(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_open_question",
		Description: "Delete an open question raised in error.",
	}, deleteOpenQuestion(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_open_questions",
		Description: "List every open question on a spec, resolved or not.",
	}, listOpenQuestions(svc))
}

type addOpenQuestionIn struct {
	SpecID      string  `json:"specId" jsonschema:"the spec's id"`
	Stage       string  `json:"stage" jsonschema:"requirements | design | tasks — which stage raised it"`
	TargetID    *string `json:"targetId,omitempty" jsonschema:"optional: a specific component/task item id this concerns, narrower than the whole stage"`
	Description string  `json:"description"`
}

type openQuestionResultOut struct {
	OpenQuestion openQuestionOut `json:"openQuestion"`
}

func addOpenQuestion(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addOpenQuestionIn) (*mcp.CallToolResult, openQuestionResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addOpenQuestionIn) (*mcp.CallToolResult, openQuestionResultOut, error) {
		q, err := svc.AddOpenQuestion(ctx, store.AddOpenQuestionParams{
			SpecID: in.SpecID, Stage: domain.SpecStage(in.Stage), TargetID: in.TargetID, Description: in.Description,
		})
		if err != nil {
			return nil, openQuestionResultOut{}, err
		}
		return nil, openQuestionResultOut{OpenQuestion: newOpenQuestionOut(q)}, nil
	}
}

type updateOpenQuestionIn struct {
	OpenQuestionID string `json:"openQuestionId" jsonschema:"the open question's id"`
	Description    string `json:"description"`
}

func updateOpenQuestion(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateOpenQuestionIn) (*mcp.CallToolResult, openQuestionResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateOpenQuestionIn) (*mcp.CallToolResult, openQuestionResultOut, error) {
		q, err := svc.UpdateOpenQuestion(ctx, in.OpenQuestionID, in.Description)
		if err != nil {
			return nil, openQuestionResultOut{}, err
		}
		return nil, openQuestionResultOut{OpenQuestion: newOpenQuestionOut(q)}, nil
	}
}

type resolveOpenQuestionIn struct {
	OpenQuestionID string `json:"openQuestionId" jsonschema:"the open question's id"`
	ResolvedBy     string `json:"resolvedBy" jsonschema:"actor who resolved it"`
	ResolvedReason string `json:"resolvedReason" jsonschema:"the answer/decision"`
}

func resolveOpenQuestion(svc *service.Service) func(context.Context, *mcp.CallToolRequest, resolveOpenQuestionIn) (*mcp.CallToolResult, openQuestionResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in resolveOpenQuestionIn) (*mcp.CallToolResult, openQuestionResultOut, error) {
		q, err := svc.ResolveOpenQuestion(ctx, in.OpenQuestionID, store.ResolveOpenQuestionParams{
			ResolvedBy: in.ResolvedBy, ResolvedReason: in.ResolvedReason,
		})
		if err != nil {
			return nil, openQuestionResultOut{}, err
		}
		return nil, openQuestionResultOut{OpenQuestion: newOpenQuestionOut(q)}, nil
	}
}

type openQuestionIDIn struct {
	OpenQuestionID string `json:"openQuestionId" jsonschema:"the open question's id"`
}

func deleteOpenQuestion(svc *service.Service) func(context.Context, *mcp.CallToolRequest, openQuestionIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in openQuestionIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteOpenQuestion(ctx, in.OpenQuestionID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type listOpenQuestionsOut struct {
	OpenQuestions []openQuestionOut `json:"openQuestions"`
}

func listOpenQuestions(svc *service.Service) func(context.Context, *mcp.CallToolRequest, specIDIn) (*mcp.CallToolResult, listOpenQuestionsOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in specIDIn) (*mcp.CallToolResult, listOpenQuestionsOut, error) {
		qs, err := svc.ListOpenQuestions(ctx, in.SpecID)
		if err != nil {
			return nil, listOpenQuestionsOut{}, err
		}
		return nil, listOpenQuestionsOut{OpenQuestions: newOpenQuestionOuts(qs)}, nil
	}
}
