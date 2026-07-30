import { useQuery } from '@tanstack/react-query';
import * as api from '../../api/client';
import { toSpecSummary } from '../../domain/specs';
import type { Project, StageDistributionStatus } from './types';

/**
 * The project list itself now comes from GET /workspaces (real scanned
 * `.code-workspace` files, see internal/workspace/registry) rather than a
 * hardcoded stopgap. Every number shown per project is real: fetched live
 * from /specs and /expeditions and aggregated client-side.
 */
export function useProjects() {
	return useQuery<Project[]>({
		queryKey: ['projects', 'live-aggregate'],
		queryFn: async () => {
			const workspaces = await api.listWorkspaces();
			return Promise.all(workspaces.map((w) => loadProject(w.workspaceId, w.label)));
		}
	});
}

async function loadProject(slug: string, name: string): Promise<Project> {
	const [specs, expeditions] = await Promise.all([api.listSpecs(slug), api.listExpeditions(slug)]);
	const summaries = specs.map(toSpecSummary);

	const gatesWaiting = summaries.filter((s) => Object.values(s.stages).includes('in_review')).length;

	const bucketCounts: Record<StageDistributionStatus, number> = { not_started: 0, in_review: 0, approved: 0, denied: 0 };
	for (const s of summaries) {
		const headline = s.currentStage === 'implementation' ? 'approved' : s.stages[s.currentStage];
		bucketCounts[headline] += 1;
	}
	const stageDistribution = (Object.keys(bucketCounts) as StageDistributionStatus[])
		.map((status) => ({ status, count: bucketCounts[status] }))
		.filter((b) => b.count > 0);

	const timestamps = [...specs.map((s) => s.updatedAt), ...expeditions.map((e) => e.updatedAt)];
	const lastWriteAt = timestamps.length > 0 ? timestamps.reduce((max, t) => (t > max ? t : max)) : undefined;

	return {
		slug,
		name,
		specCount: specs.length,
		trailCount: expeditions.length,
		gatesWaiting,
		stageDistribution,
		lastWriteAt
	};
}
