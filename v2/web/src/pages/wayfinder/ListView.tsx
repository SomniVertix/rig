import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button } from '../../ds';
import type { TrailSummary, TrailStatus, WaypointState } from '../../data/trails/types';
import { TRAIL_STATUS_LABEL, TRAIL_STATUS_TONE, WaypointStateDot } from './shared';

const STATUS_FILTERS: (TrailStatus | 'all')[] = ['all', 'active', 'settled', 'chartered', 'abandoned'];

export interface ListViewProps {
	trails: TrailSummary[];
	workspaceId: string;
}

export function ListView({ trails, workspaceId }: ListViewProps) {
	const navigate = useNavigate();
	const [search, setSearch] = useState('');
	const [statusFilter, setStatusFilter] = useState<TrailStatus | 'all'>('all');
	const [selectedId, setSelectedId] = useState<string | undefined>(trails[0]?.id);

	const filtered = useMemo(() => {
		return trails.filter((t) => {
			if (statusFilter !== 'all' && t.status !== statusFilter) return false;
			if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
			return true;
		});
	}, [trails, statusFilter, search]);

	const selected = trails.find((t) => t.id === selectedId) ?? filtered[0];

	return (
		<div className="rl-trails-list">
			<div className="rl-trails-list__master">
				<input
					className="rl-input"
					placeholder="Filter trails…  /"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<div className="rl-trails-list__filters">
					{STATUS_FILTERS.map((f) => (
						<button
							key={f}
							type="button"
							className={['rl-filter-pill', statusFilter === f ? 'rl-filter-pill--active' : ''].filter(Boolean).join(' ')}
							onClick={() => setStatusFilter(f)}
						>
							{f === 'all' ? 'all' : TRAIL_STATUS_LABEL[f]}
						</button>
					))}
				</div>
				<div>
					{filtered.map((trail) => (
						<div
							key={trail.id}
							className={['rl-trail-row', trail.id === selected?.id ? 'rl-trail-row--selected' : ''].filter(Boolean).join(' ')}
							onClick={() => setSelectedId(trail.id)}
							onDoubleClick={() => navigate(`/${workspaceId}/trails/${trail.id}`)}
						>
							<div className="rl-trail-row__title">
								<span>{trail.name}</span>
								<Badge tone={TRAIL_STATUS_TONE[trail.status]}>{TRAIL_STATUS_LABEL[trail.status]}</Badge>
							</div>
							<div className="rl-trail-row__subtitle">{trail.trailheadPrompt}</div>
							<div className="rl-trail-row__meta">
								<span className="rl-trail-row__dots">
									{(Object.keys(trail.waypointCounts) as WaypointState[]).map((state) =>
										trail.waypointCounts[state] > 0 ? <WaypointStateDot key={state} state={state} /> : null
									)}
								</span>
								<span>updated {trail.updatedAt}</span>
							</div>
						</div>
					))}
				</div>
			</div>

			{selected ? (
				<div className="rl-card rl-card__pad">
					<div className="rl-trail-row__title" style={{ marginBottom: 4 }}>
						<span className="rl-card__title">{selected.name}</span>
						<Badge tone={TRAIL_STATUS_TONE[selected.status]}>{TRAIL_STATUS_LABEL[selected.status]}</Badge>
					</div>
					<div className="rl-eyebrow">TRAIL · {selected.id}</div>
					<div style={{ marginTop: 12 }}>
						<Button variant="secondary" size="sm" onClick={() => navigate(`/${workspaceId}/trails/${selected.id}`)}>
							Open trail →
						</Button>
					</div>
					<p style={{ marginTop: 16, color: 'var(--text-body)', fontSize: 'var(--text-base)' }}>{selected.trailheadPrompt}</p>
					{selected.destination ? (
						<p style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>↳ {selected.destination}</p>
					) : null}
					<div className="rl-trail-detail__waypoint-cols">
						<WaypointCountColumn label="Sighted" states={['sighted']} counts={selected.waypointCounts} />
						<WaypointCountColumn label="Claimed · marked" states={['claimed', 'marked']} counts={selected.waypointCounts} />
						<WaypointCountColumn label="Reached · bypassed" states={['reached', 'bypassed']} counts={selected.waypointCounts} />
					</div>
					{selected.outcomeSpecId ? (
						<div className="rl-card__footer" style={{ marginTop: 16, paddingLeft: 0, paddingRight: 0 }}>
							<Link to={`/${workspaceId}/specs/${selected.outcomeSpecId}`}>Outcome spec →</Link>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function WaypointCountColumn({
	label,
	states,
	counts
}: {
	label: string;
	states: WaypointState[];
	counts: Record<WaypointState, number>;
}) {
	return (
		<div>
			<div className="rl-trail-detail__waypoint-col-label">
				{states.map((s) => (
					<WaypointStateDot key={s} state={s} />
				))}
				{label}
			</div>
			<div className="rl-trail-detail__waypoint-item">{states.reduce((sum, s) => sum + counts[s], 0)}</div>
		</div>
	);
}
