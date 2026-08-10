package mcpserver

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

func registerTasksTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_tasks_docs",
		Description: "List every component's TasksDoc under a spec, with each one's independent stage status.",
	}, listTasksDocs(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_tasks_doc_by_component",
		Description: "Resolve a design component's slug to its TasksDoc — the id every other tasks tool keys on.",
	}, getTasksDocByComponent(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "add_task_item",
		Description: "Add a task/subtask. itemId and executionOrder are derived from call order — the sequence " +
			"you call this in is the Order section. Pass parentItemId to nest one level under an existing " +
			"top-level item — max 2-level hierarchy (spec-pipeline-graph.md decision 12); a parent that's already " +
			"a subtask is rejected. satisfiesCriterionIds must be non-empty for a top-level item (decision 13) — " +
			"cite the specific granular AcceptanceCriterion ids this task satisfies, not just the story.",
	}, addTaskItem(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_task_item",
		Description: "Update a task item's fields, or check/uncheck it off.",
	}, updateTaskItem(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_task_item",
		Description: "Delete a task item. Deleting a top-level item cascades to its direct subtasks.",
	}, deleteTaskItem(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_task_items",
		Description: "List a component's task items in execution order.",
	}, listTaskItems(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "add_task_file_touched",
		Description: "Record one file/area touched by a task item — the auditable blast radius. Capped at 5 per " +
			"task item (spec-pipeline-graph.md decision 14); a 6th is rejected as a signal to split the task.",
	}, addFileTouched(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_task_file_touched",
		Description: "Delete a files-touched entry.",
	}, deleteFileTouched(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_task_files_touched",
		Description: "List a task item's files touched.",
	}, listFilesTouched(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name: "add_task_dependency_edge",
		Description: "Add a dependency edge: fromTaskItemId must complete before toTaskItemId. Cross-component " +
			"only (same-component edges are rejected — use that component's own Order/Parallel Execution Schema " +
			"instead). No cycle detection on add; finalize_stage(\"tasks\") checks the whole spec's edges for cycles.",
	}, addTaskDependencyEdge(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_task_dependency_edge",
		Description: "Delete a dependency edge.",
	}, deleteTaskDependencyEdge(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_task_dependency_edges",
		Description: "List every cross-component dependency edge on a spec.",
	}, listTaskDependencyEdges(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "add_parallel_batch",
		Description: "Add a \"## Parallel Execution Schema\" batch (P1, P2, ...) to a component. batchOrder is derived from call order.",
	}, addParallelBatch(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_parallel_batch",
		Description: "Delete a parallel batch.",
	}, deleteParallelBatch(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_parallel_batches",
		Description: "List a component's parallel batches in run order.",
	}, listParallelBatches(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "add_parallel_batch_member",
		Description: "Add a task item to a parallel batch.",
	}, addParallelBatchMember(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "remove_parallel_batch_member",
		Description: "Remove a task item from a parallel batch.",
	}, removeParallelBatchMember(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_parallel_batch_members",
		Description: "List a batch's member task items.",
	}, listParallelBatchMembers(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "add_definition_of_done_item",
		Description: "Add a spec-wide \"## Definition of Done\" checklist item — never duplicate per component.",
	}, addDefinitionOfDoneItem(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_definition_of_done_item",
		Description: "Update a Definition of Done item's description, or check/uncheck it.",
	}, updateDefinitionOfDoneItem(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "delete_definition_of_done_item",
		Description: "Delete a Definition of Done item.",
	}, deleteDefinitionOfDoneItem(svc))
	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_definition_of_done_items",
		Description: "List a spec's Definition of Done items.",
	}, listDefinitionOfDoneItems(svc))
}

type tasksDocIDIn struct {
	TasksDocID string `json:"tasksDocId" jsonschema:"the tasks doc's id"`
}

type tasksDocResultOut struct {
	TasksDoc tasksDocOut `json:"tasksDoc"`
}

type listTasksDocsOut struct {
	TasksDocs []tasksDocOut `json:"tasksDocs"`
}

func listTasksDocs(svc *service.Service) func(context.Context, *mcp.CallToolRequest, specIDIn) (*mcp.CallToolResult, listTasksDocsOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in specIDIn) (*mcp.CallToolResult, listTasksDocsOut, error) {
		docs, err := svc.ListTasksDocs(ctx, in.SpecID)
		if err != nil {
			return nil, listTasksDocsOut{}, err
		}
		return nil, listTasksDocsOut{TasksDocs: newTasksDocOuts(docs)}, nil
	}
}

type getTasksDocByComponentIn struct {
	SpecID    string `json:"specId" jsonschema:"the spec's id"`
	Component string `json:"component" jsonschema:"the design component's slug"`
}

func getTasksDocByComponent(svc *service.Service) func(context.Context, *mcp.CallToolRequest, getTasksDocByComponentIn) (*mcp.CallToolResult, tasksDocResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in getTasksDocByComponentIn) (*mcp.CallToolResult, tasksDocResultOut, error) {
		id, err := resolveTasksDocIDBySlug(ctx, svc, in.SpecID, in.Component)
		if err != nil {
			return nil, tasksDocResultOut{}, err
		}
		doc, err := svc.GetTasksDoc(ctx, id)
		if err != nil {
			return nil, tasksDocResultOut{}, err
		}
		return nil, tasksDocResultOut{TasksDoc: newTasksDocOut(doc)}, nil
	}
}

type addTaskItemIn struct {
	TasksDocID            string   `json:"tasksDocId" jsonschema:"the component's tasks doc id"`
	ParentItemID          *string  `json:"parentItemId,omitempty" jsonschema:"nest one level under this existing top-level item"`
	Title                 string   `json:"title"`
	Description           string   `json:"description"`
	SuggestedAgent        string   `json:"suggestedAgent,omitempty" jsonschema:"defaults to \"none\""`
	AcceptanceCheck       string   `json:"acceptanceCheck"`
	SatisfiesCriterionIDs []string `json:"satisfiesCriterionIds,omitempty" jsonschema:"required non-empty for a top-level item"`
}

type taskItemResultOut struct {
	TaskItem taskItemOut `json:"taskItem"`
}

func taskItemOutFor(ctx context.Context, svc *service.Service, item *domain.TaskItem) (taskItemOut, error) {
	criteria, err := svc.ListSatisfiedCriteria(ctx, item.ID)
	if err != nil {
		return taskItemOut{}, err
	}
	return newTaskItemOut(item, criteria), nil
}

func addTaskItem(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addTaskItemIn) (*mcp.CallToolResult, taskItemResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addTaskItemIn) (*mcp.CallToolResult, taskItemResultOut, error) {
		item, err := svc.AddTaskItem(ctx, store.AddTaskItemParams{
			TasksDocID: in.TasksDocID, ParentItemID: in.ParentItemID, Title: in.Title, Description: in.Description,
			SuggestedAgent: in.SuggestedAgent, AcceptanceCheck: in.AcceptanceCheck, SatisfiesCriterionIDs: in.SatisfiesCriterionIDs,
		})
		if err != nil {
			return nil, taskItemResultOut{}, err
		}
		out, err := taskItemOutFor(ctx, svc, item)
		if err != nil {
			return nil, taskItemResultOut{}, err
		}
		return nil, taskItemResultOut{TaskItem: out}, nil
	}
}

type updateTaskItemIn struct {
	TaskItemID      string  `json:"taskItemId" jsonschema:"the task item's id"`
	Title           *string `json:"title,omitempty"`
	Description     *string `json:"description,omitempty"`
	SuggestedAgent  *string `json:"suggestedAgent,omitempty"`
	AcceptanceCheck *string `json:"acceptanceCheck,omitempty"`
	IsChecked       *bool   `json:"isChecked,omitempty"`
}

func updateTaskItem(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateTaskItemIn) (*mcp.CallToolResult, taskItemResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateTaskItemIn) (*mcp.CallToolResult, taskItemResultOut, error) {
		item, err := svc.UpdateTaskItem(ctx, in.TaskItemID, store.UpdateTaskItemParams{
			Title: in.Title, Description: in.Description, SuggestedAgent: in.SuggestedAgent,
			AcceptanceCheck: in.AcceptanceCheck, IsChecked: in.IsChecked,
		})
		if err != nil {
			return nil, taskItemResultOut{}, err
		}
		out, err := taskItemOutFor(ctx, svc, item)
		if err != nil {
			return nil, taskItemResultOut{}, err
		}
		return nil, taskItemResultOut{TaskItem: out}, nil
	}
}

type taskItemIDIn struct {
	TaskItemID string `json:"taskItemId" jsonschema:"the task item's id"`
}

func deleteTaskItem(svc *service.Service) func(context.Context, *mcp.CallToolRequest, taskItemIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in taskItemIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteTaskItem(ctx, in.TaskItemID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type listTaskItemsOut struct {
	TaskItems []taskItemOut `json:"taskItems"`
}

func listTaskItems(svc *service.Service) func(context.Context, *mcp.CallToolRequest, tasksDocIDIn) (*mcp.CallToolResult, listTaskItemsOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in tasksDocIDIn) (*mcp.CallToolResult, listTaskItemsOut, error) {
		items, err := svc.ListTaskItems(ctx, in.TasksDocID)
		if err != nil {
			return nil, listTaskItemsOut{}, err
		}
		outs := make([]taskItemOut, len(items))
		for i, item := range items {
			out, err := taskItemOutFor(ctx, svc, item)
			if err != nil {
				return nil, listTaskItemsOut{}, err
			}
			outs[i] = out
		}
		return nil, listTaskItemsOut{TaskItems: outs}, nil
	}
}

type addFileTouchedIn struct {
	TaskItemID string `json:"taskItemId" jsonschema:"the task item's id"`
	FilePath   string `json:"filePath"`
}

type fileTouchedResultOut struct {
	FileTouched fileTouchedOut `json:"fileTouched"`
}

func addFileTouched(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addFileTouchedIn) (*mcp.CallToolResult, fileTouchedResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addFileTouchedIn) (*mcp.CallToolResult, fileTouchedResultOut, error) {
		f, err := svc.AddFileTouched(ctx, store.AddFileTouchedParams{TaskItemID: in.TaskItemID, FilePath: in.FilePath})
		if err != nil {
			return nil, fileTouchedResultOut{}, err
		}
		return nil, fileTouchedResultOut{FileTouched: newFileTouchedOut(f)}, nil
	}
}

type fileTouchedIDIn struct {
	FileTouchedID string `json:"fileTouchedId" jsonschema:"the files-touched entry's id"`
}

func deleteFileTouched(svc *service.Service) func(context.Context, *mcp.CallToolRequest, fileTouchedIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in fileTouchedIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteFileTouched(ctx, in.FileTouchedID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type listFilesTouchedOut struct {
	FilesTouched []fileTouchedOut `json:"filesTouched"`
}

func listFilesTouched(svc *service.Service) func(context.Context, *mcp.CallToolRequest, taskItemIDIn) (*mcp.CallToolResult, listFilesTouchedOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in taskItemIDIn) (*mcp.CallToolResult, listFilesTouchedOut, error) {
		fs, err := svc.ListFilesTouched(ctx, in.TaskItemID)
		if err != nil {
			return nil, listFilesTouchedOut{}, err
		}
		return nil, listFilesTouchedOut{FilesTouched: newFileTouchedOuts(fs)}, nil
	}
}

type taskDependencyEdgeIn struct {
	SpecID         string `json:"specId" jsonschema:"the spec's id"`
	FromTaskItemID string `json:"fromTaskItemId"`
	ToTaskItemID   string `json:"toTaskItemId"`
}

func addTaskDependencyEdge(svc *service.Service) func(context.Context, *mcp.CallToolRequest, taskDependencyEdgeIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in taskDependencyEdgeIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.AddTaskDependencyEdge(ctx, in.SpecID, in.FromTaskItemID, in.ToTaskItemID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

func deleteTaskDependencyEdge(svc *service.Service) func(context.Context, *mcp.CallToolRequest, taskDependencyEdgeIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in taskDependencyEdgeIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteTaskDependencyEdge(ctx, in.FromTaskItemID, in.ToTaskItemID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type listTaskDependencyEdgesOut struct {
	Edges []taskDependencyEdgeOut `json:"edges"`
}

func listTaskDependencyEdges(svc *service.Service) func(context.Context, *mcp.CallToolRequest, specIDIn) (*mcp.CallToolResult, listTaskDependencyEdgesOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in specIDIn) (*mcp.CallToolResult, listTaskDependencyEdgesOut, error) {
		edges, err := svc.ListTaskDependencyEdges(ctx, in.SpecID)
		if err != nil {
			return nil, listTaskDependencyEdgesOut{}, err
		}
		return nil, listTaskDependencyEdgesOut{Edges: newTaskDependencyEdgeOuts(edges)}, nil
	}
}

type addParallelBatchIn struct {
	TasksDocID string `json:"tasksDocId" jsonschema:"the component's tasks doc id"`
	BatchLabel string `json:"batchLabel" jsonschema:"e.g. \"P1\", \"P2\""`
}

type parallelBatchResultOut struct {
	ParallelBatch parallelBatchOut `json:"parallelBatch"`
}

func addParallelBatch(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addParallelBatchIn) (*mcp.CallToolResult, parallelBatchResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addParallelBatchIn) (*mcp.CallToolResult, parallelBatchResultOut, error) {
		p, err := svc.AddParallelBatch(ctx, store.AddParallelBatchParams{TasksDocID: in.TasksDocID, BatchLabel: in.BatchLabel})
		if err != nil {
			return nil, parallelBatchResultOut{}, err
		}
		return nil, parallelBatchResultOut{ParallelBatch: newParallelBatchOut(p)}, nil
	}
}

type parallelBatchIDIn struct {
	ParallelBatchID string `json:"parallelBatchId" jsonschema:"the parallel batch's id"`
}

func deleteParallelBatch(svc *service.Service) func(context.Context, *mcp.CallToolRequest, parallelBatchIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in parallelBatchIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteParallelBatch(ctx, in.ParallelBatchID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type listParallelBatchesOut struct {
	ParallelBatches []parallelBatchOut `json:"parallelBatches"`
}

func listParallelBatches(svc *service.Service) func(context.Context, *mcp.CallToolRequest, tasksDocIDIn) (*mcp.CallToolResult, listParallelBatchesOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in tasksDocIDIn) (*mcp.CallToolResult, listParallelBatchesOut, error) {
		ps, err := svc.ListParallelBatches(ctx, in.TasksDocID)
		if err != nil {
			return nil, listParallelBatchesOut{}, err
		}
		return nil, listParallelBatchesOut{ParallelBatches: newParallelBatchOuts(ps)}, nil
	}
}

type parallelBatchMemberIn struct {
	ParallelBatchID string `json:"parallelBatchId" jsonschema:"the parallel batch's id"`
	TaskItemID      string `json:"taskItemId" jsonschema:"the task item's id"`
}

func addParallelBatchMember(svc *service.Service) func(context.Context, *mcp.CallToolRequest, parallelBatchMemberIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in parallelBatchMemberIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.AddParallelBatchMember(ctx, in.ParallelBatchID, in.TaskItemID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

func removeParallelBatchMember(svc *service.Service) func(context.Context, *mcp.CallToolRequest, parallelBatchMemberIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in parallelBatchMemberIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.RemoveParallelBatchMember(ctx, in.ParallelBatchID, in.TaskItemID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type listParallelBatchMembersOut struct {
	TaskItems []taskItemOut `json:"taskItems"`
}

func listParallelBatchMembers(svc *service.Service) func(context.Context, *mcp.CallToolRequest, parallelBatchIDIn) (*mcp.CallToolResult, listParallelBatchMembersOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in parallelBatchIDIn) (*mcp.CallToolResult, listParallelBatchMembersOut, error) {
		items, err := svc.ListParallelBatchMembers(ctx, in.ParallelBatchID)
		if err != nil {
			return nil, listParallelBatchMembersOut{}, err
		}
		outs := make([]taskItemOut, len(items))
		for i, item := range items {
			out, err := taskItemOutFor(ctx, svc, item)
			if err != nil {
				return nil, listParallelBatchMembersOut{}, err
			}
			outs[i] = out
		}
		return nil, listParallelBatchMembersOut{TaskItems: outs}, nil
	}
}

type addDefinitionOfDoneItemIn struct {
	SpecID      string `json:"specId" jsonschema:"the spec's id"`
	Description string `json:"description"`
}

type definitionOfDoneItemResultOut struct {
	DefinitionOfDoneItem definitionOfDoneItemOut `json:"definitionOfDoneItem"`
}

func addDefinitionOfDoneItem(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addDefinitionOfDoneItemIn) (*mcp.CallToolResult, definitionOfDoneItemResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addDefinitionOfDoneItemIn) (*mcp.CallToolResult, definitionOfDoneItemResultOut, error) {
		d, err := svc.AddDefinitionOfDoneItem(ctx, store.AddDefinitionOfDoneItemParams{SpecID: in.SpecID, Description: in.Description})
		if err != nil {
			return nil, definitionOfDoneItemResultOut{}, err
		}
		return nil, definitionOfDoneItemResultOut{DefinitionOfDoneItem: newDefinitionOfDoneItemOut(d)}, nil
	}
}

type updateDefinitionOfDoneItemIn struct {
	DefinitionOfDoneItemID string  `json:"definitionOfDoneItemId" jsonschema:"the DoD item's id"`
	Description            *string `json:"description,omitempty"`
	IsChecked              *bool   `json:"isChecked,omitempty"`
}

func updateDefinitionOfDoneItem(svc *service.Service) func(context.Context, *mcp.CallToolRequest, updateDefinitionOfDoneItemIn) (*mcp.CallToolResult, definitionOfDoneItemResultOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in updateDefinitionOfDoneItemIn) (*mcp.CallToolResult, definitionOfDoneItemResultOut, error) {
		d, err := svc.UpdateDefinitionOfDoneItem(ctx, in.DefinitionOfDoneItemID, store.UpdateDefinitionOfDoneItemParams{
			Description: in.Description, IsChecked: in.IsChecked,
		})
		if err != nil {
			return nil, definitionOfDoneItemResultOut{}, err
		}
		return nil, definitionOfDoneItemResultOut{DefinitionOfDoneItem: newDefinitionOfDoneItemOut(d)}, nil
	}
}

type definitionOfDoneItemIDIn struct {
	DefinitionOfDoneItemID string `json:"definitionOfDoneItemId" jsonschema:"the DoD item's id"`
}

func deleteDefinitionOfDoneItem(svc *service.Service) func(context.Context, *mcp.CallToolRequest, definitionOfDoneItemIDIn) (*mcp.CallToolResult, okOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in definitionOfDoneItemIDIn) (*mcp.CallToolResult, okOut, error) {
		if err := svc.DeleteDefinitionOfDoneItem(ctx, in.DefinitionOfDoneItemID); err != nil {
			return nil, okOut{}, err
		}
		return nil, okOut{OK: true}, nil
	}
}

type listDefinitionOfDoneItemsOut struct {
	DefinitionOfDoneItems []definitionOfDoneItemOut `json:"definitionOfDoneItems"`
}

func listDefinitionOfDoneItems(svc *service.Service) func(context.Context, *mcp.CallToolRequest, specIDIn) (*mcp.CallToolResult, listDefinitionOfDoneItemsOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in specIDIn) (*mcp.CallToolResult, listDefinitionOfDoneItemsOut, error) {
		ds, err := svc.ListDefinitionOfDoneItems(ctx, in.SpecID)
		if err != nil {
			return nil, listDefinitionOfDoneItemsOut{}, err
		}
		return nil, listDefinitionOfDoneItemsOut{DefinitionOfDoneItems: newDefinitionOfDoneItemOuts(ds)}, nil
	}
}
