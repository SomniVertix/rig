/** Parses the "- [open] ..." / "- [resolved] ..." lines the backend writes
 * for every Open Questions/Assumptions/Flags section (writeOpenQuestionLine
 * in specrender.go) out of a stage's rendered markdown — same derive-from-
 * rendered-markdown approach as parseTaskCompletion, since there's no
 * structured REST surface for open questions today. */
export interface ParsedOpenQuestion {
	resolved: boolean;
	description: string;
}

const OPEN_QUESTION_LINE = /^[ \t]*[-*]\s\[(open|resolved)\]\s+(.+)$/gm;

export function parseOpenQuestions(markdown: string | undefined): ParsedOpenQuestion[] {
	if (!markdown) return [];
	const out: ParsedOpenQuestion[] = [];
	for (const match of markdown.matchAll(OPEN_QUESTION_LINE)) {
		out.push({ resolved: match[1] === 'resolved', description: match[2]!.trim() });
	}
	return out;
}
