import { useQuery } from '@tanstack/react-query';
import * as api from '../../api/client';
import type { WorkspaceProject } from './types';

/**
 * The real source for "which workspaces exist" — every workspaceId a scanned
 * `.code-workspace` file claims, server-side, no cwd needed. Replaces the
 * old `config/projects.ts` static/env-var stopgap.
 */
export function useWorkspaces() {
	return useQuery<WorkspaceProject[]>({
		queryKey: ['workspaces'],
		queryFn: async () => (await api.listWorkspaces()).map((w) => ({ id: w.workspaceId, label: w.label }))
	});
}
