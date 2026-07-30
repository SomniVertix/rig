import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { Badge, Button, StatusBadge, StageStepper, Tabs, Textarea } from '../../ds';
import { usePageTitle } from '../../app/state/AppStateContext';
import { useSpec, useSpecDocument, useApproveStage, useDenyStage, useOriginTrail } from '../../data/specs';
import { SPEC_STAGE_CONFIG } from '../../config/specStages';
import { SPEC_STAGE_ORDER } from '../../domain/specs';
import { toBadgeStatus } from './shared';
import type { SpecStageName } from '../../data/specs/types';
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
							<TasksDocumentPlaceholder status={spec.stages.tasks} />
						) : (
							<DocumentCard specId={spec.id} stage={activeStage} stageStatus={spec.stages[activeStage]} />
						)}
					</div>
				</div>
				<div className="rl-detail-grid__rail">
					{activeStage !== 'tasks' ? (
						<ReviewGateCard specId={spec.id} stage={activeStage} status={spec.stages[activeStage]} />
					) : null}
					<StageAgentModelCard />
					<OriginTrailCard specId={spec.id} workspace={workspace} />
				</div>
			</div>
		</div>
	);
}

function DocumentCard({ specId, stage, stageStatus }: { specId: string; stage: SpecStageName; stageStatus: string }) {
	const { data, isLoading } = useSpecDocument(specId, stage);
	const config = SPEC_STAGE_CONFIG.find((s) => s.key === stage)!;

	if (stageStatus === 'not_started') {
		return (
			<div className="rl-card rl-doc-card">
				<div className="rl-doc-card__empty">
					<p>no document</p>
					<p style={{ marginTop: 4 }}>
						Not started. {config.agent} drafts this stage.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="rl-card rl-doc-card">
			{isLoading ? (
				<p style={{ color: 'var(--text-muted)' }}>Loading document…</p>
			) : (
				<div className="rl-doc-card__body">{data?.markdown || 'No content yet.'}</div>
			)}
			<div className="rl-doc-card__footer">
				rendered on demand · GET /specs/{specId}/render?stage={stage}
			</div>
		</div>
	);
}

function TasksDocumentPlaceholder({ status }: { status: string }) {
	return (
		<div className="rl-card rl-doc-card">
			<div className="rl-doc-card__empty">
				<p>Aggregate status: {status}</p>
				<p style={{ marginTop: 8, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
					Task documents are per design-component, and V2's REST surface has no endpoint to list a spec's
					components yet — only <code>render</code>/<code>finalize</code>/<code>approve</code>/<code>deny</code>{' '}
					accept a component slug you'd already have to know (see GAPS.md §3b).
				</p>
			</div>
		</div>
	);
}

function ReviewGateCard({ specId, stage, status }: { specId: string; stage: SpecStageName; status: string }) {
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
					<Check size={15} /> Stage approved · web-ui
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
				{config.label} is in review. Approve to advance, or deny with a reason.
			</p>
			{!denyOpen ? (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					<Button
						variant="success"
						block
						icon={Check}
						disabled={approve.isPending}
						onClick={() => approve.mutate({ stage })}
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
							onClick={() => deny.mutate({ stage, reason }, { onSuccess: () => { setDenyOpen(false); setReason(''); } })}
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
