import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SpecRepository } from '@rig/persistence';

import type { McpToolContext } from '../tool-registry.js';
import { withGuardrails } from '../guardrails/index.js';
import { ACTOR_DESCRIPTION, auditFrom, jsonResult, withToolErrorHandling } from './tool-helpers.js';

/**
 * Spec lifecycle tools (T5.2): `create_spec`, `get_spec`, `list_specs`. Every call is
 * implicitly scoped to the MCP session's bound `project_id` (Story 5.5) -- no tool call
 * ever carries an explicit project argument.
 *
 * T6 guardrails: `create_spec` (the only write here) runs known-actor validation
 * (T6.2) and inserts exactly one `audit_log` row in the same transaction (T6.3).
 */
export function registerSpecLifecycleTools(server: McpServer, context: McpToolContext): void {
	const repository = new SpecRepository(context.pool, context.events);

	server.registerTool(
		'create_spec',
		{
			description:
				"Creates a new spec (a .rig/specs/<feature-slug>/ equivalent), scoped to this session's bound project. Auto-seeds the requirements/design spec_stages rows (both not_started); the tasks stage has no stored row and is always derived from its components' progress.",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				slug: z.string().min(1).describe('Kebab-case feature slug, unique within this project.'),
				featureName: z.string().min(1).describe('Human-readable feature name.')
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const spec = await repository.createSpec(
					{ projectId: context.projectId, slug: args.slug, featureName: args.featureName },
					auditFrom(context, args.actor)
				);
				return jsonResult({ spec });
			})
		)
	);

	server.registerTool(
		'get_spec',
		{
			description: 'Fetches a single spec (by id) and its per-stage status, scoped to this session\'s bound project.',
			inputSchema: {
				specId: z.string().min(1)
			}
		},
		withToolErrorHandling(async (args) => {
			const spec = await repository.getSpec(args.specId);
			if (spec === null || spec.projectId !== context.projectId) {
				return jsonResult({ error: 'not_found', message: `spec not found: ${args.specId}` });
			}
			const stages = await repository.getSpecStages(args.specId);
			const tasksDocs = await repository.listTasksDocs(args.specId);
			return jsonResult({ spec, stages, tasksDocs });
		})
	);

	server.registerTool(
		'list_specs',
		{
			description: "Lists every spec that belongs to this session's bound project.",
			inputSchema: {}
		},
		withToolErrorHandling(async () => {
			const specs = await repository.listSpecs(context.projectId);
			return jsonResult({ specs });
		})
	);
}
