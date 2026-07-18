import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SpecRepository } from '@relentless/persistence';

import type { McpToolContext } from '../tool-registry.js';
import { jsonResult, withToolErrorHandling } from './tool-helpers.js';

/**
 * `get_next_stage(spec)` (T5.7): returns the first stage that is not `approved` and
 * whose predecessor is `approved`, or `null` when every stage is `approved`. The tasks
 * stage is treated as `approved` only when every component's `tasks_docs.status` is
 * `approved`; while any component lags, the response names it (Story 8.3, 8.4). This is
 * a read -- no `actor` argument required.
 */
export function registerNextStageTool(server: McpServer, context: McpToolContext): void {
	const repository = new SpecRepository(context.pool, context.events);

	server.registerTool(
		'get_next_stage',
		{
			description: 'Determines the next actionable pipeline stage for a spec, including which components (if any) are still lagging the tasks stage.',
			inputSchema: { specId: z.string().min(1) }
		},
		withToolErrorHandling(async (args) => {
			const result = await repository.getNextStage(args.specId);
			return jsonResult(result);
		})
	);
}
