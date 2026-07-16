import { z } from 'zod';

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export const executorKindSchema = z.enum(['pi', 'claude']);

export const serverConfigSchema = z.object({
	workspaceRoot: z.string().min(1),
	databaseUrl: z.string().min(1),
	concurrencyCap: z.number().int().positive(),
	defaultTimeoutMs: z.number().int().positive(),
	librarySearchPaths: z.array(z.string().min(1)),
	logLevel: logLevelSchema,
	defaultExecutor: executorKindSchema,
	defaultModel: z.string().min(1).optional(),
	maxNodeExecutions: z.number().int().positive(),
	mirrorRoot: z.string().min(1).optional(),
	configPath: z.string().min(1).optional(),
	// mcp-transport (Story 5): the MCP HTTP/SSE listener is only started when a
	// bearer token is configured -- an unset token means the MCP endpoint stays
	// disabled for this composition rather than starting an unauthenticatable
	// listener.
	mcpBearerToken: z.string().min(1).optional(),
	mcpHost: z.string().min(1),
	mcpPort: z.number().int().positive()
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

export type ServerConfigInput = Partial<Omit<ServerConfig, 'databaseUrl' | 'workspaceRoot'>> & {
	workspaceRoot?: string;
	databaseUrl?: string;
	configPath?: string;
};

export interface ServerConfigSource {
	configPath?: string;
	workspaceRoot?: string;
	env?: NodeJS.ProcessEnv;
}