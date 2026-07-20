import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import type { SpecStageRecord } from '@rig/persistence';
import { SpecRepository, SpecRepositoryError, ensureProject } from '@rig/persistence';

/**
 * rest-bff-api (T4): the REST BFF's read-only surface -- every route here calls
 * `SpecRepository` directly (never through the MCP tool layer) and is registered with
 * `.withTypeProvider<ZodTypeProvider>()` so both the request (params/querystring) and
 * response bodies are validated/serialized against the Zod schemas declared below
 * (Requirements Story 1 AC1, Story 2 AC1, Story 3 AC1/AC2, Story 5 AC1).
 *
 * Handlers that need a 404 simply `throw new SpecRepositoryError('not_found', ...)` and
 * let `app.ts`'s shared `specRepositoryErrorHandler` translate it -- matching the
 * existing MCP `render_document`/`get_spec` tools' `SpecRepositoryError` reuse
 * (tool-helpers.ts) rather than inventing a second error convention for REST.
 *
 * Project scoping (Design "Alternatives -- Project scoping"): only `GET /api/specs`
 * needs a project at all, because `listSpecs(projectId)` is the only `SpecRepository`
 * read method that takes a `projectId` argument -- every other route here resolves by
 * `specId`/`sessionId` alone (both already globally unique), so no `project` query
 * param is required (or accepted) on them. `GET /api/specs` resolves its project via
 * `ensureProject(pool, project)` from a required `project` query param -- the design's
 * "defaulting to a single configured/only project" is flagged as not concretely
 * specified, so no implicit default is invented here.
 */

const stageStatusSchema = z.enum(['not_started', 'in_review', 'approved']);
const stageNameSchema = z.enum(['requirements', 'design', 'tasks']);

const specStagesSchema = z.object({
	requirements: stageStatusSchema,
	design: stageStatusSchema,
	tasks: stageStatusSchema
});

const specSummarySchema = z.object({
	id: z.string(),
	slug: z.string(),
	featureName: z.string(),
	currentStage: stageNameSchema,
	stages: specStagesSchema
});

const listSpecsQuerySchema = z.object({
	project: z.string().min(1)
});

const specIdParamsSchema = z.object({
	specId: z.string().min(1)
});

const documentParamsSchema = z.object({
	specId: z.string().min(1),
	stage: stageNameSchema
});

const documentQuerySchema = z.object({
	component: z.string().min(1).optional()
});

const documentResponseSchema = z.object({
	markdown: z.string()
});

/** `spec_stages` always has exactly one row per (spec, stage_name) -- seeded by the
 * `specs_seed_stages` trigger at spec-creation time (schema.sql) -- so the `?? 'not_started'`
 * fallback below is only a defensive default, never expected to be exercised. */
function stagesToObject(stages: SpecStageRecord[]): z.infer<typeof specStagesSchema> {
	const byName = new Map(stages.map((stage) => [stage.stageName, stage.status]));
	return {
		requirements: (byName.get('requirements') as z.infer<typeof stageStatusSchema> | undefined) ?? 'not_started',
		design: (byName.get('design') as z.infer<typeof stageStatusSchema> | undefined) ?? 'not_started',
		tasks: (byName.get('tasks') as z.infer<typeof stageStatusSchema> | undefined) ?? 'not_started'
	};
}

/** `SpecRecord.currentStage` is derived live by `SpecRepository` (spec-stage-tracking-fixes
 * W1), not read off the dead `specs.current_stage` column -- this is just a defensive
 * narrowing against the same schema used for the response, kept as cheap insurance rather
 * than because the value is untrusted. */
function toStageName(value: string): z.infer<typeof stageNameSchema> {
	return stageNameSchema.parse(value);
}

export function registerReadRoutes(app: FastifyInstance, pool: Pool): void {
	const repository = new SpecRepository(pool);
	const typedApp = app.withTypeProvider<ZodTypeProvider>();

	typedApp.get(
		'/api/specs',
		{
			schema: {
				querystring: listSpecsQuerySchema,
				response: { 200: z.array(specSummarySchema) }
			}
		},
		async (request) => {
			const projectId = await ensureProject(pool, request.query.project);
			const specs = await repository.listSpecs(projectId);
			return await Promise.all(
				specs.map(async (spec) => ({
					id: spec.id,
					slug: spec.slug,
					featureName: spec.featureName,
					currentStage: toStageName(spec.currentStage),
					stages: stagesToObject(await repository.getSpecStages(spec.id))
				}))
			);
		}
	);

	typedApp.get(
		'/api/specs/:specId',
		{
			schema: {
				params: specIdParamsSchema,
				response: { 200: specSummarySchema }
			}
		},
		async (request) => {
			const spec = await repository.getSpec(request.params.specId);
			if (spec === null) {
				throw new SpecRepositoryError('not_found', `spec not found: ${request.params.specId}`);
			}
			const stages = await repository.getSpecStages(spec.id);
			return {
				id: spec.id,
				slug: spec.slug,
				featureName: spec.featureName,
				currentStage: toStageName(spec.currentStage),
				stages: stagesToObject(stages)
			};
		}
	);

	typedApp.get(
		'/api/specs/:specId/stages/:stage/document',
		{
			schema: {
				params: documentParamsSchema,
				querystring: documentQuerySchema,
				response: { 200: documentResponseSchema }
			}
		},
		async (request) => {
			const markdown = await repository.renderDocument(request.params.specId, request.params.stage, request.query.component);
			return { markdown };
		}
	);
}
