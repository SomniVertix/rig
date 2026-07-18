import { createServer } from 'node:http';
import type { IncomingMessage, Server as HttpServer, ServerResponse } from 'node:http';

import type { PersistenceBundle, SpecChangeEmitter } from '@relentless/persistence';

import { isAuthorizedRequest } from './auth.js';
import { createMcpSessionManager } from './session.js';
import type { McpSessionManager } from './session.js';

// `/mcp/:projectSlug` is the single endpoint shape this transport exposes.
// Design's illustrative `/(sse|mcp)/:projectSlug` shape is narrowed to this one
// path because the pinned `StreamableHTTPServerTransport` (T4.1) handles both
// message directions -- POST client->server messages and GET server->client
// SSE streaming -- on a single path per the MCP Streamable HTTP spec, so no
// separate `/sse/...` route is needed.
const MCP_ROUTE_PATTERN = /^\/mcp\/([^/]+)\/?$/;

export interface McpTransportOptions {
	pool: PersistenceBundle['pool'];
	host: string;
	port: number;
	bearerToken: string;
	events?: SpecChangeEmitter;
	/** RELENTLESS_CLAIM_TTL (hours) threaded into every session's tool context. */
	claimTtlHours?: number;
}

export interface McpTransportHandle {
	host: string;
	port: number;
	close(): Promise<void>;
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
	res.writeHead(statusCode, { 'content-type': 'application/json' });
	res.end(JSON.stringify(body));
}

async function dispatch(req: IncomingMessage, res: ServerResponse, sessions: McpSessionManager, bearerToken: string, host: string): Promise<void> {
	const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? host}`);
	const match = MCP_ROUTE_PATTERN.exec(requestUrl.pathname);
	const rawProjectSlug = match?.[1];
	if (rawProjectSlug === undefined) {
		sendJson(res, 404, { error: 'not_found' });
		return;
	}

	// Bearer-token pre-handler (Story 5.3): runs before any tool call is
	// dispatched, and before the project slug is even resolved.
	if (!isAuthorizedRequest(req, bearerToken)) {
		sendJson(res, 401, { error: 'unauthorized' });
		return;
	}

	const projectSlug = decodeURIComponent(rawProjectSlug);
	await sessions.handleRequest(req, res, projectSlug);
}

/**
 * Starts the MCP HTTP/SSE listener inside the existing daemon process (Story
 * 5.2 -- no second entry point/binary is introduced; this is plumbing invoked
 * from `buildComposition`/`startDaemon`, not a new CLI or executable).
 *
 * Mounts directly on a plain Node `http.IncomingMessage`/`ServerResponse`
 * listener -- no express/fastify dependency is introduced for the transport
 * layer itself (T4.1).
 */
export async function startMcpTransport(options: McpTransportOptions): Promise<McpTransportHandle> {
	const sessions = createMcpSessionManager(options.pool, options.events, options.claimTtlHours);

	const httpServer: HttpServer = createServer((req, res) => {
		dispatch(req, res, sessions, options.bearerToken, options.host).catch((error: unknown) => {
			if (!res.headersSent) {
				sendJson(res, 500, { error: 'internal_error', message: error instanceof Error ? error.message : String(error) });
				return;
			}
			res.end();
		});
	});

	await new Promise<void>((resolve, reject) => {
		httpServer.once('error', reject);
		httpServer.listen(options.port, options.host, () => {
			httpServer.removeListener('error', reject);
			resolve();
		});
	});

	const address = httpServer.address();
	const boundPort = typeof address === 'object' && address !== null ? address.port : options.port;

	return {
		host: options.host,
		port: boundPort,
		async close() {
			await sessions.close();
			await new Promise<void>((resolve, reject) => {
				httpServer.close((error) => {
					if (error !== undefined && error !== null) {
						reject(error);
						return;
					}
					resolve();
				});
			});
		}
	};
}
