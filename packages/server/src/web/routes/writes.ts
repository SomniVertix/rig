import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { SpecRepository } from '@rig/persistence';

/**
 * rest-bff-api (T5): the REST BFF's approve/deny write surface -- like reads.ts (T4),
 * every route here calls `SpecRepository` directly (`approveStage`/`denyStage`),
 * never through the MCP tool layer's `requireKnownActor`/`withGuardrails` wrapping --
 * those wrap MCP *tools*, not repository methods, so there is nothing to bypass so
 * much as nothing to attach to in the first place (design's grounding note).
 *
 * The actor recorded on every `audit_log` row this surface writes is the fixed
 * literal `'web-ui'`, never a caller-supplied value, and it is never checked against
 * `known_actors` -- a human approving/denying from the web UI is not required to be a
 * pre-registered agent/skill (Requirements Story 6 AC2). There is likewise no
 * `Authorization` header or other credential check anywhere on this path.
 *
 * `reason` is accepted on the request body (a human's rationale for the decision) but
 * is never persisted -- neither `spec_stages` nor `tasks_docs` has a column for it
 * (design §Flags) -- so it is read (for schema/response-shape symmetry with a future
 * UI) and simply discarded rather than silently rejected by an unvalidated body.
 */

const stageParamSchema = z.enum(['requirements', 'design', 'tasks']);

const stageActionParamsSchema = z.object({
	specId: z.string().min(1),
	stage: stageParamSchema
});

// `.default({})`: a caller may POST with no body at all (component only matters for
// stage='tasks', so requirements/design approvals never need one) -- Fastify hands the
// validator `undefined` in that case, and this default keeps that a valid, fully-typed
// `{}` rather than a schema-validation rejection before the request ever reaches
// `SpecRepository` (whose own `component_required` check is what Story 2 AC actually
// wants surfaced as the 400).
const stageActionBodySchema = z
	.object({
		component: z.string().min(1).optional(),
		reason: z.string().min(1).optional()
	})
	.default({});

const approveResponseSchema = z.object({
	stage: stageParamSchema,
	componentSlug: z.string().optional(),
	status: z.literal('approved')
});

const denyResponseSchema = z.object({
	stage: stageParamSchema,
	componentSlug: z.string().optional(),
	status: z.literal('not_started')
});

/** Fixed literal actor for every mutation made through this REST surface (design
 * §Flags) -- never sourced from a header, session, or request body. */
const WEB_UI_ACTOR = 'web-ui';

export function registerWriteRoutes(app: FastifyInstance, pool: Pool): void {
	const repository = new SpecRepository(pool);
	const typedApp = app.withTypeProvider<ZodTypeProvider>();

	typedApp.post(
		'/api/specs/:specId/stages/:stage/approve',
		{
			schema: {
				params: stageActionParamsSchema,
				body: stageActionBodySchema,
				response: { 200: approveResponseSchema }
			}
		},
		async (request) => {
			// Not project-scoped (Design "Alternatives -- Project scoping"): this route
			// resolves entirely by `specId`/`stage`, so `projectId` on the audit row is
			// always null rather than derived from a query param or session.
			const projectId: string | null = null;
			return await repository.approveStage(request.params.specId, request.params.stage, request.body.component, {
				actor: WEB_UI_ACTOR,
				projectId
			});
		}
	);

	typedApp.post(
		'/api/specs/:specId/stages/:stage/deny',
		{
			schema: {
				params: stageActionParamsSchema,
				body: stageActionBodySchema,
				response: { 200: denyResponseSchema }
			}
		},
		async (request) => {
			const projectId: string | null = null;
			return await repository.denyStage(request.params.specId, request.params.stage, request.body.component, {
				actor: WEB_UI_ACTOR,
				projectId
			});
		}
	);
}
