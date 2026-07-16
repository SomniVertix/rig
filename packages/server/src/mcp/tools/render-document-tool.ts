import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SpecRepository } from '@relentless/persistence';

import type { McpToolContext } from '../tool-registry.js';
import { jsonResult, withToolErrorHandling } from './tool-helpers.js';

/**
 * `render_document(spec, stage, component?)` (T5.8): reconstructs markdown from stored
 * rows, matching the layouts produced by T2's templates. For `stage='tasks'`,
 * `component` omitted/`'all'` renders the top-level index (component list + status,
 * Cross-Component Dependencies, spec-wide Definition of Done); `component='<slug>'`
 * renders that component's own Order/Parallel Execution Schema/Task List/Flags. This is
 * a read -- no `actor` argument required.
 */
export function registerRenderDocumentTool(server: McpServer, context: McpToolContext): void {
	const repository = new SpecRepository(context.pool);

	server.registerTool(
		'render_document',
		{
			description: 'Renders a spec-pipeline document (requirements, design, or a tasks-stage index/component document) as markdown from stored rows.',
			inputSchema: {
				specId: z.string().min(1),
				stage: z.enum(['requirements', 'design', 'tasks']),
				component: z.string().min(1).optional().describe("For stage='tasks': a component slug, or 'all'/omitted for the index document.")
			}
		},
		withToolErrorHandling(async (args) => {
			const markdown = await repository.renderDocument(args.specId, args.stage, args.component);
			return jsonResult({ markdown });
		})
	);
}
