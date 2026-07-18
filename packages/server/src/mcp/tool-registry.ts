import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PersistenceBundle, SpecChangeEmitter } from '@rig/persistence';

import { registerSpecDocTools } from './tools/index.js';

/**
 * Per-session context handed to every tool handler: the `pg` Pool shared with
 * the rest of the persistence layer, plus the project this MCP session is bound
 * to. The bound project is implicit for every tool call within the session --
 * no tool call ever carries an explicit project argument (Story 5.5).
 *
 * `events` is the shared `SpecChangeEmitter` (spec-change-events) used to
 * broadcast document mutations for streaming UIs; it is optional so contexts
 * built without change-event streaming wired up continue to compile and run.
 */
export interface McpToolContext {
	pool: PersistenceBundle['pool'];
	projectId: string;
	projectSlug: string;
	events?: SpecChangeEmitter;
	/** RIG_CLAIM_TTL (hours) for discovery waypoint claim recovery;
	 * `TrailRepository` falls back to its own default when absent. */
	claimTtlHours?: number;
}

/**
 * Registers every MCP tool onto a session-scoped `McpServer` instance.
 *
 * T4 (mcp-transport) left this as an empty stub -- transport plumbing only. T5
 * (spec-doc-tools) populates the full spec-pipeline document tool catalog here.
 * T6 (guardrails) and T7 (integration) layer validation/attribution/audit and the
 * remaining library-store tools on top in later work.
 */
export function registerTools(server: McpServer, context: McpToolContext): void {
	registerSpecDocTools(server, context);
}
