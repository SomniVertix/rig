import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { McpToolContext } from '../tool-registry.js';
import { registerSpecLifecycleTools } from './spec-lifecycle-tools.js';
import { registerRequirementsTools } from './requirements-tools.js';
import { registerDesignTools } from './design-tools.js';
import { registerTasksTools } from './tasks-tools.js';
import { registerFinalizeStageTool } from './finalize-stage-tool.js';
import { registerNextStageTool } from './next-stage-tool.js';
import { registerRenderDocumentTool } from './render-document-tool.js';

export * from './tool-helpers.js';

/**
 * Registers the whole spec-doc-tools catalog (T5) onto a session-scoped `McpServer`:
 * spec lifecycle, every requirements/design/tasks child table's add/update/delete
 * tools, `finalize_stage`, `get_next_stage`, and `render_document`. Every child table
 * declared in the evolved schema (T1) has a distinct tool exposed here through the
 * transport built in T4 (Story 6.1, 6.2).
 */
export function registerSpecDocTools(server: McpServer, context: McpToolContext): void {
	registerSpecLifecycleTools(server, context);
	registerRequirementsTools(server, context);
	registerDesignTools(server, context);
	registerTasksTools(server, context);
	registerFinalizeStageTool(server, context);
	registerNextStageTool(server, context);
	registerRenderDocumentTool(server, context);
}
