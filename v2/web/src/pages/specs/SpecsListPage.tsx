import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { StatusBadge, Icon } from '../../ds';
import { usePageTitle } from '../../app/state/AppStateContext';
import { useSpecs } from '../../data/specs';
import { toBadgeStatus } from './shared';
import type { SpecStageName } from '../../data/specs/types';
import './specs.css';

const STAGE_FILTERS: (SpecStageName | 'all')[] = ['all', 'requirements', 'design', 'tasks'];

export function SpecsListPage() {
	usePageTitle('Specifications');
	// :workspace is always present — this route only ever mounts under /:workspace.
	const { workspace } = useParams() as { workspace: string };
	const navigate = useNavigate();
	const { data: specs, isLoading, isError, error } = useSpecs(workspace);

	const [search, setSearch] = useState('');
	const [stageFilter, setStageFilter] = useState<SpecStageName | 'all'>('all');

	const filtered = useMemo(() => {
		if (!specs) return [];
		return specs.filter((s) => {
			if (stageFilter !== 'all' && s.currentStage !== stageFilter) return false;
			if (search && !s.featureName.toLowerCase().includes(search.toLowerCase())) return false;
			return true;
		});
	}, [specs, search, stageFilter]);

	return (
		<div>
			<div className="rl-page-header">
				<div className="rl-page-header__title">
					<h1>Specifications</h1>
				</div>
				<span className="rl-eyebrow" style={{ marginLeft: 8 }}>
					GET /specs?workspaceId={workspace}
				</span>
			</div>

			<div className="rl-specs-search">
				<input className="rl-input" placeholder="Filter specs…  /" value={search} onChange={(e) => setSearch(e.target.value)} />
				<div className="rl-specs-search__pills">
					{STAGE_FILTERS.map((f) => (
						<button
							key={f}
							type="button"
							className={['rl-filter-pill', stageFilter === f ? 'rl-filter-pill--active' : ''].filter(Boolean).join(' ')}
							onClick={() => setStageFilter(f)}
						>
							{f}
						</button>
					))}
				</div>
			</div>

			{isLoading ? <p style={{ color: 'var(--text-muted)' }}>Loading specs…</p> : null}
			{isError ? <p style={{ color: 'var(--rose-500)' }}>Failed to load specs: {(error as Error).message}</p> : null}

			{specs && specs.length === 0 ? (
				<div className="rl-card rl-card__pad" style={{ textAlign: 'center', borderStyle: 'dashed' }}>
					<Icon icon={FileText} size={28} />
					<p style={{ marginTop: 12, color: 'var(--text-muted)' }}>
						No specs yet. Start one with the grilling skill, or create it directly.
					</p>
				</div>
			) : null}

			{filtered.length > 0 ? (
				<div className="rl-specs-table">
					<div className="rl-specs-table__header">
						<div>Feature</div>
						<div>Current stage</div>
						<div>Requirements</div>
						<div>Design</div>
						<div>Tasks</div>
						<div>Updated</div>
					</div>
					{filtered.map((spec) => (
						<div key={spec.id} className="rl-specs-table__row" onClick={() => navigate(`/${workspace}/specs/${spec.id}`)}>
							<div className="rl-specs-table__feature">{spec.featureName}</div>
							<div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>{spec.currentStage}</div>
							<div>
								<StatusBadge status={toBadgeStatus(spec.stages.requirements)} />
							</div>
							<div>
								<StatusBadge status={toBadgeStatus(spec.stages.design)} />
							</div>
							<div>
								<StatusBadge status={toBadgeStatus(spec.stages.tasks)} />
							</div>
							<div className="rl-specs-table__updated">{spec.updatedAt}</div>
						</div>
					))}
				</div>
			) : null}

			<p style={{ marginTop: 16, fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
				Approve/deny is human-only — agents cannot self-approve a draft.
			</p>
		</div>
	);
}
