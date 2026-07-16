import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SpecRepository } from '@relentless/persistence';

import type { McpToolContext } from '../tool-registry.js';
import { withGuardrails } from '../guardrails/index.js';
import { ACTOR_DESCRIPTION, auditFrom, jsonResult, registerOrdinalDescriptionTools, withToolErrorHandling } from './tool-helpers.js';

/**
 * Design child tools (T5.4): `set_design_overview`, `set_design_architecture`, add/
 * update/delete for `design_data_model_entry`, `design_traceability`,
 * `design_alternative`, `design_open_risk`, `design_flag`, and the new
 * `design_component` tool (Story 15).
 *
 * T6 guardrails: every write here runs known-actor validation (T6.2); `content` on
 * `design_data_model_entry` and `addressedBy` on `design_traceability` also get
 * empty/whitespace and unquantified-quality-adjective content checks (T6.1). Every
 * successful write inserts exactly one `audit_log` row in the same transaction (T6.3).
 */
export function registerDesignTools(server: McpServer, context: McpToolContext): void {
	const repository = new SpecRepository(context.pool);

	server.registerTool(
		'set_design_overview',
		{
			description: "Creates or updates a spec's design.md \"## Overview\" section (upsert).",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				specId: z.string().min(1),
				featureName: z.string().min(1),
				overview: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const design = await repository.setDesignOverview(
					args.specId,
					{ featureName: args.featureName, overview: args.overview },
					auditFrom(context, args.actor)
				);
				return jsonResult({ design });
			})
		)
	);

	server.registerTool(
		'set_design_architecture',
		{
			description: "Creates or updates a spec's design.md \"## Architecture\" section (upsert).",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				specId: z.string().min(1),
				architecture: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const design = await repository.setDesignArchitecture(args.specId, args.architecture, auditFrom(context, args.actor));
				return jsonResult({ design });
			})
		)
	);

	const kebabCaseSlug = z
		.string()
		.min(1)
		.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be kebab-case (lowercase letters/digits, hyphen-separated)');

	server.registerTool(
		'add_design_component',
		{
			description:
				'Declares a new component in design.md\'s "## Components" section (ordinal = max + 1). Slug must be kebab-case and unique within the design (Story 15.3).',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				designId: z.string().min(1),
				slug: kebabCaseSlug,
				displayName: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const designComponent = await repository.addDesignComponent(
					args.designId,
					{ slug: args.slug, displayName: args.displayName },
					auditFrom(context, args.actor)
				);
				return jsonResult({ designComponent });
			})
		)
	);

	server.registerTool(
		'update_design_component',
		{
			description: 'Updates an existing design component (slug/display name/ordinal). Repositioning requires this explicit call -- never automatic (Story 6.4).',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				id: z.string().min(1),
				slug: kebabCaseSlug.optional(),
				displayName: z.string().min(1).optional(),
				ordinal: z.number().int().positive().optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const { id, ...rest } = args;
				const designComponent = await repository.updateDesignComponent(id, rest, auditFrom(context, args.actor));
				return jsonResult({ designComponent });
			})
		)
	);

	server.registerTool(
		'delete_design_component',
		{
			description: 'Deletes a declared design component (and its component task document, via cascade).',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteDesignComponent(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);

	server.registerTool(
		'add_design_data_model_entry',
		{
			description: 'Appends a new "## Data Model / Interfaces" entry (ordinal = max + 1).',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				designId: z.string().min(1),
				name: z.string().min(1),
				kind: z.string().min(1),
				content: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['content'], noQualityAdjectives: ['content'] }, async (args) => {
				const designDataModelEntry = await repository.addDesignDataModelEntry(
					args.designId,
					{ name: args.name, kind: args.kind, content: args.content },
					auditFrom(context, args.actor)
				);
				return jsonResult({ designDataModelEntry });
			})
		)
	);

	server.registerTool(
		'update_design_data_model_entry',
		{
			description: 'Updates an existing Data Model / Interfaces entry in place.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				id: z.string().min(1),
				name: z.string().min(1).optional(),
				kind: z.string().min(1).optional(),
				content: z.string().min(1).optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['content'], noQualityAdjectives: ['content'] }, async (args) => {
				const { id, ...rest } = args;
				const designDataModelEntry = await repository.updateDesignDataModelEntry(id, rest, auditFrom(context, args.actor));
				return jsonResult({ designDataModelEntry });
			})
		)
	);

	server.registerTool(
		'delete_design_data_model_entry',
		{
			description: 'Deletes a Data Model / Interfaces entry.',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteDesignDataModelEntry(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);

	server.registerTool(
		'add_design_traceability',
		{
			description: 'Appends a new "## Requirement Traceability" row (ordinal = max + 1).',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				designId: z.string().min(1),
				userStoryId: z.string().min(1).optional(),
				requirementLabel: z.string().min(1),
				addressedBy: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['addressedBy'], noQualityAdjectives: ['addressedBy'] }, async (args) => {
				const designTraceability = await repository.addDesignTraceability(
					args.designId,
					{
						userStoryId: args.userStoryId,
						requirementLabel: args.requirementLabel,
						addressedBy: args.addressedBy
					},
					auditFrom(context, args.actor)
				);
				return jsonResult({ designTraceability });
			})
		)
	);

	server.registerTool(
		'update_design_traceability',
		{
			description: 'Updates an existing Requirement Traceability row in place.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				id: z.string().min(1),
				userStoryId: z.string().min(1).optional(),
				requirementLabel: z.string().min(1).optional(),
				addressedBy: z.string().min(1).optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['addressedBy'], noQualityAdjectives: ['addressedBy'] }, async (args) => {
				const { id, ...rest } = args;
				const designTraceability = await repository.updateDesignTraceability(id, rest, auditFrom(context, args.actor));
				return jsonResult({ designTraceability });
			})
		)
	);

	server.registerTool(
		'delete_design_traceability',
		{
			description: 'Deletes a Requirement Traceability row.',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteDesignTraceability(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);

	registerOrdinalDescriptionTools(server, context, 'design_alternative', 'designId', 'Parent design document id.', {
		add: (parentId, description, audit) => repository.addDesignAlternative(parentId, description, audit),
		update: (id, description, audit) => repository.updateDesignAlternative(id, description, audit),
		delete: (id, audit) => repository.deleteDesignAlternative(id, audit)
	});

	registerOrdinalDescriptionTools(server, context, 'design_open_risk', 'designId', 'Parent design document id.', {
		add: (parentId, description, audit) => repository.addDesignOpenRisk(parentId, description, audit),
		update: (id, description, audit) => repository.updateDesignOpenRisk(id, description, audit),
		delete: (id, audit) => repository.deleteDesignOpenRisk(id, audit)
	});

	registerOrdinalDescriptionTools(server, context, 'design_flag', 'designId', 'Parent design document id.', {
		add: (parentId, description, audit) => repository.addDesignFlag(parentId, description, audit),
		update: (id, description, audit) => repository.updateDesignFlag(id, description, audit),
		delete: (id, audit) => repository.deleteDesignFlag(id, audit)
	});
}
