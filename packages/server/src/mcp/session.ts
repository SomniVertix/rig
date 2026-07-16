import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ensureProject } from '@relentless/persistence';
import type { PersistenceBundle } from '@relentless/persistence';

import { registerTools } from './tool-registry.js';

const MCP_SESSION_HEADER = 'mcp-session-id';

interface McpSessionEntry {
	transport: StreamableHTTPServerTransport;
	server: McpServer;
	projectId: string;
}

export interface McpSessionManager {
	handleRequest(req: IncomingMessage, res: ServerResponse, projectSlug: string): Promise<void>;
	close(): Promise<void>;
}

function headerValue(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

/**
 * Tracks live MCP sessions and binds each new one to a project (Story 4.2,
 * 5.4) by resolving `:projectSlug` -> `project_id` via `ensureProject`, which
 * auto-provisions the project the first time its slug is seen. The bound
 * `project_id` is fixed for the session's entire lifetime -- every tool call
 * within that session implicitly operates against it (Story 5.5).
 *
 * Sessions are tracked purely in-memory with no `EventStore`/resumability
 * configured on the transport, so a disconnect (or a fresh connection with no
 * `mcp-session-id` header) always produces a brand-new, independent session
 * with nothing carried over from any prior one (Story 5.8).
 */
export function createMcpSessionManager(pool: PersistenceBundle['pool']): McpSessionManager {
	const sessions = new Map<string, McpSessionEntry>();

	async function createSession(projectSlug: string): Promise<McpSessionEntry> {
		const projectId = await ensureProject(pool, projectSlug);
		const server = new McpServer({ name: 'relentless-spec-pipeline', version: '0.1.0' });
		registerTools(server, { pool, projectId, projectSlug });

		let entry: McpSessionEntry;
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: () => randomUUID(),
			onsessioninitialized: (sessionId) => {
				sessions.set(sessionId, entry);
			},
			onsessionclosed: (sessionId) => {
				sessions.delete(sessionId);
			}
		});
		entry = { transport, server, projectId };
		transport.onclose = () => {
			if (transport.sessionId !== undefined) {
				sessions.delete(transport.sessionId);
			}
		};

		await server.connect(transport);
		return entry;
	}

	return {
		async handleRequest(req, res, projectSlug) {
			const sessionId = headerValue(req.headers[MCP_SESSION_HEADER]);
			if (sessionId !== undefined) {
				const existing = sessions.get(sessionId);
				if (existing === undefined) {
					res.writeHead(404, { 'content-type': 'application/json' });
					res.end(JSON.stringify({ error: 'mcp_session_not_found' }));
					return;
				}
				await existing.transport.handleRequest(req, res);
				return;
			}

			const entry = await createSession(projectSlug);
			await entry.transport.handleRequest(req, res);
		},
		async close() {
			for (const entry of sessions.values()) {
				await entry.server.close();
			}
			sessions.clear();
		}
	};
}
