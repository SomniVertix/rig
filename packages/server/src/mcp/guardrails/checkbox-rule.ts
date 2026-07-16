import type { Pool } from 'pg';

import { GuardrailError } from './errors.js';

/**
 * T6.5: parent/child checkbox rule for `update_task_item`. Rejects marking a parent
 * `is_checked = true` while any child `task_item` in the *same component's* task
 * document is still unchecked (Story 6.6).
 *
 * This only ever considers intra-component `parent_item_id` structure -- the query
 * below never touches `task_dependency_edges` -- so a task item linked to an
 * unchecked item in a *different* component only via a cross-component dependency
 * edge is entirely unaffected by this rule.
 */
export async function assertParentCheckboxRule(pool: Pool, taskItemId: string, nextIsChecked: boolean | undefined): Promise<void> {
	if (nextIsChecked !== true) {
		return;
	}
	const result = await pool.query<{ count: string | number }>(
		`select count(*)::int as count from spec_pipeline.task_items where parent_item_id = $1 and is_checked = false`,
		[taskItemId]
	);
	const uncheckedCount = Number(result.rows[0]?.count ?? 0);
	if (uncheckedCount > 0) {
		throw new GuardrailError(
			'unchecked_child_task_item',
			`cannot mark task item ${taskItemId} as checked: it has ${uncheckedCount} unchecked child task item(s) in the same component's task document`
		);
	}
}
