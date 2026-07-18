import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SpecRepository } from '@rig/persistence';

import type { McpToolContext } from '../tool-registry.js';
import { withGuardrails } from '../guardrails/index.js';
import { ACTOR_DESCRIPTION, auditFrom, jsonResult, registerOrdinalDescriptionTools, withToolErrorHandling } from './tool-helpers.js';

/**
 * Requirements child tools (T5.3): `set_requirements_overview` plus add/update/delete
 * for `user_story`, `acceptance_criterion`, `non_goal`, `assumption_open_question`, and
 * `glossary_term`. Adding a child row whose parent does not exist is rejected --
 * enforced by the FK constraint and surfaced as a `parent_not_found` rule (Story 7.3).
 * Every add tool places the new row at max(ordinal/criterion_number)+1 (Story 6.3).
 *
 * T6 guardrails: every write here runs known-actor validation (T6.2, via
 * `withGuardrails`) plus, for `user_story`, empty/whitespace and
 * unquantified-quality-adjective content checks (T6.1) on
 * `role`/`capability`/`benefit`/`rationale`; for `acceptance_criterion`, EARS
 * structural validation of `full_text` against its declared `ears_pattern`. Every
 * successful write also inserts exactly one `audit_log` row in the same transaction
 * (T6.3) -- `args.actor` is already confirmed against `known_actors` by the time a
 * handler body runs, so it's passed straight into `auditFrom` with no re-check.
 */
export function registerRequirementsTools(server: McpServer, context: McpToolContext): void {
	const repository = new SpecRepository(context.pool, context.events);
	const userStoryFields = ['role', 'capability', 'benefit', 'rationale'];

	server.registerTool(
		'set_requirements_overview',
		{
			description: "Creates or updates a spec's requirements.md \"## Overview\" section (upsert).",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				specId: z.string().min(1),
				featureName: z.string().min(1),
				overview: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const requirements = await repository.setRequirementsOverview(
					args.specId,
					{ featureName: args.featureName, overview: args.overview },
					auditFrom(context, args.actor)
				);
				return jsonResult({ requirements });
			})
		)
	);

	server.registerTool(
		'add_user_story',
		{
			description: 'Appends a new user story to a requirements document (story_number = max + 1).',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				requirementsId: z.string().min(1),
				title: z.string().min(1),
				role: z.string().min(1),
				capability: z.string().min(1),
				benefit: z.string().min(1),
				rationale: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: userStoryFields, noQualityAdjectives: userStoryFields }, async (args) => {
				const userStory = await repository.addUserStory(
					args.requirementsId,
					{
						title: args.title,
						role: args.role,
						capability: args.capability,
						benefit: args.benefit,
						rationale: args.rationale
					},
					auditFrom(context, args.actor)
				);
				return jsonResult({ userStory });
			})
		)
	);

	server.registerTool(
		'update_user_story',
		{
			description: 'Updates fields on an existing user story in place.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				id: z.string().min(1),
				title: z.string().min(1).optional(),
				role: z.string().min(1).optional(),
				capability: z.string().min(1).optional(),
				benefit: z.string().min(1).optional(),
				rationale: z.string().min(1).optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: userStoryFields, noQualityAdjectives: userStoryFields }, async (args) => {
				const { id, ...rest } = args;
				const userStory = await repository.updateUserStory(id, rest, auditFrom(context, args.actor));
				return jsonResult({ userStory });
			})
		)
	);

	server.registerTool(
		'delete_user_story',
		{
			description: 'Deletes a user story (and its acceptance criteria, via cascade).',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteUserStory(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);

	const earsPatternSchema = z.enum(['ubiquitous', 'event_driven', 'state_driven', 'unwanted_behavior', 'complex_conditional', 'optional_feature']);

	server.registerTool(
		'add_acceptance_criterion',
		{
			description: 'Appends a new EARS acceptance criterion to a user story (criterion_number = max + 1).',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				userStoryId: z.string().min(1),
				earsPattern: earsPatternSchema,
				triggerClause: z.string().optional(),
				conditionClause: z.string().optional(),
				stateClause: z.string().optional(),
				responseClause: z.string().min(1),
				fullText: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { earsAcceptanceCriterion: { patternField: 'earsPattern', textField: 'fullText' } }, async (args) => {
				const acceptanceCriterion = await repository.addAcceptanceCriterion(
					args.userStoryId,
					{
						earsPattern: args.earsPattern,
						triggerClause: args.triggerClause,
						conditionClause: args.conditionClause,
						stateClause: args.stateClause,
						responseClause: args.responseClause,
						fullText: args.fullText
					},
					auditFrom(context, args.actor)
				);
				return jsonResult({ acceptanceCriterion });
			})
		)
	);

	server.registerTool(
		'update_acceptance_criterion',
		{
			description: 'Updates fields on an existing acceptance criterion in place.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				id: z.string().min(1),
				earsPattern: earsPatternSchema.optional(),
				triggerClause: z.string().optional(),
				conditionClause: z.string().optional(),
				stateClause: z.string().optional(),
				responseClause: z.string().min(1).optional(),
				fullText: z.string().min(1).optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { earsAcceptanceCriterion: { patternField: 'earsPattern', textField: 'fullText' } }, async (args) => {
				const { id, ...rest } = args;
				const acceptanceCriterion = await repository.updateAcceptanceCriterion(id, rest, auditFrom(context, args.actor));
				return jsonResult({ acceptanceCriterion });
			})
		)
	);

	server.registerTool(
		'delete_acceptance_criterion',
		{
			description: 'Deletes an acceptance criterion.',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteAcceptanceCriterion(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);

	registerOrdinalDescriptionTools(server, context, 'non_goal', 'requirementsId', 'Parent requirements document id.', {
		add: (parentId, description, audit) => repository.addNonGoal(parentId, description, audit),
		update: (id, description, audit) => repository.updateNonGoal(id, description, audit),
		delete: (id, audit) => repository.deleteNonGoal(id, audit)
	});

	registerOrdinalDescriptionTools(server, context, 'assumption_open_question', 'requirementsId', 'Parent requirements document id.', {
		add: (parentId, description, audit) => repository.addAssumptionOpenQuestion(parentId, description, audit),
		update: (id, description, audit) => repository.updateAssumptionOpenQuestion(id, description, audit),
		delete: (id, audit) => repository.deleteAssumptionOpenQuestion(id, audit)
	});

	server.registerTool(
		'add_glossary_term',
		{
			description: 'Appends a new glossary term to a requirements document.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				requirementsId: z.string().min(1),
				term: z.string().min(1),
				definition: z.string().min(1).optional(),
				externalReference: z.string().min(1).optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const glossaryTerm = await repository.addGlossaryTerm(
					args.requirementsId,
					{
						term: args.term,
						definition: args.definition,
						externalReference: args.externalReference
					},
					auditFrom(context, args.actor)
				);
				return jsonResult({ glossaryTerm });
			})
		)
	);

	server.registerTool(
		'update_glossary_term',
		{
			description: 'Updates an existing glossary term in place.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				id: z.string().min(1),
				term: z.string().min(1).optional(),
				definition: z.string().min(1).optional(),
				externalReference: z.string().min(1).optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const { id, ...rest } = args;
				const glossaryTerm = await repository.updateGlossaryTerm(id, rest, auditFrom(context, args.actor));
				return jsonResult({ glossaryTerm });
			})
		)
	);

	server.registerTool(
		'delete_glossary_term',
		{
			description: 'Deletes a glossary term.',
			inputSchema: { actor: z.string().min(1).describe(ACTOR_DESCRIPTION), id: z.string().min(1) }
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.deleteGlossaryTerm(args.id, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.id });
			})
		)
	);
}
