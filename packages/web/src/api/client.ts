/**
 * Typed `fetch` wrappers for every rest-bff-api endpoint (Design §Data Model, "REST
 * endpoint contract (rest-bff-api)" / "SPA structure + data-fetch/invalidation contract
 * (web-spa) (module)"; Requirements Story 5 AC1, Story 2 AC1/AC3). Response shapes here
 * mirror the Zod schemas actually served by `packages/server/src/web/routes/reads.ts`
 * (and the write paths' documented symmetry with `SpecRepository.finalizeStage`), so a
 * screen calling these functions gets exactly what the running daemon returns.
 *
 * All paths are relative -- in dev, Vite's `server.proxy` (`vite.config.ts`) forwards
 * `/api/*` to the daemon's web listener; in production the same Fastify instance serves
 * both the API and this SPA's static assets from the same origin. No base URL needed.
 *
 * `queryKeys` mirrors the design's query-key <-> endpoint mapping exactly (Story 4 AC3):
 * `['specs']`, `['spec', specId]`, `['spec-doc', specId, stage]`.
 * Screens should build keys through these helpers rather than hand-rolling arrays, so a
 * later SSE-driven `invalidateQueries({ queryKey })` call always matches.
 */

// =============================================================================
// Shared response shapes (camelCase, matching SpecRepository's row-to-record mapping)
// =============================================================================

export type SpecStageName = 'requirements' | 'design' | 'tasks';

export type StageStatus = 'not_started' | 'in_review' | 'approved';

/**
 * GET /api/specs list-item shape, and GET /api/specs/:specId's shape (both routes
 * return the same `specSummarySchema`): `{id, slug, featureName, currentStage, stages}`.
 */
export interface Spec {
	id: string;
	slug: string;
	featureName: string;
	currentStage: SpecStageName;
	stages: Record<SpecStageName, StageStatus>;
}

/** GET /api/specs/:specId currently returns the same shape as a `Spec` list item. */
export type SpecDetail = Spec;

/** GET /api/specs/:specId/stages/:stage/document response. */
export interface StageDocument {
	markdown: string;
}

/** Request body shared by the approve/deny write endpoints. */
export interface ApproveDenyStageInput {
	/** Required when `stage === 'tasks'` (tasks approval is per design component). */
	component?: string;
	/** Currently unused server-side (not persisted) -- see design's Flags on deny-reason. */
	reason?: string;
}

/** POST .../approve and POST .../deny response, symmetric with `FinalizeStageResult`. */
export interface ApproveDenyStageResult {
	stage: SpecStageName;
	componentSlug?: string;
	status: string;
}

// =============================================================================
// Query keys (Design §Data Model, "SPA structure + data-fetch/invalidation contract")
// =============================================================================

export const queryKeys = {
	specs: () => ['specs'] as const,
	spec: (specId: string) => ['spec', specId] as const,
	specDoc: (specId: string, stage: SpecStageName) => ['spec-doc', specId, stage] as const
};

// =============================================================================
// fetch plumbing
// =============================================================================

/** Error body shape shared by every rest-bff-api error response: `{ error, message }`
 * (`packages/server/src/web/error-handler.ts`'s reuse of `SpecRepositoryError`). */
interface ApiErrorBody {
	error?: string;
	message?: string;
}

/** Thrown for any non-2xx rest-bff-api response, carrying the HTTP status and the
 * server's `SpecRepositoryError.rule` (surfaced as `error`) alongside its message. */
export class ApiError extends Error {
	public readonly status: number;
	public readonly rule: string;

	constructor(status: number, rule: string, message: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.rule = rule;
	}
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		...init,
		headers: { 'Content-Type': 'application/json', ...init?.headers }
	});
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
		throw new ApiError(response.status, body?.error ?? 'unknown_error', body?.message ?? response.statusText);
	}
	if (response.status === 204) {
		return undefined as T;
	}
	return (await response.json()) as T;
}

// =============================================================================
// Endpoint wrappers
// =============================================================================

/**
 * GET /api/specs?project=
 *
 * `project` is required by the running rest-bff-api (`packages/server/src/web/routes/reads.ts`
 * resolves it via `ensureProject(pool, request.query.project)` with no implicit default --
 * project scoping is an explicit open question in the design, so no default is invented
 * here either; callers must supply the project slug).
 */
export function getSpecs(project: string): Promise<Spec[]> {
	return apiFetch<Spec[]>(`/api/specs?project=${encodeURIComponent(project)}`);
}

/** GET /api/specs/:specId */
export function getSpec(specId: string): Promise<SpecDetail> {
	return apiFetch<SpecDetail>(`/api/specs/${encodeURIComponent(specId)}`);
}

/** GET /api/specs/:specId/stages/:stage/document?component= */
export function getSpecStageDocument(specId: string, stage: SpecStageName, component?: string): Promise<StageDocument> {
	const query = component !== undefined ? `?component=${encodeURIComponent(component)}` : '';
	return apiFetch<StageDocument>(`/api/specs/${encodeURIComponent(specId)}/stages/${stage}/document${query}`);
}

/** POST /api/specs/:specId/stages/:stage/approve */
export function approveStage(specId: string, stage: SpecStageName, input: ApproveDenyStageInput = {}): Promise<ApproveDenyStageResult> {
	return apiFetch<ApproveDenyStageResult>(`/api/specs/${encodeURIComponent(specId)}/stages/${stage}/approve`, {
		method: 'POST',
		body: JSON.stringify(input)
	});
}

/** POST /api/specs/:specId/stages/:stage/deny */
export function denyStage(specId: string, stage: SpecStageName, input: ApproveDenyStageInput = {}): Promise<ApproveDenyStageResult> {
	return apiFetch<ApproveDenyStageResult>(`/api/specs/${encodeURIComponent(specId)}/stages/${stage}/deny`, {
		method: 'POST',
		body: JSON.stringify(input)
	});
}
