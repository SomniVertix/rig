/** Centralized query key registry — keeps invalidation consistent across domains. */
export const queryKeys = {
	trails: (workspaceId: string) => ['trails', workspaceId] as const,
	trail: (trailId: string) => ['trail', trailId] as const,
	originTrail: (specId: string) => ['origin-trail', specId] as const,
	specs: (workspaceId: string) => ['specs', workspaceId] as const,
	spec: (specId: string) => ['spec', specId] as const,
	specDoc: (specId: string, stage: string, component?: string) => ['spec-doc', specId, stage, component ?? null] as const,
	specTasksDocs: (specId: string) => ['spec-tasks-docs', specId] as const,
	handoffs: (workspaceId: string) => ['handoffs', workspaceId] as const,
	handoff: (id: string) => ['handoff', id] as const,
	handoffConversation: (id: string) => ['handoff-conversation', id] as const,
	workspaces: () => ['workspaces'] as const,
	workspaceSummaries: () => ['workspaces', 'live-aggregate'] as const,
	session: (sessionId: string) => ['session', sessionId] as const,
	audit: (workspaceId: string) => ['audit', workspaceId] as const,
	runs: () => ['runs'] as const
};
