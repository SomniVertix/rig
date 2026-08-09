import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { Badge, Button, StatusBadge, StageStepper, Tabs, Textarea, Tooltip } from '../../ds';
import { MarkdownWithAttention, OpenQuestionsAttentionCard, TraceabilityAttentionCard } from './needsAttention';
import { usePageTitle } from '../../app/state/AppStateContext';
import { useSpec, useSpecDocument, useApproveStage, useDenyStage, useOriginTrail, useTasksDocs } from '../../data/specs';
import { SPEC_STAGE_CONFIG } from '../../config/specStages';
import { SPEC_STAGE_ORDER, tasksDocDisplayStatus } from '../../domain/specs';
import { parseTaskCompletion, type TaskCompletion } from '../../domain/taskCompletion';
import { toBadgeStatus } from './shared';
import type { SpecStageName } from '../../data/specs/types';
import type { TasksDocDTO } from '../../api/types';
import './specs.css';

const STEPPER_STEPS = [...SPEC_STAGE_ORDER, 'implementation'].map((key) => ({
	key,
	label: key === 'implementation' ? 'Implementation' : SPEC_STAGE_CONFIG.find((s) => s.key === key)!.label
}));

export function SpecDetailPage() {
	// :workspace is always present — this route only ever mounts under /:workspace.
	const { workspace, specId = '' } = useParams() as { workspace: string; specId?: string };
	const { data: spec, isLoading, isError, error } = useSpec(specId);
	usePageTitle(spec ? spec.featureName : 'Spec detail');

	const [activeStage, setActiveStage] = useState<SpecStageName>('requirements');
	// Default the open tab to the spec's actual current stage once it loads
	// (only once — after that the user's own tab clicks take over).
	const [defaulted, setDefaulted] = useState(false);
	useEffect(() => {
		if (!defaulted && spec && spec.currentStage !== 'implementation') {
			setActiveStage(spec.currentStage);
			setDefaulted(true);
		}
	}, [defaulted, spec]);

	// Which component's TasksDoc is open — shared between the doc view (main
	// column), its switcher, and its review gate (both rail), all siblings
	// below. Unlike requirements/design, tasks has no single spec-wide
	// status: each component reviews independently.
	const [selectedComponent, setSelectedComponent] = useState<string | undefined>();

	if (isLoading) return <p style={{ color: 'var(--text-muted)' }}>Loading spec…</p>;
	if (isError || !spec) return <p style={{ color: 'var(--rose-500)' }}>Failed to load spec: {(error as Error)?.message ?? 'not found'}</p>;

	const headlineStatus = spec.currentStage === 'implementation' ? 'approved' : spec.stages[spec.currentStage];

	return (
		<div>
			<Link to={`/${workspace}/specs`} className="rl-breadcrumb">
				← specs
			</Link>
			<div className="rl-page-header" style={{ marginBottom: 4 }}>
				<h1>{spec.featureName}</h1>
				<StatusBadge status={toBadgeStatus(headlineStatus)} />
			</div>
			<div className="rl-eyebrow" style={{ marginBottom: 16 }}>
				SPEC · #{spec.id}
			</div>

			<div style={{ marginBottom: 20, maxWidth: 620 }}>
				<StageStepper steps={STEPPER_STEPS} currentKey={spec.currentStage} />
			</div>

			<div className="rl-detail-grid">
				<div>
					<Tabs
						tabs={SPEC_STAGE_ORDER.map((key) => ({ key, label: SPEC_STAGE_CONFIG.find((s) => s.key === key)!.label }))}
						activeKey={activeStage}
						onChange={(k) => setActiveStage(k as SpecStageName)}
					/>
					<div style={{ marginTop: 16 }}>
						{activeStage === 'tasks' ? (
							<TasksDocumentArea specId={spec.id} selected={selectedComponent} />
						) : (
							<DocumentCard specId={spec.id} stage={activeStage} />
						)}
					</div>
				</div>
				<div className="rl-detail-grid__rail">
					{activeStage === 'tasks' && spec.currentStage === 'implementation' ? (
						<ImplementationReadinessCard />
					) : activeStage === 'tasks' ? (
						<TasksReviewGate specId={spec.id} component={selectedComponent} />
					) : (
						<ReviewGateCard specId={spec.id} stage={activeStage} status={spec.stages[activeStage]} />
					)}
					<StageAttentionCards specId={spec.id} stage={activeStage} component={selectedComponent} />
					<StageAgentModelCard />
					<OriginTrailCard specId={spec.id} workspace={workspace} />
					{activeStage === 'tasks' ? (
						<TasksComponentSwitcher specId={spec.id} selected={selectedComponent} onSelect={setSelectedComponent} />
					) : null}
				</div>
			</div>
		</div>
	);
}

function DocumentCard({ specId, stage }: { specId: string; stage: SpecStageName }) {
	const { data, isLoading } = useSpecDocument(specId, stage);

	return (
		<div className="rl-card rl-doc-card">
			{isLoading ? (
				<p style={{ color: 'var(--text-muted)' }}>Loading document…</p>
			) : (
				<div className="rl-doc-card__body">
					{data?.markdown ? (
						<MarkdownWithAttention hideTraceability={stage === 'design'}>
							{data.markdown}
						</MarkdownWithAttention>
					) : (
						'No content yet.'
					)}
				</div>
			)}
			<div className="rl-doc-card__footer">
				rendered on demand · GET /specs/{specId}/render?stage={stage}
			</div>
		</div>
	);
}

/** Tasks tab main column: a spec has one TasksDoc per design component,
 * each reviewed independently — unlike requirements/design's single
 * spec-wide document. Renders whichever component TasksComponentSwitcher
 * (rail) has selected, same footprint as DocumentCard. */
function TasksDocumentArea({ specId, selected }: { specId: string; selected?: string }) {
	const { data: docs, isLoading } = useTasksDocs(specId);

	if (isLoading) {
		return (
			<div className="rl-card rl-doc-card">
				<p style={{ color: 'var(--text-muted)' }}>Loading components…</p>
			</div>
		);
	}

	if (!docs || docs.length === 0) {
		return (
			<div className="rl-card rl-doc-card">
				<div className="rl-doc-card__empty">
					<p>no document</p>
					<p style={{ marginTop: 4 }}>Not started. tasks-drafter drafts this stage, per design component.</p>
				</div>
			</div>
		);
	}

	// docs.length > 0 was just checked above, so docs[0] is safe.
	const selectedDoc = docs.find((d) => d.componentSlug === selected) ?? docs[0]!;
	return <TaskDocumentCard specId={specId} doc={selectedDoc} />;
}

/** Fetches one component's tasks.md and derives done/total from its
 * checkbox lines — same document DocumentCard renders when selected, just
 * read here for its counts instead of its prose. */
function useComponentCompletion(specId: string, componentSlug: string): TaskCompletion | undefined {
	const { data } = useSpecDocument(specId, 'tasks', componentSlug);
	return parseTaskCompletion(data?.markdown);
}

/** Radial completion indicator — a Tooltip carries the exact "done/total"
 * ratio on hover, since the ring itself only shows it approximately. Ring's
 * circles are `fill="none"`, so the wrapper (not the <svg> itself) is what
 * gives the tooltip a full 18x18 hit box instead of just the thin stroke. */
function CompletionRing({ completion }: { completion?: TaskCompletion }) {
	const pct = completion && completion.total > 0 ? completion.done / completion.total : 0;
	const r = 7;
	const c = 2 * Math.PI * r;
	const ring = (
		<svg width={18} height={18} viewBox="0 0 18 18" style={{ flex: 'none' }}>
			<circle cx="9" cy="9" r={r} fill="none" stroke="var(--border-default)" strokeWidth={2.5} />
			<circle
				cx="9"
				cy="9"
				r={r}
				fill="none"
				stroke="var(--accent)"
				strokeWidth={2.5}
				strokeDasharray={c}
				strokeDashoffset={c * (1 - pct)}
				strokeLinecap="round"
				transform="rotate(-90 9 9)"
			/>
		</svg>
	);

	if (!completion) return ring;
	return <Tooltip label={`${completion.done}/${completion.total} tasks complete`}>{ring}</Tooltip>;
}

function ComponentSwitcherRow({
	doc,
	selected,
	onSelect,
	completion
}: {
	doc: TasksDocDTO;
	selected: boolean;
	onSelect: () => void;
	completion?: TaskCompletion;
}) {
	const rowClass = ['rl-component-switcher__row', selected ? 'rl-component-switcher__row--selected' : '']
		.filter(Boolean)
		.join(' ');

	return (
		<button type="button" className={rowClass} onClick={onSelect}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
				<CompletionRing completion={completion} />
				<StatusBadge status={toBadgeStatus(tasksDocDisplayStatus(doc))} label={doc.componentName} />
			</div>
		</button>
	);
}

/** Rail switcher for the tasks tab — picks which component's TasksDoc
 * TasksDocumentArea (main column) and TasksReviewGate (rail, above this)
 * are showing. Owns the "default to first component" effect since it's
 * the one thing on the tasks tab that's always mounted and has the list. */
function TasksComponentSwitcher({
	specId,
	selected,
	onSelect
}: {
	specId: string;
	selected?: string;
	onSelect: (slug: string) => void;
}) {
	const { data: docs } = useTasksDocs(specId);

	// Default to the first component (alphabetical by slug, per the API's
	// own ordering) once docs load, so the tab never opens on an empty pane.
	useEffect(() => {
		if (!selected && docs && docs.length > 0) onSelect(docs[0]!.componentSlug);
	}, [selected, docs, onSelect]);

	if (!docs || docs.length === 0) return null;

	// W4 (wayfinder specs-ui-review-surfaces): count components complete
	// (every checkbox checked) instead of approved. Use the same completion
	// logic TasksComponentSwitcherRow uses for its CompletionRing.
	const rows = docs.map((doc) => (
		<TasksComponentSwitcherRow
			key={doc.id}
			specId={specId}
			doc={doc}
			selected={doc.componentSlug === selected}
			onSelect={() => onSelect(doc.componentSlug)}
		/>
	));

	return (
		<div className="rl-card rl-card__pad">
			<TasksCompletionMetric specId={specId} docs={docs} />
			<div className="rl-component-switcher">{rows}</div>
		</div>
	);
}

function TasksComponentSwitcherRow({
	specId,
	doc,
	selected,
	onSelect
}: {
	specId: string;
	doc: TasksDocDTO;
	selected: boolean;
	onSelect: () => void;
}) {
	const completion = useComponentCompletion(specId, doc.componentSlug);
	return <ComponentSwitcherRow doc={doc} selected={selected} onSelect={onSelect} completion={completion} />;
}

/** Metric line for TasksComponentSwitcher: counts components whose tasks.md
 * has every checkbox checked ("components complete"), replacing the prior
 * "approved" count per W4 (wayfinder specs-ui-review-surfaces). */
function TasksCompletionMetric({ specId, docs }: { specId: string; docs: TasksDocDTO[] }) {
	// Fetch completions for all components. Each hook call must happen
	// unconditionally, so we call them in a fixed-length array matching docs.
	const completions = docs.map((doc) => {
		// eslint-disable-next-line react-hooks/rules-of-hooks
		return useComponentCompletion(specId, doc.componentSlug);
	});

	const completeCount = completions.filter((c) => c && c.done === c.total && c.total > 0).length;

	return (
		<div className="rl-eyebrow" style={{ marginBottom: 10 }}>
			{completeCount}/{docs.length} components complete
		</div>
	);
}

function TaskDocumentCard({ specId, doc }: { specId: string; doc: TasksDocDTO }) {
	const { data, isLoading } = useSpecDocument(specId, 'tasks', doc.componentSlug);

	return (
		<div className="rl-card rl-doc-card">
			{isLoading ? (
				<p style={{ color: 'var(--text-muted)' }}>Loading document…</p>
			) : (
				<div className="rl-doc-card__body">
					{data?.markdown ? (
						<MarkdownWithAttention>{data.markdown}</MarkdownWithAttention>
					) : (
						'No content yet.'
					)}
				</div>
			)}
			<div className="rl-doc-card__footer">
				rendered on demand · GET /specs/{specId}/render?stage=tasks&component={doc.componentSlug}
			</div>
		</div>
	);
}

function TasksReviewGate({ specId, component }: { specId: string; component?: string }) {
	const { data: docs } = useTasksDocs(specId);
	const doc = docs?.find((d) => d.componentSlug === component);

	if (!doc) return null;

	return <ReviewGateCard specId={specId} stage="tasks" status={tasksDocDisplayStatus(doc)} component={doc.componentSlug} />;
}

/** Renders the appropriate "needs attention" cards for the current stage:
 * - Requirements: open questions
 * - Design: traceability + open questions
 * - Tasks: open questions (per-component) */
function StageAttentionCards({
	specId,
	stage,
	component
}: {
	specId: string;
	stage: SpecStageName;
	component?: string;
}) {
	const { data } = useSpecDocument(specId, stage, component);
	if (!data?.markdown) return null;

	if (stage === 'design') {
		return (
			<>
				<TraceabilityAttentionCard markdown={data.markdown} />
				<OpenQuestionsAttentionCard markdown={data.markdown} />
			</>
		);
	}

	// Requirements and Tasks both just show open questions
	return <OpenQuestionsAttentionCard markdown={data.markdown} />;
}

function ReviewGateCard({
	specId,
	stage,
	status,
	component
}: {
	specId: string;
	stage: SpecStageName;
	status: string;
	component?: string;
}) {
	const approve = useApproveStage(specId);
	const deny = useDenyStage(specId);
	const [denyOpen, setDenyOpen] = useState(false);
	const [reason, setReason] = useState('');
	const config = SPEC_STAGE_CONFIG.find((s) => s.key === stage)!;

	if (status === 'not_started') return null;

	if (status === 'approved') {
		return (
			<div className="rl-card rl-card__pad">
				<div className="rl-gate-card__line" style={{ color: 'var(--emerald-500)' }}>
					<Check size={15} /> {component ? 'Component' : 'Stage'} approved · web-ui
				</div>
			</div>
		);
	}

	if (status === 'denied') {
		return (
			<div className="rl-card rl-card__pad">
				<div className="rl-gate-card__line" style={{ color: 'var(--rose-500)' }}>
					Denied — redrafting
				</div>
				<div className="rl-gate-card__progress" />
				<p style={{ marginTop: 10, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{config.agent} redrafting…</p>
			</div>
		);
	}

	// in_review
	return (
		<div className="rl-card rl-card__pad">
			<div className="rl-eyebrow" style={{ marginBottom: 6 }}>
				Human review gate
			</div>
			<p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-body)', marginBottom: 12 }}>
				{component ? 'This component' : config.label} is in review. Approve to advance, or deny with a reason.
			</p>
			{!denyOpen ? (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					<Button
						variant="success"
						block
						icon={Check}
						disabled={approve.isPending}
						onClick={() => approve.mutate({ stage, component })}
					>
						Approve
					</Button>
					<Button variant="danger" block icon={X} onClick={() => setDenyOpen(true)}>
						Deny & redraft
					</Button>
				</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					<Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What needs to change." />
					<div style={{ display: 'flex', gap: 8 }}>
						<Button variant="ghost" onClick={() => setDenyOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="danger"
							disabled={!reason.trim() || deny.isPending}
							onClick={() =>
								deny.mutate({ stage, component, reason }, { onSuccess: () => { setDenyOpen(false); setReason(''); } })
							}
						>
							Confirm deny
						</Button>
					</div>
				</div>
			)}
			{approve.isError || deny.isError ? (
				<p style={{ marginTop: 10, fontSize: 'var(--text-xs)', color: 'var(--rose-500)' }}>
					{(approve.error as Error)?.message ?? (deny.error as Error)?.message}
				</p>
			) : null}
		</div>
	);
}

function StageAgentModelCard() {
	return (
		<div className="rl-card rl-card__pad rl-kv-card">
			{SPEC_STAGE_CONFIG.map((s) => (
				<div className="rl-kv-card__row" key={s.key}>
					<span className="rl-kv-card__label">{s.label}</span>
					<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
						{s.agent} · <Badge tone="accent">{s.model}</Badge>
					</span>
				</div>
			))}
		</div>
	);
}

function OriginTrailCard({ specId, workspace }: { specId: string; workspace: string }) {
	const { data: trail } = useOriginTrail(specId);
	if (!trail) return null;

	return (
		<div className="rl-card rl-card__pad">
			<div className="rl-eyebrow" style={{ marginBottom: 6 }}>
				Origin trail
			</div>
			<Link to={`/${workspace}/trails/${trail.id}`}>{trail.name} →</Link>
		</div>
	);
}

/** W5 (wayfinder specs-ui-review-surfaces): appears on the Tasks tab when
 * spec.currentStage === 'implementation', replacing the per-component review
 * gate. Shows that all task components are complete and approved, and
 * implementation can begin. Reuses the shared attention pattern visual style. */
function ImplementationReadinessCard() {
	return (
		<div className="rl-card rl-card__pad">
			<div className="rl-eyebrow" style={{ marginBottom: 6, color: 'var(--emerald-500)' }}>
				Ready for Implementation
			</div>
			<div className="rl-gate-card__line" style={{ color: 'var(--emerald-500)', marginBottom: 8 }}>
				<Check size={15} /> All components approved
			</div>
			<p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>
				Every task component has been reviewed and approved. This spec is ready to implement.
			</p>
		</div>
	);
}
