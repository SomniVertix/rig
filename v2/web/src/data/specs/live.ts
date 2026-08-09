import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../api/client';
import { ApiError } from '../../api/client';
import type { StageActionRequest } from '../../api/types';
import { toSpecDetail, toSpecSummary } from '../../domain/specs';
import { toTrailSummary } from '../../domain/trails';
import { queryKeys } from '../queryKeys';
import type { SpecDetail, SpecSummary } from './types';
import type { TrailSummary } from '../trails/types';

export function useSpecs(workspaceId: string | undefined) {
	return useQuery<SpecSummary[]>({
		queryKey: queryKeys.specs(workspaceId ?? ''),
		queryFn: async () => (await api.listSpecs(workspaceId as string)).map(toSpecSummary),
		enabled: Boolean(workspaceId)
	});
}

export function useSpec(specId: string) {
	return useQuery<SpecDetail>({
		queryKey: queryKeys.spec(specId),
		queryFn: async () => toSpecDetail(await api.getSpec(specId)),
		enabled: Boolean(specId)
	});
}

/** Reverse lookup via `GET /expedition-by-spec/:specId` — null (not an
 * error state) when the spec wasn't chartered from a trail. */
export function useOriginTrail(specId: string) {
	return useQuery<TrailSummary | null>({
		queryKey: ['origin-trail', specId],
		queryFn: async () => {
			try {
				const expedition = await api.getExpeditionBySpec(specId);
				return toTrailSummary(expedition, []);
			} catch (err) {
				if (err instanceof ApiError && err.status === 404) return null;
				throw err;
			}
		},
		enabled: Boolean(specId)
	});
}

export function useSpecDocument(specId: string, stage: StageActionRequest['stage'], component?: string) {
	return useQuery({
		queryKey: queryKeys.specDoc(specId, stage, component),
		queryFn: () => api.renderSpecDocument(specId, stage, component),
		enabled: Boolean(specId)
	});
}

export function useTasksDocs(specId: string) {
	return useQuery({
		queryKey: queryKeys.specTasksDocs(specId),
		queryFn: async () => (await api.listTasksDocs(specId)).tasksDocs,
		enabled: Boolean(specId)
	});
}

function useInvalidateSpec(specId: string) {
	const queryClient = useQueryClient();
	return () => {
		queryClient.invalidateQueries({ queryKey: queryKeys.spec(specId) });
		// Tasks-stage actions carry a component and change that component's
		// TasksDoc status — cheap to always invalidate, no-op for
		// requirements/design actions since nothing reads this key then.
		queryClient.invalidateQueries({ queryKey: queryKeys.specTasksDocs(specId) });
	};
}

export function useFinalizeStage(specId: string) {
	const invalidate = useInvalidateSpec(specId);
	return useMutation({
		mutationFn: (body: StageActionRequest) => api.finalizeStage(specId, body),
		onSuccess: invalidate
	});
}

/** Approve/deny are human-only per the brand guide — agents cannot self-approve a draft. */
export function useApproveStage(specId: string) {
	const invalidate = useInvalidateSpec(specId);
	return useMutation({
		mutationFn: (body: StageActionRequest) => api.approveStage(specId, body),
		onSuccess: invalidate
	});
}

export function useDenyStage(specId: string) {
	const invalidate = useInvalidateSpec(specId);
	return useMutation({
		mutationFn: (body: StageActionRequest) => api.denyStage(specId, body),
		onSuccess: invalidate
	});
}
