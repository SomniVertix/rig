/** Counts markdown checkbox list items ("- [ ]" / "- [x]") in a tasks.md
 * body — the REST surface has no per-task-item endpoint yet, so completion
 * is derived from the same rendered markdown the doc view already fetches,
 * rather than adding a backend field. */
export interface TaskCompletion {
	done: number;
	total: number;
}

const CHECKBOX_LINE = /^[ \t]*[-*]\s\[([ xX])\]/gm;

export function parseTaskCompletion(markdown: string | undefined): TaskCompletion | undefined {
	if (!markdown) return undefined;
	let done = 0;
	let total = 0;
	for (const match of markdown.matchAll(CHECKBOX_LINE)) {
		total += 1;
		if (match[1] !== ' ') done += 1;
	}
	return total > 0 ? { done, total } : undefined;
}
