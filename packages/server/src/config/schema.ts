import { z } from 'zod';

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export const executorKindSchema = z.enum(['pi', 'claude']);

export const serverConfigSchema = z.object({
	workspaceRoot: z.string().min(1),
	databaseUrl: z.string().min(1),
	concurrencyCap: z.number().int().positive(),
	// RELENTLESS_CLAIM_TTL: hours before a discovery waypoint claim goes stale and
	// becomes reclaimable (claim recovery's TTL backstop; manual release_waypoint
	// works any time regardless).
	claimTtlHours: z.number().int().positive(),
	defaultTimeoutMs: z.number().int().positive(),
	librarySearchPaths: z.array(z.string().min(1)),
	logLevel: logLevelSchema,
	defaultExecutor: executorKindSchema,
	defaultModel: z.string().min(1).optional(),
	maxNodeExecutions: z.number().int().positive(),
	mirrorRoot: z.string().min(1).optional(),
	// known-actors sourcing: a curated directory of actors (relentless's pipeline
	// agents + discovery-stage skills like `grilling`), never the general Claude
	// Code skills directory -- see actor-registry.ts's doc comment for why those
	// are different things. Unset means it defaults to
	// `<workspaceRoot>/.claude/relentless-actors` in build-composition.ts, so
	// local/non-Docker dev Just Works; Docker overrides via RELENTLESS_ACTORS_DIR
	// to point at the bind-mounted actors directory (see docker-compose.yml).
	actorsDir: z.string().min(1).optional(),
	configPath: z.string().min(1).optional(),
	// mcp-transport (Story 5): the MCP HTTP/SSE listener is only started when a
	// bearer token is configured -- an unset token means the MCP endpoint stays
	// disabled for this composition rather than starting an unauthenticatable
	// listener.
	mcpBearerToken: z.string().min(1).optional(),
	mcpHost: z.string().min(1),
	mcpPort: z.number().int().positive(),
	// web-config (Story 7): the web UI HTTP listener is only started when
	// webPort is set -- no `.default()` here, so an unset RELENTLESS_WEB_PORT
	// means the listener stays off rather than binding to an implicit port.
	webHost: z.string().min(1).optional(),
	webPort: z.number().int().positive().optional()
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