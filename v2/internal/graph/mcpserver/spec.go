// registerSpecTools wires the mcp__rig__* spec-pipeline tool catalog
// documented in .meta/spec/README.md onto service.Service — the real
// implementation replacing the specstubs.go placeholders. Tool names and
// argument shapes mirror that doc's contract; spec-pipeline-graph.md at the
// repo root records the bounded rules (promotion, open questions, task
// atomicity) this implementation enforces.
package mcpserver

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
)

func registerSpecTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_specs",
		Description: "List every spec in a workspace, with each stage's status (requirements/design stored, tasks derived live from its components).",
	}, listSpecs(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_spec",
		Description: "Get one spec by id, including derived tasks-stage status. Call this cold at the start of every invocation rather than trusting anything from a prior turn.",
	}, getSpec(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "set_requirements_overview",
		Description: "Set requirements.md's \"## Overview\" section.",
	}, setRequirementsOverview(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "set_design_overview",
		Description: "Set design.md's \"## Overview\" section.",
	}, setDesignOverview(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "set_design_architecture",
		Description: "Set design.md's \"## Architecture\" section (prose / ASCII / mermaid).",
	}, setDesignArchitecture(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "set_design_data_model_overview",
		Description: "Set design.md's optional intro prose before the Data Model / Interfaces entries.",
	}, setDesignDataModelOverview(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "finalize_stage",
		Description: "Submit a stage's draft for human review (status -> in_review). For stage \"tasks\", component " +
			"(the design component's slug) is required — each component finalizes independently and this also runs " +
			"cross-component task-dependency cycle detection across the whole spec. Blocked by that stage's own " +
			"completeness gate and by any unresolved open question against it (spec-pipeline-graph.md decision 6) — " +
			"resolve those first rather than finalizing around them.",
	}, finalizeStage(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_next_stage",
		Description: "Get which stage to work on next (requirements/design/tasks/implementation), and — once tasks is the active stage — which components still aren't approved.",
	}, getNextStage(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "render_document",
		Description: "Render one stage's markdown from live graph state (there is no stored document — always " +
			"regenerated on demand). For stage \"tasks\", component \"all\" renders the component-status index; a " +
			"specific component slug renders that component's full tasks.md.",
	}, renderDocument(svc))
}

type workspaceIDIn struct {
	WorkspaceID string `json:"workspaceId" jsonschema:"the workspace's id"`
}

type listSpecsOut struct {
	Specs []specOut `json:"specs"`
}

func listSpecs(svc *service.Service) func(context.Context, *mcp.CallToolRequest, workspaceIDIn) (*mcp.CallToolResult, listSpecsOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in workspaceIDIn) (*mcp.CallToolResult, listSpecsOut, error) {
		specs, err := svc.ListSpecs(ctx, in.WorkspaceID)
		if err != nil {
			return nil, listSpecsOut{}, err
		}
		statuses := make([]domain.SpecStageStatus, len(specs))
		for i, s := range specs {
			st, err := svc.DeriveTasksStageStatus(ctx, s.ID)
			if err != nil {
				return nil, listSpecsOut{}, err
			}
			statuses[i] = st
		}
		return nil, listSpecsOut{Specs: newSpecOuts(specs, statuses)}, nil
	}
}

type specResultOut struct {
	Spec specOut `json:"spec"`
}

// specOutFor fetches the derived tasks-stage status alongside a spec, the
// shape every tool that returns a full spec needs.
func specOutFor(ctx context.Context, svc *service.Service, spec *domain.Spec) (specOut, error) {
	tasksStatus, err := svc.DeriveTasksStageStatus(ctx, spec.ID)
	if err != nil {
		return specOut{}, err
	}
	return newSpecOut(spec, tasksStatus), nil
}

func newSpecResultOut(ctx context.Context, svc *service.Service, spec *domain.Spec) (specResultOut, error) {
	out, err := specOutFor(ctx, svc, spec)
	return specResultOut{Spec: out}, err
}

func getSpec(svc *service.Service) func(context.Context, *mcp.CallToolRequest, specIDIn) (*mcp.CallToolResult, specResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in specIDIn) (*mcp.CallToolResult, specResultOut, error) {
		spec, err := svc.GetSpec(ctx, in.SpecID)
		if err != nil {
			return nil, specResultOut{}, err
		}
		out, err := newSpecResultOut(ctx, svc, spec)
		return nil, out, err
	}
}

type setOverviewIn struct {
	SpecID   string `json:"specId" jsonschema:"the spec's id"`
	Overview string `json:"overview" jsonschema:"the section's full markdown body"`
}

func setRequirementsOverview(svc *service.Service) func(context.Context, *mcp.CallToolRequest, setOverviewIn) (*mcp.CallToolResult, specResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in setOverviewIn) (*mcp.CallToolResult, specResultOut, error) {
		spec, err := svc.SetRequirementsOverview(ctx, in.SpecID, in.Overview)
		if err != nil {
			return nil, specResultOut{}, err
		}
		out, err := newSpecResultOut(ctx, svc, spec)
		return nil, out, err
	}
}

func setDesignOverview(svc *service.Service) func(context.Context, *mcp.CallToolRequest, setOverviewIn) (*mcp.CallToolResult, specResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in setOverviewIn) (*mcp.CallToolResult, specResultOut, error) {
		spec, err := svc.SetDesignOverview(ctx, in.SpecID, in.Overview)
		if err != nil {
			return nil, specResultOut{}, err
		}
		out, err := newSpecResultOut(ctx, svc, spec)
		return nil, out, err
	}
}

func setDesignArchitecture(svc *service.Service) func(context.Context, *mcp.CallToolRequest, setOverviewIn) (*mcp.CallToolResult, specResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in setOverviewIn) (*mcp.CallToolResult, specResultOut, error) {
		spec, err := svc.SetDesignArchitecture(ctx, in.SpecID, in.Overview)
		if err != nil {
			return nil, specResultOut{}, err
		}
		out, err := newSpecResultOut(ctx, svc, spec)
		return nil, out, err
	}
}

func setDesignDataModelOverview(svc *service.Service) func(context.Context, *mcp.CallToolRequest, setOverviewIn) (*mcp.CallToolResult, specResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in setOverviewIn) (*mcp.CallToolResult, specResultOut, error) {
		spec, err := svc.SetDesignDataModelOverview(ctx, in.SpecID, in.Overview)
		if err != nil {
			return nil, specResultOut{}, err
		}
		out, err := newSpecResultOut(ctx, svc, spec)
		return nil, out, err
	}
}

type finalizeStageIn struct {
	SpecID    string  `json:"specId" jsonschema:"the spec's id"`
	Stage     string  `json:"stage" jsonschema:"requirements | design | tasks"`
	Component *string `json:"component,omitempty" jsonschema:"required when stage is \"tasks\": the design component's slug"`
}

type finalizeStageOut struct {
	Spec     *specOut     `json:"spec,omitempty"`
	TasksDoc *tasksDocOut `json:"tasksDoc,omitempty"`
}

func finalizeStage(svc *service.Service) func(context.Context, *mcp.CallToolRequest, finalizeStageIn) (*mcp.CallToolResult, finalizeStageOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in finalizeStageIn) (*mcp.CallToolResult, finalizeStageOut, error) {
		switch in.Stage {
		case "requirements":
			spec, err := svc.FinalizeRequirementsStage(ctx, in.SpecID)
			if err != nil {
				return nil, finalizeStageOut{}, err
			}
			out, err := specOutFor(ctx, svc, spec)
			if err != nil {
				return nil, finalizeStageOut{}, err
			}
			return nil, finalizeStageOut{Spec: &out}, nil
		case "design":
			spec, err := svc.FinalizeDesignStage(ctx, in.SpecID)
			if err != nil {
				return nil, finalizeStageOut{}, err
			}
			out, err := specOutFor(ctx, svc, spec)
			if err != nil {
				return nil, finalizeStageOut{}, err
			}
			return nil, finalizeStageOut{Spec: &out}, nil
		case "implementation":
			spec, err := svc.FinalizeImplementationStage(ctx, in.SpecID)
			if err != nil {
				return nil, finalizeStageOut{}, err
			}
			out, err := specOutFor(ctx, svc, spec)
			if err != nil {
				return nil, finalizeStageOut{}, err
			}
			return nil, finalizeStageOut{Spec: &out}, nil
		case "tasks":
			if in.Component == nil {
				return nil, finalizeStageOut{}, fmt.Errorf("mcpserver: finalize_stage: stage \"tasks\" requires component")
			}
			tasksDocID, err := resolveTasksDocIDBySlug(ctx, svc, in.SpecID, *in.Component)
			if err != nil {
				return nil, finalizeStageOut{}, err
			}
			result, err := svc.FinalizeTasksStage(ctx, tasksDocID)
			if err != nil {
				return nil, finalizeStageOut{}, err
			}
			out := newTasksDocOut(result)
			return nil, finalizeStageOut{TasksDoc: &out}, nil
		default:
			return nil, finalizeStageOut{}, fmt.Errorf("mcpserver: finalize_stage: unknown stage %q", in.Stage)
		}
	}
}

type nextStageResultOut struct {
	NextStageInfo nextStageInfoOut `json:"nextStageInfo"`
}

func getNextStage(svc *service.Service) func(context.Context, *mcp.CallToolRequest, specIDIn) (*mcp.CallToolResult, nextStageResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in specIDIn) (*mcp.CallToolResult, nextStageResultOut, error) {
		info, err := svc.GetNextStage(ctx, in.SpecID)
		if err != nil {
			return nil, nextStageResultOut{}, err
		}
		return nil, nextStageResultOut{NextStageInfo: newNextStageInfoOut(info)}, nil
	}
}

type renderDocumentIn struct {
	SpecID    string `json:"specId" jsonschema:"the spec's id"`
	Stage     string `json:"stage" jsonschema:"requirements | design | tasks"`
	Component string `json:"component,omitempty" jsonschema:"tasks stage only: a component slug, or \"all\" for the index"`
}

type renderDocumentOut struct {
	Markdown string `json:"markdown"`
}

func renderDocument(svc *service.Service) func(context.Context, *mcp.CallToolRequest, renderDocumentIn) (*mcp.CallToolResult, renderDocumentOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in renderDocumentIn) (*mcp.CallToolResult, renderDocumentOut, error) {
		md, err := svc.RenderDocument(ctx, in.SpecID, in.Stage, in.Component)
		if err != nil {
			return nil, renderDocumentOut{}, err
		}
		return nil, renderDocumentOut{Markdown: md}, nil
	}
}

// resolveTasksDocIDBySlug resolves a design component's slug (the argument
// shape agents naturally have on hand) to its TasksDoc id (what the store
// layer keys stage transitions on).
func resolveTasksDocIDBySlug(ctx context.Context, svc *service.Service, specID, slug string) (string, error) {
	return svc.ResolveTasksDocIDBySlug(ctx, specID, slug)
}
