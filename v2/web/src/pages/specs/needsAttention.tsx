import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TriangleAlert, CircleCheck } from 'lucide-react';
import { Badge, Card, CardPad } from '../../ds';
import { parseOpenQuestions } from '../../domain/openQuestions';
import { parseTraceability, parseComponentNames } from '../../domain/traceability';

/** W3 decision (wayfinder specs-ui-review-surfaces): the unified "needs
 * attention" pattern — a rail card summarizing what needs review, paired
 * with inline treatment where applicable. Reused across Requirements (open
 * questions), Design (traceability + open questions), and Tasks (per-
 * component flags/open questions). */

/* ──────────────────────────────────────────────────────────────────────
 * RAIL CARDS
 * ────────────────────────────────────────────────────────────────────── */

/** Rail card for unresolved open questions — same footprint as ReviewGateCard,
 * works across all three stages (Requirements "Assumptions / Open Questions",
 * Design "Open Questions", Tasks "Flags / Open Questions"). */
export function OpenQuestionsAttentionCard({ markdown }: { markdown: string }) {
	const questions = parseOpenQuestions(markdown);
	const unresolved = questions.filter((q) => !q.resolved);

	if (unresolved.length === 0) return null;

	return (
		<div className="rl-card rl-card__pad">
			<div className="rl-eyebrow" style={{ marginBottom: 10 }}>
				Needs attention
			</div>
			<div>
				{unresolved.map((q, i) => (
					<div className="rl-attention-rail__item" key={i}>
						<TriangleAlert size={13} style={{ flex: 'none', marginTop: 2, color: 'var(--amber-500)' }} />
						<span>{q.description}</span>
					</div>
				))}
			</div>
		</div>
	);
}

/** Rail card for Design's Requirement Traceability — shows which components
 * address which requirements, replacing the flat markdown table in the doc.
 * (The inline treatment below hides the markdown table entirely when this card
 * is present, so they're never shown simultaneously.) */
export function TraceabilityAttentionCard({ markdown }: { markdown: string }) {
	const rows = parseTraceability(markdown);
	const names = parseComponentNames(markdown);

	if (rows.length === 0) return null;

	return (
		<div className="rl-card rl-card__pad">
			<div className="rl-eyebrow" style={{ marginBottom: 10 }}>
				Requirement Traceability
			</div>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
				{rows.map((row, i) => (
					<Card key={i}>
						<CardPad>
							<div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', marginBottom: 8, color: 'var(--text-strong)' }}>
								{row.requirement}
							</div>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
								{row.addressedBy.map((a) => (
									<Badge key={a.componentSlug} tone="accent">
										{names[a.componentSlug] ?? a.componentSlug}
									</Badge>
								))}
							</div>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
								{row.addressedBy.map((a) => (
									<div key={a.componentSlug} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>
										<code style={{ fontSize: 'var(--text-xs)' }}>{a.componentSlug}</code> — {a.justification}
									</div>
								))}
							</div>
						</CardPad>
					</Card>
				))}
			</div>
		</div>
	);
}

/* ──────────────────────────────────────────────────────────────────────
 * INLINE TREATMENTS (for DocumentCard)
 * ────────────────────────────────────────────────────────────────────── */

/** Custom markdown renderer that highlights open questions inline (wherever
 * they appear in the doc) and hides the Design stage's flat Requirement
 * Traceability table (since TraceabilityAttentionCard shows it better in
 * the rail). Use this in place of the ds/Markdown component when the stage
 * needs inline attention treatment. */
export function MarkdownWithAttention({ children, hideTraceability }: { children: string; hideTraceability?: boolean }) {
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
					},
					// Hide the Design stage's flat "| Requirement | Addressed By |" table
					// when hideTraceability is true — the rail's TraceabilityAttentionCard
					// shows it better, and showing both would be redundant.
					table({ children, ...props }) {
						if (hideTraceability) {
							const text = flattenText(children);
							if (text.includes('Requirement') && text.includes('Addressed By')) {
								return null;
							}
						}
						return <table {...props}>{children}</table>;
					}
				}}
			>
				{children}
			</ReactMarkdown>
		</div>
	);
}

function flattenText(children: ReactNode): string {
	if (typeof children === 'string') return children;
	if (Array.isArray(children)) return children.map(flattenText).join('');
	return '';
}
