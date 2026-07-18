import type { Pool } from 'pg';

import type { SpecChangeEmitter } from '@rig/persistence';

import { buildApp } from './app.js';
import { registerEventsRoute } from './routes/events.js';

export interface WebTransportOptions {
	pool: Pool;
	events: SpecChangeEmitter;
	host: string;
	port: number;
}

/**
 * rest-bff-api (Story 7 AC2, AC3; Story 5 AC4; Story 6 AC1): the REST BFF's
 * listener handle, deliberately shaped like `McpTransportHandle`
 * (`{host, port, close()}`) so `buildComposition` wires -- and
 * `composition.close()` tears down -- both transports the same way. The web
 * listener lives in the same process as the MCP transport rather than a
 * second entry point/binary.
 */
export interface WebTransportHandle {
	host: string;
	port: number;
	close(): Promise<void>;
}

/**
 * rest-bff-api (Story 7 AC2, AC3): builds the shared Fastify app (`buildApp`,
 * T3/T4) -- passing it the composition's shared `pool` so its read/write
 * routes hit the same database -- registers the spec-change SSE stream
 * (Story 4) against the composition's shared `events` emitter, and starts it
 * listening on `options.host`/`options.port`.
 */
export async function startWebTransport(options: WebTransportOptions): Promise<WebTransportHandle> {
	const app = buildApp(options.pool);
	registerEventsRoute(app, options.events);

	await app.listen({ host: options.host, port: options.port });

	const address = app.server.address();
	const boundPort = typeof address === 'object' && address !== null ? address.port : options.port;

	return {
		host: options.host,
		port: boundPort,
		async close() {
			await app.close();
		}
	};
}
