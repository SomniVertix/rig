package mcpserver

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

func registerDesignTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name: "add_design_component",
		Description: "Add a design.md \"## Components\" row: slug | display name. ordinal is derived from call " +
			"order. Design's finalize_stage requires >=1 component. Once design finalizes, one TasksDoc is " +
			"auto-seeded per component.",
	}, addDesignComponent(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_design_component",
		Description: "Update a design component's display name.",
	}, updateDesignComponent(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name: "delete_design_component",
		Description: "Delete a design component. If it already has a TasksDoc (seeded by an earlier design " +
			"finalize), the orphaned doc is NOT deleted here — it will block design's next finalize_stage until " +
			"resolved (spec-pipeline-graph.md decision 10; stricter than v1, no silent cleanup).",
	}, deleteDesignComponent(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_design_components",
		Description: "List a spec's design components in order.",
	}, listDesignComponents(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "add_design_data_model_entry",
		Description: "Add a design.md \"## Data Model / Interfaces\" item: one schema/type/API contract, verbatim.",
	}, addDataModelEntry(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_design_data_model_entry",
		Description: "Update a data model entry's fields.",
	}, updateDataModelEntry(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_design_data_model_entry",
		Description: "Delete a data model entry.",
	}, deleteDataModelEntry(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "add_design_traceability",
		Description: "Add a design.md \"## Requirement Traceability\" row, linking a design section to the user " +
			"story it addresses. userStoryId is optional (requirementLabel is the durable text fallback if it can't be resolved).",
	}, addTraceabilityEntry(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_design_traceability",
		Description: "Update a traceability entry's fields.",
	}, updateTraceabilityEntry(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_design_traceability",
		Description: "Delete a traceability entry.",
	}, deleteTraceabilityEntry(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "add_design_alternative",
		Description: "Add a design.md \"## Alternatives Considered\" list item.",
	}, addAlternative(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_design_alternative",
		Description: "Update an alternative's description.",
	}, updateAlternative(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_design_alternative",
		Description: "Delete an alternative.",
	}, deleteAlternative(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "add_design_open_risk",
		Description: "Add a design.md \"## Open Risks / Tradeoffs\" list item.",
	}, addOpenRisk(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_design_open_risk",
		Description: "Update an open risk's description.",
	}, updateOpenRisk(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_design_open_risk",
		Description: "Delete an open risk.",
	}, deleteOpenRisk(svc))
}

type addDesignComponentIn struct {
	SpecID      string `json:"specId" jsonschema:"the spec's id"`
	Slug        string `json:"slug" jsonschema:"kebab-case"`
	DisplayName string `json:"displayName"`
}

type designComponentResultOut struct {
	DesignComponent designComponentOut `json:"designComponent"`
}

func addDesignComponent(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addDesignComponentIn) (*mcp.CallToolResult, designComponentResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addDesignComponentIn) (*mcp.CallToolResult, designComponentResultOut, error) {
		c, err := svc.AddDesignComponent(ctx, store.AddDesignComponentParams{SpecID: in.SpecID, Slug: in.Slug, DisplayName: in.DisplayName})
		if err != nil {
			return nil, designComponentResultOut{}, err
		}
		return nil, designComponentResultOut{DesignComponent: newDesignComponentOut(c)}, nil
	}
}

type updateDesignComponentIn struct {
	DesignComponentID string  `json:"designComponentId" jsonschema:"the design component's id"`
	DisplayName       *string `json:"displayName,omitempty"`
}

func updateDesignComponent(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateDesignComponentIn) (*mcp.CallToolResult, designComponentResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateDesignComponentIn) (*mcp.CallToolResult, designComponentResultOut, error) {
		c, err := svc.UpdateDesignComponent(ctx, in.DesignComponentID, store.UpdateDesignComponentParams{DisplayName: in.DisplayName})
		if err != nil {
			return nil, designComponentResultOut{}, err
		}
		return nil, designComponentResultOut{DesignComponent: newDesignComponentOut(c)}, nil
	}
}

type designComponentIDIn struct {
	DesignComponentID string `json:"designComponentId" jsonschema:"the design component's id"`
}

func deleteDesignComponent(svc *service.Service) func(context.Context, *mcp.CallToolRequest, designComponentIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in designComponentIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteDesignComponent(ctx, in.DesignComponentID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type listDesignComponentsOut struct {
	DesignComponents []designComponentOut `json:"designComponents"`
}

func listDesignComponents(svc *service.Service) func(context.Context, *mcp.CallToolRequest, specIDIn) (*mcp.CallToolResult, listDesignComponentsOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in specIDIn) (*mcp.CallToolResult, listDesignComponentsOut, error) {
		cs, err := svc.ListDesignComponents(ctx, in.SpecID)
		if err != nil {
			return nil, listDesignComponentsOut{}, err
		}
		return nil, listDesignComponentsOut{DesignComponents: newDesignComponentOuts(cs)}, nil
	}
}

type addDataModelEntryIn struct {
	SpecID  string `json:"specId" jsonschema:"the spec's id"`
	Name    string `json:"name" jsonschema:"e.g. \"User\", \"POST /users\""`
	Kind    string `json:"kind" jsonschema:"e.g. schema | type | api_contract | interface"`
	Content string `json:"content" jsonschema:"the actual schema/type/contract body, verbatim"`
}

type dataModelEntryResultOut struct {
	DataModelEntry dataModelEntryOut `json:"dataModelEntry"`
}

func addDataModelEntry(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addDataModelEntryIn) (*mcp.CallToolResult, dataModelEntryResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addDataModelEntryIn) (*mcp.CallToolResult, dataModelEntryResultOut, error) {
		e, err := svc.AddDataModelEntry(ctx, store.AddDataModelEntryParams{SpecID: in.SpecID, Name: in.Name, Kind: in.Kind, Content: in.Content})
		if err != nil {
			return nil, dataModelEntryResultOut{}, err
		}
		return nil, dataModelEntryResultOut{DataModelEntry: newDataModelEntryOut(e)}, nil
	}
}

type updateDataModelEntryIn struct {
	DataModelEntryID string  `json:"dataModelEntryId" jsonschema:"the data model entry's id"`
	Name             *string `json:"name,omitempty"`
	Kind             *string `json:"kind,omitempty"`
	Content          *string `json:"content,omitempty"`
}

func updateDataModelEntry(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateDataModelEntryIn) (*mcp.CallToolResult, dataModelEntryResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateDataModelEntryIn) (*mcp.CallToolResult, dataModelEntryResultOut, error) {
		e, err := svc.UpdateDataModelEntry(ctx, in.DataModelEntryID, store.UpdateDataModelEntryParams{Name: in.Name, Kind: in.Kind, Content: in.Content})
		if err != nil {
			return nil, dataModelEntryResultOut{}, err
		}
		return nil, dataModelEntryResultOut{DataModelEntry: newDataModelEntryOut(e)}, nil
	}
}

type dataModelEntryIDIn struct {
	DataModelEntryID string `json:"dataModelEntryId" jsonschema:"the data model entry's id"`
}

func deleteDataModelEntry(svc *service.Service) func(context.Context, *mcp.CallToolRequest, dataModelEntryIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in dataModelEntryIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteDataModelEntry(ctx, in.DataModelEntryID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type addTraceabilityEntryIn struct {
	SpecID           string  `json:"specId" jsonschema:"the spec's id"`
	UserStoryID      *string `json:"userStoryId,omitempty"`
	RequirementLabel string  `json:"requirementLabel" jsonschema:"raw \"Story N: <title>\" text"`
	AddressedBy      string  `json:"addressedBy" jsonschema:"design section/component that satisfies it"`
}

type traceabilityEntryResultOut struct {
	TraceabilityEntry traceabilityEntryOut `json:"traceabilityEntry"`
}

func addTraceabilityEntry(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addTraceabilityEntryIn) (*mcp.CallToolResult, traceabilityEntryResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addTraceabilityEntryIn) (*mcp.CallToolResult, traceabilityEntryResultOut, error) {
		t, err := svc.AddTraceabilityEntry(ctx, store.AddTraceabilityEntryParams{
			SpecID: in.SpecID, UserStoryID: in.UserStoryID, RequirementLabel: in.RequirementLabel, AddressedBy: in.AddressedBy,
		})
		if err != nil {
			return nil, traceabilityEntryResultOut{}, err
		}
		return nil, traceabilityEntryResultOut{TraceabilityEntry: newTraceabilityEntryOut(t)}, nil
	}
}

type updateTraceabilityEntryIn struct {
	TraceabilityEntryID string  `json:"traceabilityEntryId" jsonschema:"the traceability entry's id"`
	UserStoryID         *string `json:"userStoryId,omitempty"`
	RequirementLabel    *string `json:"requirementLabel,omitempty"`
	AddressedBy         *string `json:"addressedBy,omitempty"`
}

func updateTraceabilityEntry(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateTraceabilityEntryIn) (*mcp.CallToolResult, traceabilityEntryResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateTraceabilityEntryIn) (*mcp.CallToolResult, traceabilityEntryResultOut, error) {
		t, err := svc.UpdateTraceabilityEntry(ctx, in.TraceabilityEntryID, store.UpdateTraceabilityEntryParams{
			UserStoryID: in.UserStoryID, RequirementLabel: in.RequirementLabel, AddressedBy: in.AddressedBy,
		})
		if err != nil {
			return nil, traceabilityEntryResultOut{}, err
		}
		return nil, traceabilityEntryResultOut{TraceabilityEntry: newTraceabilityEntryOut(t)}, nil
	}
}

type traceabilityEntryIDIn struct {
	TraceabilityEntryID string `json:"traceabilityEntryId" jsonschema:"the traceability entry's id"`
}

func deleteTraceabilityEntry(svc *service.Service) func(context.Context, *mcp.CallToolRequest, traceabilityEntryIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in traceabilityEntryIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteTraceabilityEntry(ctx, in.TraceabilityEntryID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type addAlternativeIn struct {
	SpecID      string `json:"specId" jsonschema:"the spec's id"`
	Description string `json:"description"`
}

type alternativeResultOut struct {
	Alternative alternativeOut `json:"alternative"`
}

func addAlternative(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addAlternativeIn) (*mcp.CallToolResult, alternativeResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addAlternativeIn) (*mcp.CallToolResult, alternativeResultOut, error) {
		a, err := svc.AddAlternative(ctx, store.AddAlternativeParams{SpecID: in.SpecID, Description: in.Description})
		if err != nil {
			return nil, alternativeResultOut{}, err
		}
		return nil, alternativeResultOut{Alternative: newAlternativeOut(a)}, nil
	}
}

type updateAlternativeIn struct {
	AlternativeID string `json:"alternativeId" jsonschema:"the alternative's id"`
	Description   string `json:"description"`
}

func updateAlternative(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateAlternativeIn) (*mcp.CallToolResult, alternativeResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateAlternativeIn) (*mcp.CallToolResult, alternativeResultOut, error) {
		a, err := svc.UpdateAlternative(ctx, in.AlternativeID, in.Description)
		if err != nil {
			return nil, alternativeResultOut{}, err
		}
		return nil, alternativeResultOut{Alternative: newAlternativeOut(a)}, nil
	}
}

type alternativeIDIn struct {
	AlternativeID string `json:"alternativeId" jsonschema:"the alternative's id"`
}

func deleteAlternative(svc *service.Service) func(context.Context, *mcp.CallToolRequest, alternativeIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in alternativeIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteAlternative(ctx, in.AlternativeID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type addOpenRiskIn struct {
	SpecID      string `json:"specId" jsonschema:"the spec's id"`
	Description string `json:"description"`
}

type openRiskResultOut struct {
	OpenRisk openRiskOut `json:"openRisk"`
}

func addOpenRisk(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addOpenRiskIn) (*mcp.CallToolResult, openRiskResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addOpenRiskIn) (*mcp.CallToolResult, openRiskResultOut, error) {
		r, err := svc.AddOpenRisk(ctx, store.AddOpenRiskParams{SpecID: in.SpecID, Description: in.Description})
		if err != nil {
			return nil, openRiskResultOut{}, err
		}
		return nil, openRiskResultOut{OpenRisk: newOpenRiskOut(r)}, nil
	}
}

type updateOpenRiskIn struct {
	OpenRiskID  string `json:"openRiskId" jsonschema:"the open risk's id"`
	Description string `json:"description"`
}

func updateOpenRisk(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateOpenRiskIn) (*mcp.CallToolResult, openRiskResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateOpenRiskIn) (*mcp.CallToolResult, openRiskResultOut, error) {
		r, err := svc.UpdateOpenRisk(ctx, in.OpenRiskID, in.Description)
		if err != nil {
			return nil, openRiskResultOut{}, err
		}
		return nil, openRiskResultOut{OpenRisk: newOpenRiskOut(r)}, nil
	}
}

type openRiskIDIn struct {
	OpenRiskID string `json:"openRiskId" jsonschema:"the open risk's id"`
}

func deleteOpenRisk(svc *service.Service) func(context.Context, *mcp.CallToolRequest, openRiskIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in openRiskIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteOpenRisk(ctx, in.OpenRiskID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}
