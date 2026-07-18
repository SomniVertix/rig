import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SpecRepository } from '@relentless/persistence';

import type { McpToolContext } from '../tool-registry.js';
import { assertParentCheckboxRule, withGuardrails } from '../guardrails/index.js';
import { ACTOR_DESCRIPTION, auditFrom, jsonResult, withToolErrorHandling } from './tool-helpers.js';

const COMPONENT_SLUG_DESCRIPTION = "The component's slug (one tasks_docs row per declared design_component) that this call is scoped to.";

/**
 * Tasks child tools (T5.5): add/update/delete for `task_item`, `task_file_touched`,
 * `parallel_batch`, `parallel_batch_member`, `tasks_flag` -- each resolving the correct
 * `tasks_docs` row via a component slug; add/update/delete for the spec-scoped
 * `definition_of_done_item`; and add/delete for `task_dependency_edge` (Story 16),
 * which rejects same-component pairs at the application layer with no cycle check
 * (that check lives in `finalize_stage`, T5.6).
 *
 * T6 guardrails: every write here runs known-actor validation (T6.2); `task_item`'s
 * `traceability`/`acceptanceCheck`/`description` also get empty/whitespace and
 * unquantified-quality-adjective content checks (T6.1). `update_task_item`
 * additionally enforces the parent/child checkbox rule (T6.5): marking a parent
 * `is_checked = true` while any child in the *same component's* task document is
 * still unchecked is rejected -- this only ever considers intra-component
 * `parent_item_id` structure, never cross-component `task_dependency_edges`. Every
 * successful write inserts exactly one `audit_log` row in the same transaction (T6.3).
 */
export function registerTasksTools(server: McpServer, context: McpToolContext): void {
	const repository = new SpecRepository(context.pool, context.events);
	const taskItemContentFields = ['description', 'traceability', 'acceptanceCheck'];

	server.registerTool(
		'add_task_item',
		{
			description:
				'Appends a new task/subtask to one component\'s task document. `item_id` (e.g. "1", "1.1") and `execution_order` are both derived append-only -- never explicit position arguments (Story 6.3, 6.4).',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				specId: z.string().min(1),
				componentSlug: z.string().min(1).describe(COMPONENT_SLUG_DESCRIPTION),
				parentItemId: z.string().min(1).optional().describe('The task_item id this is a subtask of, if any.'),
				title: z.string().min(1),
				description: z.string().min(1),
				traceability: z.string().min(1),
				suggestedAgent: z.string().min(1).optional(),
				acceptanceCheck: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(
				context.pool,
				{ notBlank: taskItemContentFields, noQualityAdjectives: taskItemContentFields },
				async (args) => {
					const taskItem = await repository.addTaskItem(
						args.specId,
						args.componentSlug,
						{
							parentItemId: args.parentItemId,
							title: args.title,
							description: args.description,
							traceability: args.traceability,
							suggestedAgent: args.suggestedAgent,
							acceptanceCheck: args.acceptanceCheck
						},
						auditFrom(context, args.actor)
					);
					return jsonResult({ taskItem });
				}
			)
		)
	);

	server.registerTool(
		'update_task_item',
		{
			description:
				'Updates fields (including the live is_checked state) on an existing task item in place. Marking a parent as checked while it has an unchecked child in the same component is rejected (Story 6.6).',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				id: z.string().min(1),
				title: z.string().min(1).optional(),
				description: z.string().min(1).optional(),
				traceability: z.string().min(1).optional(),
				suggestedAgent: z.string().min(1).optional(),
				acceptanceCheck: z.string().min(1).optional(),
				isChecked: z.boolean().optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(
				context.pool,
				{ notBlank: taskItemContentFields, noQualityAdjectives: taskItemContentFields },
				async (args) => {
					// T6.5: parent/child checkbox rule -- checked before the update itself.
					await assertParentCheckboxRule(context.pool, args.id, args.isChecked);
					const { id, ...rest } = args;
					const taskItem = await repository.updateTaskItem(id, rest, auditFrom(context, args.actor));
					return jsonResult({ taskItem });
				}
			)
		)
	);

	server.registerTool(
		'delete_task_item',
		{
			description: 'Deletes a task item (and its subtasks/files-touched, via cascade).',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteTaskItem(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);

	server.registerTool(
		'add_task_file_touched',
		{
			description: "Appends a file path to a task item's Files/areas touched list (ordinal = max + 1).",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				taskItemId: z.string().min(1),
				filePath: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const taskFileTouched = await repository.addTaskFileTouched(args.taskItemId, args.filePath, auditFrom(context, args.actor));
				return jsonResult({ taskFileTouched });
			})
		)
	);

	server.registerTool(
		'update_task_file_touched',
		{
			description: 'Updates an existing files-touched entry in place.',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1), filePath: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const taskFileTouched = await repository.updateTaskFileTouched(args.id, args.filePath, auditFrom(context, args.actor));
				return jsonResult({ taskFileTouched });
			})
		)
	);

	server.registerTool(
		'delete_task_file_touched',
		{
			description: 'Deletes a files-touched entry.',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteTaskFileTouched(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);

	server.registerTool(
		'add_parallel_batch',
		{
			description:
				'Appends a new parallel-execution batch to a component\'s task document (batch_order = max + 1; batch_label e.g. "P1" is derived from it, never caller-supplied).',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				specId: z.string().min(1),
				componentSlug: z.string().min(1).describe(COMPONENT_SLUG_DESCRIPTION)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const parallelBatch = await repository.addParallelBatch(args.specId, args.componentSlug, auditFrom(context, args.actor));
				return jsonResult({ parallelBatch });
			})
		)
	);

	server.registerTool(
		'update_parallel_batch',
		{
			description: 'Repositions/relabels an existing parallel batch. Explicit call only -- never automatic reindex (Story 6.4).',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				id: z.string().min(1),
				batchLabel: z.string().min(1).optional(),
				batchOrder: z.number().int().positive().optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const { id, ...rest } = args;
				const parallelBatch = await repository.updateParallelBatch(id, rest, auditFrom(context, args.actor));
				return jsonResult({ parallelBatch });
			})
		)
	);

	server.registerTool(
		'delete_parallel_batch',
		{
			description: 'Deletes a parallel batch (and its memberships, via cascade).',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteParallelBatch(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);

	server.registerTool(
		'add_parallel_batch_member',
		{
			description: 'Adds a task item to a parallel batch.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				batchId: z.string().min(1),
				taskItemId: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const parallelBatchMember = await repository.addParallelBatchMember(args.batchId, args.taskItemId, auditFrom(context, args.actor));
				return jsonResult({ parallelBatchMember });
			})
		)
	);

	server.registerTool(
		'update_parallel_batch_member',
		{
			description: 'Changes which task item a batch membership points to.',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1), taskItemId: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const parallelBatchMember = await repository.updateParallelBatchMember(args.id, args.taskItemId, auditFrom(context, args.actor));
				return jsonResult({ parallelBatchMember });
			})
		)
	);

	server.registerTool(
		'delete_parallel_batch_member',
		{
			description: 'Removes a task item from a parallel batch.',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteParallelBatchMember(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);

	server.registerTool(
		'add_tasks_flag',
		{
			description: 'Appends a new Flags entry to a component\'s task document (ordinal = max + 1).',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				specId: z.string().min(1),
				componentSlug: z.string().min(1).describe(COMPONENT_SLUG_DESCRIPTION),
				description: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const tasksFlag = await repository.addTasksFlag(args.specId, args.componentSlug, args.description, auditFrom(context, args.actor));
				return jsonResult({ tasksFlag });
			})
		)
	);

	server.registerTool(
		'update_tasks_flag',
		{
			description: 'Updates an existing tasks-doc Flags entry in place.',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1), description: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const tasksFlag = await repository.updateTasksFlag(args.id, args.description, auditFrom(context, args.actor));
				return jsonResult({ tasksFlag });
			})
		)
	);

	server.registerTool(
		'delete_tasks_flag',
		{
			description: 'Deletes a tasks-doc Flags entry.',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteTasksFlag(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);

	// definition_of_done_item is spec-scoped (shared across every component, Story
	// 16.9) and carries a live is_checked toggle alongside its description, so it
	// gets bespoke tools rather than the shared ordinal+description helper.
	server.registerTool(
		'add_definition_of_done_item',
		{
			description: "Appends a new spec-wide Definition of Done item (ordinal = max + 1). Shared across every component's task document.",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				specId: z.string().min(1),
				description: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const definitionOfDoneItem = await repository.addDefinitionOfDoneItem(args.specId, args.description, auditFrom(context, args.actor));
				return jsonResult({ definitionOfDoneItem });
			})
		)
	);

	server.registerTool(
		'update_definition_of_done_item',
		{
			description: 'Updates a Definition of Done item\'s description and/or its live is_checked state.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				id: z.string().min(1),
				description: z.string().min(1).optional(),
				isChecked: z.boolean().optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const { id, ...rest } = args;
				const definitionOfDoneItem = await repository.updateDefinitionOfDoneItem(id, rest, auditFrom(context, args.actor));
				return jsonResult({ definitionOfDoneItem });
			})
		)
	);

	server.registerTool(
		'delete_definition_of_done_item',
		{
			description: 'Deletes a Definition of Done item.',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteDefinitionOfDoneItem(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);

	server.registerTool(
		'add_task_dependency_edge',
		{
			description:
				'Adds a cross-component dependency edge ("from" must complete before "to"). Same-component pairs are rejected at the application layer (Story 16.2); no cycle check is performed here (Story 16.3) -- see finalize_stage.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				specId: z.string().min(1),
				fromTaskItemId: z.string().min(1),
				toTaskItemId: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const taskDependencyEdge = await repository.addTaskDependencyEdge(
					args.specId,
					{ fromTaskItemId: args.fromTaskItemId, toTaskItemId: args.toTaskItemId },
					auditFrom(context, args.actor)
				);
				return jsonResult({ taskDependencyEdge });
			})
		)
	);

	server.registerTool(
		'delete_task_dependency_edge',
		{
			description: 'Deletes a cross-component dependency edge.',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteTaskDependencyEdge(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);
}
