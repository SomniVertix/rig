import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TriangleAlert, CircleCheck } from 'lucide-react';
import { parseOpenQuestions } from '../../domain/openQuestions';

/** W1 decision (wayfinder specs-ui-review-surfaces): a rail card summarizing
 * unresolved open questions (below) paired with inline highlighting of the
 * same items within the doc's own markdown flow (further below) — the rail
 * gives the upfront "N need review" signal, the inline treatment makes them
 * easy to find once you're actually reading. W3 generalizes this pairing
 * across Requirements/Design/Tasks and wires it into SpecDetailPage.tsx for
 * real; this fixture is shaped exactly like specrender.go's real
 * "## Assumptions / Open Questions" output (writeOpenQuestionLine) so the
 * two components can be evaluated against realistic content. */
export const MOCK_OPEN_QUESTIONS_MARKDOWN = `## User Stories

### Story 1: Send a Handoff

- As a workspace, I want to send a titled document to exactly one other workspace.

## Assumptions / Open Questions

- [resolved] "Handoff" is confirmed as the final, shipped name — not just a working name.
- [open] Should \`add_handoff_attachment\` remain legal only while a Handoff is still pending, or should attachments be send-time only?
- [open] What timeout should the arbiter use before treating a subagent as stalled mid-conversation?
- [resolved] A stalled or crashed subagent is treated as an escalation, reusing the tie-break/round-cap pause-and-prompt path.
- [resolved] Freeze in place, no automatic action, if a Handoff's workspace later becomes unreachable.
`;

/** Rail card half of the W1 decision — same footprint as ReviewGateCard. */
export function OpenQuestionsRailCardPrototype({ markdown }: { markdown: string }) {
	const questions = parseOpenQuestions(markdown);
	const unresolved = questions.filter((q) => !q.resolved);

	return (
		<div className="rl-card rl-card__pad">
			<div className="rl-eyebrow" style={{ marginBottom: 10 }}>
				Needs attention
			</div>
			{unresolved.length === 0 ? (
				<p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>No open questions.</p>
			) : (
				<div>
					{unresolved.map((q, i) => (
						<div className="rl-attention-rail__item" key={i}>
							<TriangleAlert size={13} style={{ flex: 'none', marginTop: 2, color: 'var(--amber-500)' }} />
							<span>{q.description}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

/** Inline-highlighting half of the W1 decision: custom `li` rendering so
 * unresolved/resolved lines are visually distinct exactly where they
 * already sit in the doc. Bypasses the shared ds Markdown component
 * (renders react-markdown directly) since Markdown doesn't accept custom
 * renderers today — W3 decides whether that's worth adding there when it
 * wires this into Design's and Tasks' own Open Questions/Flags sections. */
export function OpenQuestionsInlineHighlightPrototype({ markdown }: { markdown: string }) {
	return (
		<div className="rl-markdown">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={{
					li({ children, ...props }) {
						const text = flattenText(children);
						if (text.startsWith('[open] ')) {
							return (
								<li className="rl-attention-inline-open" {...props}>
									<TriangleAlert size={13} style={{ flex: 'none', marginTop: 2, color: 'var(--amber-500)' }} />
									<span>{text.slice('[open] '.length)}</span>
								</li>
							);
						}
						if (text.startsWith('[resolved] ')) {
							return (
								<li className="rl-attention-inline-resolved" {...props}>
									<CircleCheck size={13} style={{ flex: 'none', marginTop: 2 }} />
									<span>{text.slice('[resolved] '.length)}</span>
								</li>
							);
						}
						return <li {...props}>{children}</li>;
					}
				}}
			>
				{markdown}
			</ReactMarkdown>
		</div>
	);
}

function flattenText(children: ReactNode): string {
	if (typeof children === 'string') return children;
	if (Array.isArray(children)) return children.map(flattenText).join('');
	return '';
}
