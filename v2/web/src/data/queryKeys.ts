/** Centralized query key registry — keeps invalidation consistent across domains. */
export const queryKeys = {
	trails: (workspaceId: string) => ['trails', workspaceId] as const,
	trail: (trailId: string) => ['trail', trailId] as const,
	specs: (workspaceId: string) => ['specs', workspaceId] as const,
	spec: (specId: string) => ['spec', specId] as const,
	specDoc: (specId: string, stage: string, component?: string) => ['spec-doc', specId, stage, component ?? null] as const
};
