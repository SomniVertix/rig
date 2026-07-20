import process from 'node:process';

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export interface RunResolverArgs {
	projectId: string;
	serverUrl: string;
	bearerToken: string;
}

/**
 * Bridges an MCP client speaking JSON-RPC over this process's stdin/stdout to
 * `serverUrl`'s Streamable HTTP `/mcp` endpoint (`packages/server/src/mcp/server.ts`),
 * injecting the bearer token and project id as headers on every outbound HTTP
 * request the way that route requires them.
 *
 * `StreamableHTTPClientTransportOptions.requestInit` is a plain `RequestInit`
 * (confirmed against the pinned SDK's `client/streamableHttp.d.ts` -- not merely
 * assumed per this component's Flags), so header injection works exactly as
 * `packages/server/test/e2e/mcp.test.mjs`'s own test client does it.
 *
 * This is a dumb bidirectional pipe (Design Alternatives: rejected doing
 * anything resembling MCP tool-semantics awareness, or routing through a
 * lightweight server RPC call, here) -- each transport's `onmessage` is wired
 * straight to the other's `send`, and either side closing tears the other down
 * so the process never hangs on a half-open pipe.
 */
export async function runResolver(args: RunResolverArgs): Promise<void> {
	const { projectId, serverUrl, bearerToken } = args;

	const clientTransport: Transport = new StdioServerTransport();
	const serverTransport: Transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
		requestInit: {
			headers: {
				Authorization: `Bearer ${bearerToken}`,
				'X-Rig-Project-Id': projectId
			}
		}
	});

	await new Promise<void>((resolve, reject) => {
		let settled = false;
		let closing = false;

		const finish = (error?: Error): void => {
			if (settled) {
				return;
			}
			settled = true;
			if (error !== undefined) {
				reject(error);
			} else {
				resolve();
			}
		};

		const closeBoth = (): void => {
			if (closing) {
				return;
			}
			closing = true;
			Promise.allSettled([clientTransport.close(), serverTransport.close()])
				.finally(() => {
					finish();
				})
				.catch(() => {
					// allSettled itself never rejects; this is unreachable, but
					// satisfies the no-floating-promise/exhaustive-catch rules.
				});
		};

		// Forward messages transparently in both directions -- no inspection or
		// interpretation of MCP method names/params happens here.
		clientTransport.onmessage = (message: JSONRPCMessage) => {
			serverTransport.send(message).catch((error: unknown) => {
				serverTransport.onerror?.(error instanceof Error ? error : new Error(String(error)));
			});
		};
		serverTransport.onmessage = (message: JSONRPCMessage) => {
			clientTransport.send(message).catch((error: unknown) => {
				clientTransport.onerror?.(error instanceof Error ? error : new Error(String(error)));
			});
		};

		// Either side closing (client disconnects, server connection drops) tears
		// down the other, and resolves runResolver() so the process can exit.
		clientTransport.onclose = () => {
			closeBoth();
		};
		serverTransport.onclose = () => {
			closeBoth();
		};

		clientTransport.onerror = (error: Error) => {
			process.stderr.write(`rig-resolver: stdio transport error: ${error.message}\n`);
		};
		serverTransport.onerror = (error: Error) => {
			process.stderr.write(`rig-resolver: http transport error: ${error.message}\n`);
		};

		// StdioServerTransport only wires 'data'/'error' listeners onto stdin
		// (see the pinned SDK's server/stdio.js) -- it never observes EOF. Without
		// this, a client that closes its end of the pipe (e.g. an IDE process
		// exiting) would leave this process awaiting closeBoth() forever.
		process.stdin.once('end', () => {
			closeBoth();
		});

		// Per the shared Transport contract, start() must only be called after
		// onmessage/onclose/onerror are installed, which is why it happens last.
		Promise.all([clientTransport.start(), serverTransport.start()]).catch((error: unknown) => {
			finish(error instanceof Error ? error : new Error(String(error)));
		});
	});
}
