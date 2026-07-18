import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SpecRepository } from '@relentless/persistence';

import type { McpToolContext } from '../tool-registry.js';
import { withGuardrails } from '../guardrails/index.js';
import { ACTOR_DESCRIPTION, auditFrom, jsonResult, withToolErrorHandling } from './tool-helpers.js';

/**
 * `finalize_stage(stage, component?)` (T5.6, design §Data Model 9): predecessor-
 * approved ordering, per-stage completeness checks, cross-component cycle detection
 * (tasks stage), and design-redraft reconciliation. `component` is required and
 * meaningful only for `stage = 'tasks'` -- it transitions only that component's
 * `tasks_docs.status`, never a shared tasks-stage status (Story 7.1, 16.5). Every
 * rejection returns a distinct, rule-identifying error (Story 7.6).
 *
 * T6.6 (approve/deny exclusion): `finalizeStage`'s only possible transitions are
 * `not_started`/`redraft` -> `in_review` -- it never sets `status = 'approved'` and
 * never records a denial, for either `spec_stages` or `tasks_docs`. That is a
 * one-directional transition hardcoded in `SpecRepository.finalizeStage`'s SQL
 * (`update ... set status = 'in_review'`), not a caller-suppliable status argument,
 * so there is no payload shape a caller could pass here to reach `approved` or a
 * denial. Approve/deny is a human-only action entirely outside this feature's tool
 * catalog (Story 9.3); no tool name resembling "approve"/"deny" is registered
 * anywhere in this catalog, so calling one is rejected by the MCP SDK itself as an
 * unknown tool (Story 9.1, 9.2), before any state transition could occur.
 *
 * T6 guardrails: known-actor validation (T6.2) runs before any check; a successful
 * finalize inserts exactly one `audit_log` row (action = 'finalize') in the same
 * transaction as the status transition (T6.3).
 */
export function registerFinalizeStageTool(server: McpServer, context: McpToolContext): void {
	const repository = new SpecRepository(context.pool, context.events);

	server.registerTool(
		'finalize_stage',
		{
			description:
				"Transitions a spec stage (or, for 'tasks', one component's task document) from not_started/redraft to in_review, after predecessor-approved ordering, completeness, and (for tasks) cross-component cycle-detection checks all pass. Approve/deny is a separate, human-only action not exposed by any tool (Story 9).",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				specId: z.string().min(1),
				stage: z.enum(['requirements', 'design', 'tasks']),
				component: z.string().min(1).optional().describe("Component slug; required when stage='tasks', ignored otherwise.")
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const result = await repository.finalizeStage(args.specId, args.stage, args.component, auditFrom(context, args.actor));
				return jsonResult(result);
			})
		)
	);
}
