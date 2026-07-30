import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../../api/client';
import { toTrailDetail, toTrailSummary } from '../../domain/trails';
import { queryKeys } from '../queryKeys';
import type { TrailDetail, TrailSummary } from './types';

export function useTrails(workspaceId: string | undefined) {
	return useQuery<TrailSummary[]>({
		queryKey: queryKeys.trails(workspaceId ?? ''),
		queryFn: async () => {
			const expeditions = await api.listExpeditions(workspaceId as string);
			const withWaypoints = await Promise.all(
				expeditions.map(async (e) => ({ e, waypoints: await api.listWaypoints(e.id) }))
			);
			return withWaypoints.map(({ e, waypoints }) => toTrailSummary(e, waypoints));
		},
		enabled: Boolean(workspaceId)
	});
}

export function useTrail(trailId: string) {
	return useQuery<TrailDetail>({
		queryKey: queryKeys.trail(trailId),
		queryFn: async () => {
			const [expedition, waypoints, dependencies] = await Promise.all([
				api.getExpedition(trailId),
				api.listWaypoints(trailId),
				api.listWaypointDependencies(trailId)
			]);
			return toTrailDetail(expedition, waypoints, dependencies);
		},
		enabled: Boolean(trailId)
	});
}

function useInvalidateTrail(trailId: string) {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: queryKeys.trail(trailId) });
}

export function useClaimWaypoint(trailId: string) {
	const invalidate = useInvalidateTrail(trailId);
	return useMutation({
		mutationFn: ({ waypointId, claimedBy }: { waypointId: string; claimedBy: string }) => api.claimWaypoint(waypointId, claimedBy),
		onSuccess: invalidate
	});
}

export function useReleaseWaypoint(trailId: string) {
	const invalidate = useInvalidateTrail(trailId);
	return useMutation({
		mutationFn: (waypointId: string) => api.releaseWaypoint(waypointId),
		onSuccess: invalidate
	});
}

export function useReachWaypoint(trailId: string) {
	const invalidate = useInvalidateTrail(trailId);
	return useMutation({
		mutationFn: ({ waypointId, resolution, resolutionGist }: { waypointId: string; resolution: string; resolutionGist: string }) =>
			api.reachWaypoint(waypointId, { resolution, resolutionGist }),
		onSuccess: invalidate
	});
}

export function useBypassWaypoint(trailId: string) {
	const invalidate = useInvalidateTrail(trailId);
	return useMutation({
		mutationFn: ({ waypointId, reason }: { waypointId: string; reason: string }) => api.bypassWaypoint(waypointId, reason),
		onSuccess: invalidate
	});
}

export function useUnbypassWaypoint(trailId: string) {
	const invalidate = useInvalidateTrail(trailId);
	return useMutation({
		mutationFn: ({ waypointId, reason }: { waypointId: string; reason: string }) => api.unbypassWaypoint(waypointId, reason),
		onSuccess: invalidate
	});
}
