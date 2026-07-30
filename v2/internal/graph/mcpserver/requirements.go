package mcpserver

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

func registerRequirementsTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "add_user_story",
		Description: "Add a requirements.md \"### Story N\" entry: As-a/I-want/so-that plus rationale. storyNumber is derived from call order.",
	}, addUserStory(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_user_story",
		Description: "Update a user story's fields in place.",
	}, updateUserStory(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_user_story",
		Description: "Delete a user story and its acceptance criteria.",
	}, deleteUserStory(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "add_acceptance_criterion",
		Description: "Add an EARS acceptance criterion under a user story. criterionNumber is derived from call " +
			"order. fullText is the verbatim criterion as authored; the clause fields are its parsed decomposition.",
	}, addAcceptanceCriterion(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_acceptance_criterion",
		Description: "Update an acceptance criterion's fields in place.",
	}, updateAcceptanceCriterion(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_acceptance_criterion",
		Description: "Delete an acceptance criterion.",
	}, deleteAcceptanceCriterion(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "add_non_goal",
		Description: "Add a requirements.md \"## Non-Goals\" list item.",
	}, addNonGoal(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_non_goal",
		Description: "Update a non-goal's description.",
	}, updateNonGoal(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_non_goal",
		Description: "Delete a non-goal.",
	}, deleteNonGoal(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "add_glossary_term",
		Description: "Add a requirements.md \"## Glossary\" entry — exactly one of definition or externalReference " +
			"(e.g. a pointer into a workspace-wide domain-modeling glossary instead of an inline definition).",
	}, addGlossaryTerm(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_glossary_term",
		Description: "Update a glossary term's definition or externalReference.",
	}, updateGlossaryTerm(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_glossary_term",
		Description: "Delete a glossary term.",
	}, deleteGlossaryTerm(svc))
}

type addUserStoryIn struct {
	SpecID     string `json:"specId" jsonschema:"the spec's id"`
	Title      string `json:"title" jsonschema:"short refer-by-name title"`
	Role       string `json:"role" jsonschema:"\"As a <role>\""`
	Capability string `json:"capability" jsonschema:"\"I want <capability>\""`
	Benefit    string `json:"benefit" jsonschema:"\"so that <benefit>\""`
	Rationale  string `json:"rationale"`
}

type userStoryResultOut struct {
	UserStory userStoryOut `json:"userStory"`
}

func addUserStory(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addUserStoryIn) (*mcp.CallToolResult, userStoryResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addUserStoryIn) (*mcp.CallToolResult, userStoryResultOut, error) {
		u, err := svc.AddUserStory(ctx, store.AddUserStoryParams{
			SpecID: in.SpecID, Title: in.Title, Role: in.Role, Capability: in.Capability,
			Benefit: in.Benefit, Rationale: in.Rationale,
		})
		if err != nil {
			return nil, userStoryResultOut{}, err
		}
		return nil, userStoryResultOut{UserStory: newUserStoryOut(u)}, nil
	}
}

type updateUserStoryIn struct {
	UserStoryID string  `json:"userStoryId" jsonschema:"the user story's id"`
	Title       *string `json:"title,omitempty"`
	Role        *string `json:"role,omitempty"`
	Capability  *string `json:"capability,omitempty"`
	Benefit     *string `json:"benefit,omitempty"`
	Rationale   *string `json:"rationale,omitempty"`
}

func updateUserStory(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateUserStoryIn) (*mcp.CallToolResult, userStoryResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateUserStoryIn) (*mcp.CallToolResult, userStoryResultOut, error) {
		u, err := svc.UpdateUserStory(ctx, in.UserStoryID, store.UpdateUserStoryParams{
			Title: in.Title, Role: in.Role, Capability: in.Capability, Benefit: in.Benefit, Rationale: in.Rationale,
		})
		if err != nil {
			return nil, userStoryResultOut{}, err
		}
		return nil, userStoryResultOut{UserStory: newUserStoryOut(u)}, nil
	}
}

type userStoryIDIn struct {
	UserStoryID string `json:"userStoryId" jsonschema:"the user story's id"`
}

func deleteUserStory(svc *service.Service) func(context.Context, *mcp.CallToolRequest, userStoryIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in userStoryIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteUserStory(ctx, in.UserStoryID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type addAcceptanceCriterionIn struct {
	UserStoryID     string  `json:"userStoryId" jsonschema:"the user story's id"`
	EarsPattern     string  `json:"earsPattern" jsonschema:"ubiquitous | event_driven | state_driven | unwanted_behavior | complex_conditional | optional_feature"`
	TriggerClause   *string `json:"triggerClause,omitempty" jsonschema:"WHEN <trigger>"`
	ConditionClause *string `json:"conditionClause,omitempty" jsonschema:"IF <condition> / WHERE <feature is included>"`
	StateClause     *string `json:"stateClause,omitempty" jsonschema:"WHILE <state>"`
	ResponseClause  string  `json:"responseClause" jsonschema:"THE SYSTEM SHALL <response>"`
	FullText        string  `json:"fullText" jsonschema:"criterion exactly as authored, verbatim"`
}

type acceptanceCriterionResultOut struct {
	AcceptanceCriterion acceptanceCriterionOut `json:"acceptanceCriterion"`
}

func addAcceptanceCriterion(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addAcceptanceCriterionIn) (*mcp.CallToolResult, acceptanceCriterionResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addAcceptanceCriterionIn) (*mcp.CallToolResult, acceptanceCriterionResultOut, error) {
		c, err := svc.AddAcceptanceCriterion(ctx, store.AddAcceptanceCriterionParams{
			UserStoryID: in.UserStoryID, EarsPattern: domain.EarsPattern(in.EarsPattern),
			TriggerClause: in.TriggerClause, ConditionClause: in.ConditionClause, StateClause: in.StateClause,
			ResponseClause: in.ResponseClause, FullText: in.FullText,
		})
		if err != nil {
			return nil, acceptanceCriterionResultOut{}, err
		}
		return nil, acceptanceCriterionResultOut{AcceptanceCriterion: newAcceptanceCriterionOut(c)}, nil
	}
}

type updateAcceptanceCriterionIn struct {
	AcceptanceCriterionID string  `json:"acceptanceCriterionId" jsonschema:"the acceptance criterion's id"`
	EarsPattern           *string `json:"earsPattern,omitempty"`
	TriggerClause         *string `json:"triggerClause,omitempty"`
	ConditionClause       *string `json:"conditionClause,omitempty"`
	StateClause           *string `json:"stateClause,omitempty"`
	ResponseClause        *string `json:"responseClause,omitempty"`
	FullText              *string `json:"fullText,omitempty"`
}

func updateAcceptanceCriterion(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateAcceptanceCriterionIn) (*mcp.CallToolResult, acceptanceCriterionResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateAcceptanceCriterionIn) (*mcp.CallToolResult, acceptanceCriterionResultOut, error) {
		params := store.UpdateAcceptanceCriterionParams{
			TriggerClause: in.TriggerClause, ConditionClause: in.ConditionClause, StateClause: in.StateClause,
			ResponseClause: in.ResponseClause, FullText: in.FullText,
		}
		if in.EarsPattern != nil {
			p := domain.EarsPattern(*in.EarsPattern)
			params.EarsPattern = &p
		}
		c, err := svc.UpdateAcceptanceCriterion(ctx, in.AcceptanceCriterionID, params)
		if err != nil {
			return nil, acceptanceCriterionResultOut{}, err
		}
		return nil, acceptanceCriterionResultOut{AcceptanceCriterion: newAcceptanceCriterionOut(c)}, nil
	}
}

type acceptanceCriterionIDIn struct {
	AcceptanceCriterionID string `json:"acceptanceCriterionId" jsonschema:"the acceptance criterion's id"`
}

func deleteAcceptanceCriterion(svc *service.Service) func(context.Context, *mcp.CallToolRequest, acceptanceCriterionIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in acceptanceCriterionIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteAcceptanceCriterion(ctx, in.AcceptanceCriterionID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type addNonGoalIn struct {
	SpecID      string `json:"specId" jsonschema:"the spec's id"`
	Description string `json:"description"`
}

type nonGoalResultOut struct {
	NonGoal nonGoalOut `json:"nonGoal"`
}

func addNonGoal(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addNonGoalIn) (*mcp.CallToolResult, nonGoalResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addNonGoalIn) (*mcp.CallToolResult, nonGoalResultOut, error) {
		n, err := svc.AddNonGoal(ctx, in.SpecID, in.Description)
		if err != nil {
			return nil, nonGoalResultOut{}, err
		}
		return nil, nonGoalResultOut{NonGoal: newNonGoalOut(n)}, nil
	}
}

type updateNonGoalIn struct {
	NonGoalID   string `json:"nonGoalId" jsonschema:"the non-goal's id"`
	Description string `json:"description"`
}

func updateNonGoal(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateNonGoalIn) (*mcp.CallToolResult, nonGoalResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateNonGoalIn) (*mcp.CallToolResult, nonGoalResultOut, error) {
		n, err := svc.UpdateNonGoal(ctx, in.NonGoalID, in.Description)
		if err != nil {
			return nil, nonGoalResultOut{}, err
		}
		return nil, nonGoalResultOut{NonGoal: newNonGoalOut(n)}, nil
	}
}

type nonGoalIDIn struct {
	NonGoalID string `json:"nonGoalId" jsonschema:"the non-goal's id"`
}

func deleteNonGoal(svc *service.Service) func(context.Context, *mcp.CallToolRequest, nonGoalIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in nonGoalIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteNonGoal(ctx, in.NonGoalID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type addGlossaryTermIn struct {
	SpecID            string  `json:"specId" jsonschema:"the spec's id"`
	Term              string  `json:"term"`
	Definition        *string `json:"definition,omitempty"`
	ExternalReference *string `json:"externalReference,omitempty" jsonschema:"e.g. a pointer into a workspace-wide domain-modeling glossary instead of an inline definition"`
}

type glossaryTermResultOut struct {
	GlossaryTerm glossaryTermOut `json:"glossaryTerm"`
}

func addGlossaryTerm(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addGlossaryTermIn) (*mcp.CallToolResult, glossaryTermResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addGlossaryTermIn) (*mcp.CallToolResult, glossaryTermResultOut, error) {
		g, err := svc.AddGlossaryTerm(ctx, store.AddGlossaryTermParams{
			SpecID: in.SpecID, Term: in.Term, Definition: in.Definition, ExternalReference: in.ExternalReference,
		})
		if err != nil {
			return nil, glossaryTermResultOut{}, err
		}
		return nil, glossaryTermResultOut{GlossaryTerm: newGlossaryTermOut(g)}, nil
	}
}

type updateGlossaryTermIn struct {
	GlossaryTermID    string  `json:"glossaryTermId" jsonschema:"the glossary term's id"`
	Definition        *string `json:"definition,omitempty"`
	ExternalReference *string `json:"externalReference,omitempty"`
}

func updateGlossaryTerm(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateGlossaryTermIn) (*mcp.CallToolResult, glossaryTermResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateGlossaryTermIn) (*mcp.CallToolResult, glossaryTermResultOut, error) {
		g, err := svc.UpdateGlossaryTerm(ctx, in.GlossaryTermID, store.UpdateGlossaryTermParams{
			Definition: in.Definition, ExternalReference: in.ExternalReference,
		})
		if err != nil {
			return nil, glossaryTermResultOut{}, err
		}
		return nil, glossaryTermResultOut{GlossaryTerm: newGlossaryTermOut(g)}, nil
	}
}

type glossaryTermIDIn struct {
	GlossaryTermID string `json:"glossaryTermId" jsonschema:"the glossary term's id"`
}

func deleteGlossaryTerm(svc *service.Service) func(context.Context, *mcp.CallToolRequest, glossaryTermIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in glossaryTermIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteGlossaryTerm(ctx, in.GlossaryTermID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}
