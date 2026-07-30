import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../ds';
import { usePageTitle } from '../app/state/AppStateContext';
import { useProjects } from '../data/projects';
import type { Project, StageDistributionStatus } from '../data/projects/types';

const STAGE_COLOR: Record<StageDistributionStatus, string> = {
	not_started: 'var(--status-draft-fg)',
	in_review: 'var(--status-review-fg)',
	approved: 'var(--status-approved-fg)',
	denied: 'var(--status-denied-fg)'
};

export function ProjectsOverview() {
	usePageTitle('Projects');
	const navigate = useNavigate();
	const { data: projects, isLoading } = useProjects();

	const { needsReview, quiet } = useMemo(() => {
		const sorted = [...(projects ?? [])].sort((a, b) => b.gatesWaiting - a.gatesWaiting);
		return {
			needsReview: sorted.filter((p) => p.gatesWaiting > 0),
			quiet: sorted.filter((p) => p.gatesWaiting === 0)
		};
	}, [projects]);

	if (isLoading) return <p style={{ color: 'var(--text-muted)' }}>Loading projects…</p>;

	return (
		<div>
			<h1 style={{ marginBottom: 24 }}>Projects</h1>
			{needsReview.length > 0 ? (
				<Section label="Needs your review first" projects={needsReview} onOpen={(slug) => navigate(`/${slug}/specs`)} />
			) : null}
			{quiet.length > 0 ? (
				<Section label="Quiet" projects={quiet} quiet onOpen={(slug) => navigate(`/${slug}/specs`)} />
			) : null}
		</div>
	);
}

function Section({
	label,
	projects,
	quiet = false,
	onOpen
}: {
	label: string;
	projects: Project[];
	quiet?: boolean;
	onOpen: (slug: string) => void;
}) {
	return (
		<div style={{ marginBottom: 28 }}>
			<div className="rl-section-label">{label}</div>
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 14 }}>
				{projects.map((project) => (
					<ProjectCard key={project.slug} project={project} quiet={quiet} onClick={() => onOpen(project.slug)} />
				))}
			</div>
		</div>
	);
}

function ProjectCard({ project, quiet, onClick }: { project: Project; quiet: boolean; onClick: () => void }) {
	const total = project.stageDistribution.reduce((sum, s) => sum + s.count, 0);

	return (
		<div
			className="rl-card"
			onClick={onClick}
			style={{ padding: 16, cursor: 'pointer', opacity: quiet ? 0.85 : 1 }}
		>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
				<span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
					{project.slug}
				</span>
				<StatusBadge
					status={project.gatesWaiting > 0 ? 'in_review' : 'draft'}
					label={project.gatesWaiting > 0 ? `${project.gatesWaiting} gates` : 'quiet'}
				/>
			</div>

			<div style={{ display: 'flex', gap: 2, height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 10, background: 'var(--bg-inset)' }}>
				{total > 0
					? project.stageDistribution.map((s) => (
							<span key={s.status} style={{ flex: s.count / total, background: STAGE_COLOR[s.status] }} />
						))
					: null}
			</div>

			<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginBottom: quiet ? 0 : 6 }}>
				{project.specCount} specs · {project.trailCount} trails
			</div>

			{!quiet ? (
				<div style={{ fontSize: 12, color: 'var(--status-review-fg)', marginBottom: 6 }}>
					{project.gatesWaiting} stage{project.gatesWaiting > 1 ? 's' : ''} waiting on you
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
				{project.lastWriteAt ? `last write ${project.lastWriteAt}` : 'no writes yet'}
			</div>
		</div>
	);
}
