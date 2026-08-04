/**
 * Typed fetch wrappers for V2's real REST surface. Backend-shape-agnostic
 * fetch plumbing (apiFetch/ApiError) follows the same pattern as V1's
 * `packages/web/src/api/client.ts` — only the endpoints/types below are
 * V2-specific.
 */
import type {
	ExpeditionDTO,
	ExpeditionStatus,
	WaypointDTO,
	WaypointDependencyEdgeDTO,
	ReachWaypointRequest,
	SpecDTO,
	NextStageInfoDTO,
	StageActionRequest,
	StageActionResponse,
	RenderDocumentResponse,
	ListTasksDocsResponse,
	SpecStageName,
	WorkspaceDTO
} from './types';

interface ApiErrorBody {
	error?: string;
}

export class ApiError extends Error {
	public readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(path, {
		...init,
		headers: { 'Content-Type': 'application/json', ...init?.headers }
	});
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
		throw new ApiError(response.status, body?.error ?? response.statusText);
	}
	if (response.status === 204) {
		return undefined as T;
	}
	return (await response.json()) as T;
}

// ── Expeditions / waypoints ────────────────────────────────────────────────

export function listExpeditions(workspaceId: string, status?: ExpeditionStatus): Promise<ExpeditionDTO[]> {
	const params = new URLSearchParams({ workspaceId });
	if (status) params.set('status', status);
	return apiFetch<ExpeditionDTO[]>(`/expeditions?${params.toString()}`);
}

export function getExpedition(id: string): Promise<ExpeditionDTO> {
	return apiFetch<ExpeditionDTO>(`/expeditions/${encodeURIComponent(id)}`);
}

/** 404s (via ApiError.status) when the spec has no originating expedition. */
export function getExpeditionBySpec(specId: string): Promise<ExpeditionDTO> {
	return apiFetch<ExpeditionDTO>(`/expedition-by-spec/${encodeURIComponent(specId)}`);
}

export function listWaypoints(expeditionId: string): Promise<WaypointDTO[]> {
	return apiFetch<WaypointDTO[]>(`/expeditions/${encodeURIComponent(expeditionId)}/waypoints`);
}

export function listWaypointDependencies(expeditionId: string): Promise<WaypointDependencyEdgeDTO[]> {
	return apiFetch<WaypointDependencyEdgeDTO[]>(`/expeditions/${encodeURIComponent(expeditionId)}/waypoint-dependencies`);
}

export function claimWaypoint(id: string, claimedBy: string): Promise<WaypointDTO> {
	return apiFetch<WaypointDTO>(`/waypoints/${encodeURIComponent(id)}/claim`, {
		method: 'POST',
		body: JSON.stringify({ claimedBy })
	});
}

export function releaseWaypoint(id: string): Promise<WaypointDTO> {
	return apiFetch<WaypointDTO>(`/waypoints/${encodeURIComponent(id)}/release`, { method: 'POST' });
}

export function reachWaypoint(id: string, body: ReachWaypointRequest): Promise<WaypointDTO> {
	return apiFetch<WaypointDTO>(`/waypoints/${encodeURIComponent(id)}/reach`, {
		method: 'POST',
		body: JSON.stringify(body)
	});
}

export function bypassWaypoint(id: string, reason: string): Promise<WaypointDTO> {
	return apiFetch<WaypointDTO>(`/waypoints/${encodeURIComponent(id)}/bypass`, {
		method: 'POST',
		body: JSON.stringify({ reason })
	});
}

// openapi/graph.yaml documents no request body for this endpoint, but the
// service layer actually requires a non-empty `reason` (confirmed live —
// an empty POST 500s with "unbypass_waypoint requires a non-empty reason";
// matches the shared reasonRequest shape noted in dto.go for
// reopen_expedition/unbypass_waypoint/unspur_waypoint).
export function unbypassWaypoint(id: string, reason: string): Promise<WaypointDTO> {
	return apiFetch<WaypointDTO>(`/waypoints/${encodeURIComponent(id)}/unbypass`, {
		method: 'POST',
		body: JSON.stringify({ reason })
	});
}

// ── Specs ────────────────────────────────────────────────────────────────

export function listSpecs(workspaceId: string): Promise<SpecDTO[]> {
	return apiFetch<SpecDTO[]>(`/specs?${new URLSearchParams({ workspaceId }).toString()}`);
}

export function getSpec(id: string): Promise<SpecDTO> {
	return apiFetch<SpecDTO>(`/specs/${encodeURIComponent(id)}`);
}

export function getNextStage(id: string): Promise<NextStageInfoDTO> {
	return apiFetch<NextStageInfoDTO>(`/specs/${encodeURIComponent(id)}/next-stage`);
}

export function listTasksDocs(id: string): Promise<ListTasksDocsResponse> {
	return apiFetch<ListTasksDocsResponse>(`/specs/${encodeURIComponent(id)}/tasks-docs`);
}

export function renderSpecDocument(id: string, stage: SpecStageName, component?: string): Promise<RenderDocumentResponse> {
	const params = new URLSearchParams({ stage });
	if (component) params.set('component', component);
	return apiFetch<RenderDocumentResponse>(`/specs/${encodeURIComponent(id)}/render?${params.toString()}`);
}

export function finalizeStage(id: string, body: StageActionRequest): Promise<StageActionResponse> {
	return apiFetch<StageActionResponse>(`/specs/${encodeURIComponent(id)}/finalize`, {
		method: 'POST',
		body: JSON.stringify(body)
	});
}

export function approveStage(id: string, body: StageActionRequest): Promise<StageActionResponse> {
	return apiFetch<StageActionResponse>(`/specs/${encodeURIComponent(id)}/approve`, {
		method: 'POST',
		body: JSON.stringify(body)
	});
}

export function denyStage(id: string, body: StageActionRequest): Promise<StageActionResponse> {
	return apiFetch<StageActionResponse>(`/specs/${encodeURIComponent(id)}/deny`, {
		method: 'POST',
		body: JSON.stringify(body)
	});
}

// ── Workspaces ───────────────────────────────────────────────────────────

interface ListWorkspacesResponse {
	workspaces: WorkspaceDTO[];
}

/** Every workspaceId a scanned `.code-workspace` file claims — the real
 * source for "which workspaces exist," no cwd required. */
export async function listWorkspaces(): Promise<WorkspaceDTO[]> {
	return (await apiFetch<ListWorkspacesResponse>('/workspaces')).workspaces;
}
