/** Parses the "## Requirement Traceability" markdown table specrender.go
 * writes (renderDesign, "| Requirement | Addressed By |") out of the
 * rendered Design doc — same derive-from-rendered-markdown approach as
 * parseTaskCompletion/parseOpenQuestions, since there's no structured REST
 * surface for traceability today. Each "Addressed By" cell is itself
 * `component-slug` (justification) segments, one per component, joined by
 * " + " in the source markdown. */
export interface TraceabilityAddressedBy {
	componentSlug: string;
	justification?: string;
}

export interface ParsedTraceabilityRow {
	requirement: string;
	addressedBy: TraceabilityAddressedBy[];
}

const ROW_LINE = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/gm;
const ADDRESSED_BY_ENTRY = /`([a-z0-9-]+)`\s*(?:\(([^)]*)\))?/g;

export function parseTraceability(markdown: string | undefined): ParsedTraceabilityRow[] {
	if (!markdown) return [];
	const section = extractSection(markdown, '## Requirement Traceability');
	if (!section) return [];

	const rows: ParsedTraceabilityRow[] = [];
	for (const match of section.matchAll(ROW_LINE)) {
		const requirement = match[1]!;
		const addressedByCell = match[2]!;
		if (requirement === 'Requirement' || requirement.startsWith('---')) continue;

		// A justification sometimes covers more than one component — "`x` and
		// `y` (shared text)" — so an unjustified slug is held as pending until
		// the next justification arrives, then shares it with the whole batch.
		const addressedBy: TraceabilityAddressedBy[] = [];
		let pending: string[] = [];
		for (const entry of addressedByCell.matchAll(ADDRESSED_BY_ENTRY)) {
			const slug = entry[1]!;
			const justification = entry[2];
			pending.push(slug);
			if (justification !== undefined) {
				for (const p of pending) addressedBy.push({ componentSlug: p, justification });
				pending = [];
			}
		}
		for (const p of pending) addressedBy.push({ componentSlug: p });
		rows.push({ requirement, addressedBy });
	}
	return rows;
}

/** Parses the "## Components" table (renderDesign, "| Slug | Display Name |")
 * into a slug → display name map, so traceability views can show a human
 * name instead of a raw kebab-case slug. */
export function parseComponentNames(markdown: string | undefined): Record<string, string> {
	if (!markdown) return {};
	const section = extractSection(markdown, '## Components');
	if (!section) return {};

	const names: Record<string, string> = {};
	for (const match of section.matchAll(ROW_LINE)) {
		const slug = match[1]!;
		const displayName = match[2]!;
		if (slug === 'Slug' || slug.startsWith('---')) continue;
		names[slug] = displayName;
	}
	return names;
}

function extractSection(markdown: string, heading: string): string | undefined {
	const start = markdown.indexOf(heading);
	if (start === -1) return undefined;
	const rest = markdown.slice(start + heading.length);
	const nextHeading = rest.search(/\n## /);
	return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}
