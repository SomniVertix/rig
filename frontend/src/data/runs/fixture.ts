import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FIXTURE_RUNS } from '../../fixtures/runs';
import type { Run } from './types';

const QUERY_KEY = ['runs'];

// Stage B — no runs/executor/scheduler REST surface exists in V2 yet (see GAPS.md §3).
export function useRuns() {
	return useQuery<Run[]>({
		queryKey: QUERY_KEY,
		queryFn: async () => FIXTURE_RUNS.map(({ id, workflow, node, executor, status, started }) => ({ id, workflow, node, executor, status, started }))
	});
}

/** Fixture-only: mutates the in-memory query cache, not persisted, no real abort happens. */
export function useAbortRun() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (runId: string) => runId,
		onSuccess: (runId) => {
			// 'denied' (rose) stands in for "aborted" — StatusBadge has no
			// dedicated aborted/terminated token, and rose reads correctly here.
			queryClient.setQueryData<Run[]>(QUERY_KEY, (prev) =>
				prev?.map((r) => (r.id === runId ? { ...r, status: 'denied' as const } : r))
			);
		}
	});
}
