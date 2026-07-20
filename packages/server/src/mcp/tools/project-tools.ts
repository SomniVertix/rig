import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { listProjects } from '@rig/persistence';

import type { McpToolContext } from '../tool-registry.js';
import { jsonResult, withToolErrorHandling } from './tool-helpers.js';

/**
 * Project tools: a small, deliberately unscoped troubleshooting surface. Every
 * other tool in this catalog is implicitly scoped to the MCP session's bound
 * project -- this is the one exception, letting a session see every project
 * known to the server, not just its own.
 */
export function registerProjectTools(server: McpServer, context: McpToolContext): void {
	server.registerTool(
		'list_projects',
		{
			description:
				"Lists every project known to the server, not just this session's bound one -- for troubleshooting/orientation. Plain listing: id, slug, displayName, createdAt. No pagination, no counts.",
			inputSchema: {}
		},
		withToolErrorHandling(async () => {
			const projects = await listProjects(context.pool);
			return jsonResult({ projects });
		})
	);
}
