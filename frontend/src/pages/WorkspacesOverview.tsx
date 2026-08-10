import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../ds';
import { usePageTitle } from '../app/state/AppStateContext';
import { useWorkspaceSummaries } from '../data/workspaceSummaries';
import type { WorkspaceSummary, StageDistributionStatus } from '../data/workspaceSummaries/types';

const STAGE_COLOR: Record<StageDistributionStatus, string> = {
	not_started: 'var(--status-draft-fg)',
	in_review: 'var(--status-review-fg)',
	approved: 'var(--status-approved-fg)',
	denied: 'var(--status-denied-fg)'
};

export function WorkspacesOverview() {
	usePageTitle('Workspaces');
	const navigate = useNavigate();
	const { data: workspaces, isLoading } = useWorkspaceSummaries();

	const { needsReview, quiet } = useMemo(() => {
		const sorted = [...(workspaces ?? [])].sort((a, b) => b.gatesWaiting - a.gatesWaiting);
		return {
			needsReview: sorted.filter((w) => w.gatesWaiting > 0),
			quiet: sorted.filter((w) => w.gatesWaiting === 0)
		};
	}, [workspaces]);

	if (isLoading) return <p style={{ color: 'var(--text-muted)' }}>Loading workspaces…</p>;

	return (
		<div>
			<h1 style={{ marginBottom: 24 }}>Workspaces</h1>
			{needsReview.length > 0 ? (
				<Section label="Needs your review first" workspaces={needsReview} onOpen={(slug) => navigate(`/${slug}/specs`)} />
			) : null}
			{quiet.length > 0 ? (
				<Section label="Quiet" workspaces={quiet} quiet onOpen={(slug) => navigate(`/${slug}/specs`)} />
			) : null}
		</div>
	);
}

function Section({
	label,
	workspaces,
	quiet = false,
	onOpen
}: {
	label: string;
	workspaces: WorkspaceSummary[];
	quiet?: boolean;
	onOpen: (slug: string) => void;
}) {
	return (
		<div style={{ marginBottom: 28 }}>
			<div className="rl-section-label">{label}</div>
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
				{workspaces.map((workspace) => (
					<WorkspaceCard key={workspace.slug} workspace={workspace} quiet={quiet} onClick={() => onOpen(workspace.slug)} />
				))}
			</div>
		</div>
	);
}

function WorkspaceCard({ workspace, quiet, onClick }: { workspace: WorkspaceSummary; quiet: boolean; onClick: () => void }) {
	const total = workspace.stageDistribution.reduce((sum, s) => sum + s.count, 0);

	return (
		<div
			className="rl-card"
			onClick={onClick}
			style={{ padding: 16, cursor: 'pointer', opacity: quiet ? 0.85 : 1 }}
		>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
				<span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
					{workspace.slug}
				</span>
				<StatusBadge
					status={workspace.gatesWaiting > 0 ? 'in_review' : 'draft'}
					label={workspace.gatesWaiting > 0 ? `${workspace.gatesWaiting} gates` : 'quiet'}
				/>
			</div>

			<div style={{ display: 'flex', gap: 2, height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 10, background: 'var(--bg-inset)' }}>
				{total > 0
					? workspace.stageDistribution.map((s) => (
							<span key={s.status} style={{ flex: s.count / total, background: STAGE_COLOR[s.status] }} />
						))
					: null}
			</div>

			<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginBottom: quiet ? 0 : 6 }}>
				{workspace.specCount} specs · {workspace.trailCount} trails
			</div>

			{!quiet ? (
				<div style={{ fontSize: 12, color: 'var(--status-review-fg)', marginBottom: 6 }}>
					{workspace.gatesWaiting} stage{workspace.gatesWaiting > 1 ? 's' : ''} waiting on you
				</div>
			) : null}

			<div
				style={{
					marginTop: 8,
					paddingTop: 8,
					borderTop: '1px solid var(--border-subtle)',
					fontFamily: 'var(--font-mono)',
					fontSize: 11,
					color: 'var(--text-faint)'
				}}
			>
				{workspace.lastWriteAt ? `last write ${workspace.lastWriteAt}` : 'no writes yet'}
			</div>
		</div>
	);
}
