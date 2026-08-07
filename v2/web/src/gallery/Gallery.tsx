import { useState } from 'react';
import { Check, X, Play, FileText } from 'lucide-react';
import {
	Icon,
	Button,
	IconButton,
	Badge,
	Tag,
	Card,
	CardPad,
	CardEyebrow,
	CardTitle,
	CardBody,
	CardFooter,
	StatusBadge,
	StageStepper,
	Tabs,
	Select,
	Textarea,
	Dialog,
	Toast,
	Markdown,
	type Status
} from '../ds';
import {
	MOCK_OPEN_QUESTIONS_MARKDOWN,
	OpenQuestionsRailCardPrototype,
	OpenQuestionsInlineHighlightPrototype
} from '../pages/specs/openQuestionsAttention';
import '../pages/specs/specs.css';

const statuses: Status[] = ['draft', 'in_review', 'approved', 'denied', 'running'];
const badgeTones = ['neutral', 'accent', 'success', 'danger', 'info', 'outline'] as const;
const btnVariants = ['primary', 'secondary', 'ghost', 'success', 'danger'] as const;

const SAMPLE_MARKDOWN = `# Requirements

## User story

As a **spec author**, I want documents to render as *formatted* markdown so I can read them without squinting at raw \`#\` characters.

### Acceptance criteria

1. Headings render at distinct sizes
2. Lists nest correctly
   - like this
   - and this
3. \`inline code\` and fenced blocks are monospaced

\`\`\`ts
function render(doc: string) {
	return parse(doc);
}
\`\`\`

> A blockquote noting an open question.

| Stage | Status |
| --- | --- |
| requirements | approved |
| design | in_review |

[a link](https://example.com) and a horizontal rule below.

---

Done.
`;

/** Dev-only visual QA surface — renders every ds/ component + variant against the ported CSS. */
export function Gallery() {
	const [tab, setTab] = useState('one');
	const [dialogOpen, setDialogOpen] = useState(false);

	return (
		<div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 900 }}>
			<section>
				<h2>Buttons</h2>
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					{btnVariants.map((v) => (
						<Button key={v} variant={v} icon={v === 'success' ? Check : v === 'danger' ? X : Play}>
							{v}
						</Button>
					))}
				</div>
			</section>

			<section>
				<h2>IconButtons</h2>
				<div style={{ display: 'flex', gap: 8 }}>
					<IconButton icon={Check} aria-label="approve" />
					<IconButton icon={X} aria-label="deny" solid />
				</div>
			</section>

			<section>
				<h2>Badges</h2>
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					{badgeTones.map((t) => (
						<Badge key={t} tone={t}>
							{t}
						</Badge>
					))}
					<Tag onRemove={() => {}}>removable tag</Tag>
				</div>
			</section>

			<section>
				<h2>StatusBadge</h2>
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					{statuses.map((s) => (
						<StatusBadge key={s} status={s} />
					))}
				</div>
			</section>

			<section>
				<h2>StageStepper</h2>
				<StageStepper
					steps={[
						{ key: 'requirements', label: 'Requirements' },
						{ key: 'design', label: 'Design' },
						{ key: 'tasks', label: 'Tasks' },
						{ key: 'implementation', label: 'Implementation' }
					]}
					currentKey="design"
				/>
			</section>

			<section>
				<h2>Tabs</h2>
				<Tabs
					tabs={[
						{ key: 'one', label: 'Requirements' },
						{ key: 'two', label: 'Design' },
						{ key: 'three', label: 'Tasks' }
					]}
					activeKey={tab}
					onChange={setTab}
				/>
			</section>

			<section>
				<h2>Card</h2>
				<Card style={{ maxWidth: 320 }}>
					<CardPad>
						<CardEyebrow>SPEC · #a1f3</CardEyebrow>
						<CardTitle>Structured logging pipeline</CardTitle>
						<CardBody>Sample card body text.</CardBody>
					</CardPad>
					<CardFooter>
						<Icon icon={FileText} />
						<span>footer</span>
					</CardFooter>
				</Card>
			</section>

			<section>
				<h2>Fields</h2>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 320 }}>
					<Select label="Executor" hint="claude · sonnet · default" options={[{ value: 'claude', label: 'claude' }, { value: 'pi', label: 'pi' }]} />
					<Textarea label="Seed prompt" placeholder="The loose idea — what should exist that does not?" />
				</div>
			</section>

			<section>
				<h2>Toast</h2>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340 }}>
					<Toast tone="success" title="Trail charted" message="wayfinder-agent · web-ui" />
					<Toast tone="danger" title="Deny recorded" />
					<Toast tone="info" title="Refetching…" />
				</div>
			</section>

			<section>
				<h2>Markdown</h2>
				<Card style={{ maxWidth: 640 }}>
					<CardPad>
						<Markdown>{SAMPLE_MARKDOWN}</Markdown>
					</CardPad>
				</Card>
			</section>

			<section>
				<h2>Open questions attention (wayfinder W1)</h2>
				<p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginBottom: 16 }}>
					Decided treatment for floating unresolved open questions: a rail card giving the upfront count, paired with
					inline highlighting within the doc's own markdown flow. W3 generalizes this across Requirements/Design/Tasks
					and wires it into SpecDetailPage.tsx for real.
				</p>

				<h3 style={{ fontSize: 'var(--text-sm)', marginBottom: 8 }}>Rail card</h3>
				<div style={{ maxWidth: 320, marginBottom: 24 }}>
					<OpenQuestionsRailCardPrototype markdown={MOCK_OPEN_QUESTIONS_MARKDOWN} />
				</div>

				<h3 style={{ fontSize: 'var(--text-sm)', marginBottom: 8 }}>Inline highlighting</h3>
				<Card style={{ maxWidth: 640, marginBottom: 24 }}>
					<CardPad>
						<OpenQuestionsInlineHighlightPrototype markdown={MOCK_OPEN_QUESTIONS_MARKDOWN} />
					</CardPad>
				</Card>

				<h3 style={{ fontSize: 'var(--text-sm)', marginBottom: 8 }}>Combined, laid out like the real spec detail page</h3>
				<div className="rl-detail-grid" style={{ maxWidth: 900 }}>
					<Card>
						<CardPad>
							<OpenQuestionsInlineHighlightPrototype markdown={MOCK_OPEN_QUESTIONS_MARKDOWN} />
						</CardPad>
					</Card>
					<div className="rl-detail-grid__rail">
						<OpenQuestionsRailCardPrototype markdown={MOCK_OPEN_QUESTIONS_MARKDOWN} />
					</div>
				</div>
			</section>

			<section>
				<h2>Dialog</h2>
				<Button variant="primary" onClick={() => setDialogOpen(true)}>
					Open dialog
				</Button>
				<Dialog
					open={dialogOpen}
					onClose={() => setDialogOpen(false)}
					title="Abort run"
					footer={
						<>
							<Button variant="ghost" onClick={() => setDialogOpen(false)}>
								Cancel
							</Button>
							<Button variant="danger" onClick={() => setDialogOpen(false)}>
								Abort run
							</Button>
						</>
					}
				>
					This will terminate the running node immediately. Audit row written in-transaction.
				</Dialog>
			</section>
		</div>
	);
}
