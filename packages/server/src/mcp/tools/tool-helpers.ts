import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { AuditInfo } from '@rig/persistence';
import { SpecRepositoryError } from '@rig/persistence';
import type { OrdinalDescriptionRecord } from '@rig/persistence';
import type { Pool } from 'pg';

import { requireKnownActor } from '../guardrails/index.js';
import type { McpToolContext } from '../tool-registry.js';

/**
 * Shared response-shaping helpers for every spec-doc-tools handler (T5.2-T5.8): a
 * uniform success envelope, and an error envelope that surfaces `SpecRepositoryError`
 * and T6's `GuardrailError` (both share the same `{ rule, message }` shape) as a
 * distinct, rule-identifying error (Story 7.6, 12.3) rather than collapsing every
 * rejection into one generic failure.
 */

/** Every write tool requires a caller-supplied `actor` argument (Story 11.1). Its
 * validation against `known_actors` is wired in by T6.2's guardrails -- this field's
 * presence in every write tool's input schema is what T5 sets up for that to attach to. */
export const ACTOR_DESCRIPTION = 'Name of the calling agent/actor. Required on every write.';

export function jsonResult(value: unknown): CallToolResult {
	return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** Duck-types any rejection carrying a stable `rule` string -- `SpecRepositoryError`
 * (T5.1) and `GuardrailError` (T6) both match this shape, without this module needing
 * an `instanceof` check against a guardrails-module class (Story 12.3, 12.4). */
function hasRule(error: unknown): error is Error & { rule: string } {
	return error instanceof Error && typeof (error as { rule?: unknown }).rule === 'string';
}

export function errorResult(error: unknown): CallToolResult {
	if (error instanceof SpecRepositoryError || hasRule(error)) {
		return {
			content: [{ type: 'text', text: JSON.stringify({ error: error.rule, message: error.message }) }],
			isError: true
		};
	}
	const message = error instanceof Error ? error.message : String(error);
	return {
		content: [{ type: 'text', text: JSON.stringify({ error: 'internal_error', message }) }],
		isError: true
	};
}

/** Builds the `AuditInfo` every `SpecRepository` mutation method requires (T6.3)
 * from the write tool's required `actor` argument and the session's bound project. */
export function auditFrom(context: McpToolContext, actor: string): AuditInfo {
	return { actor, projectId: context.projectId };
}

/** Validates `actor` against `known_actors` (T6.2) before any write touches the
 * database (Story 11.1, 11.4). Every write-tool handler calls this first. */
export async function requireActor(pool: Pool, actor: unknown): Promise<string> {
	return await requireKnownActor(pool, actor);
}

/** Wraps a tool handler so any thrown error (repository rejection or otherwise)
 * becomes a structured `CallToolResult` instead of an uncaught exception. */
export function withToolErrorHandling<Args extends unknown[]>(
	handler: (...args: Args) => Promise<CallToolResult>
): (...args: Args) => Promise<CallToolResult> {
	return async (...args: Args) => {
		try {
			return await handler(...args);
		} catch (error) {
			return errorResult(error);
		}
	};
}

/**
 * Registers the add/update/delete triple for one of the several child tables that all
 * share the same "ordinal + free-text description" shape (`non_goal`,
 * `assumption_open_question`, `design_alternative`, `design_open_risk`, `design_flag`,
 * `tasks_flag`) -- factored once here so the fine-grained tool catalog (Story 6.1, 6.2)
 * doesn't repeat the same three registrations six times over.
 */
export function registerOrdinalDescriptionTools(
	server: McpServer,
	context: McpToolContext,
	toolNamePrefix: string,
	parentParamName: string,
	parentDescription: string,
	crud: {
		add(parentId: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord>;
		update(id: string, description: string, audit: AuditInfo): Promise<OrdinalDescriptionRecord>;
		delete(id: string, audit: AuditInfo): Promise<void>;
	}
): void {
	// A dynamic key (`parentParamName`) in the input schema defeats zod's usual
	// per-field type inference, so the add schema/handler are typed via an explicit
	// `Record<string, ZodTypeAny>` shape instead of an object literal with a
	// computed property.
	const addInputSchema: Record<string, z.ZodTypeAny> = {
		actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
		description: z.string().min(1)
	};
	addInputSchema[parentParamName] = z.string().min(1).describe(parentDescription);

	server.registerTool(
		`add_${toolNamePrefix}`,
		{
			description: `Appends a new ${toolNamePrefix} at the end of its sequence (max ordinal + 1) -- never an explicit position.`,
			inputSchema: addInputSchema
		},
		withToolErrorHandling(async (args: Record<string, unknown>) => {
			const parentId = args[parentParamName];
			const description = args.description;
			if (typeof parentId !== 'string' || typeof description !== 'string') {
				throw new Error(`add_${toolNamePrefix}: missing required arguments`);
			}
			const actor = await requireActor(context.pool, args.actor);
			const record = await crud.add(parentId, description, auditFrom(context, actor));
			return jsonResult({ [toolNamePrefix]: record });
		})
	);

	server.registerTool(
		`update_${toolNamePrefix}`,
		{
			description: `Updates an existing ${toolNamePrefix} row's description in place.`,
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				id: z.string().min(1),
				description: z.string().min(1)
			}
		},
		withToolErrorHandling(async (args) => {
			const actor = await requireActor(context.pool, args.actor);
			const record = await crud.update(args.id, args.description, auditFrom(context, actor));
			return jsonResult({ [toolNamePrefix]: record });
		})
	);

	server.registerTool(
		`delete_${toolNamePrefix}`,
		{
			description: `Deletes a ${toolNamePrefix} row.`,
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				id: z.string().min(1)
			}
		},
		withToolErrorHandling(async (args) => {
			const actor = await requireActor(context.pool, args.actor);
			await crud.delete(args.id, auditFrom(context, actor));
			return jsonResult({ deleted: true, id: args.id });
		})
	);
}
