import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Badge, StageStepper, Tabs } from '../../ds';
import { usePageTitle } from '../../app/state/AppStateContext';
import { useTrail } from '../../data/trails';
import { TRAIL_STATUS_LABEL, TRAIL_STATUS_TONE } from './shared';
import { GraphView } from './GraphView';
import { WaypointListView } from './WaypointListView';
import { WaypointInspector } from './WaypointInspector';
import './wayfinder.css';

// Fixed lineage the design's StageStepper assumes: any expedition that exists
// necessarily passed through discovery, even though V2 has no session record
// to prove it (sessions are unbuilt — see GAPS.md §3). 'abandoned' trails
// don't fit this linear progression and skip the stepper entirely below.
const TRAIL_STAGES = [
	{ key: 'grilling', label: 'Grilling' },
	{ key: 'active', label: 'Active' },
	{ key: 'settled', label: 'Settled' },
	{ key: 'chartered', label: 'Chartered' }
];

export function TrailDetailPage() {
	// :project is always present — this route only ever mounts under /:project.
	const { project, trailId = '' } = useParams() as { project: string; trailId?: string };
	const { data: trail, isLoading, isError, error } = useTrail(trailId);
	usePageTitle(trail ? trail.name : 'Trail detail');

	const [searchParams, setSearchParams] = useSearchParams();
	const subView = searchParams.get('sub') === 'list' ? 'list' : 'graph';
	const [selectedId, setSelectedId] = useState<string | undefined>();

	const setSubView = (next: 'graph' | 'list') => {
		const params = new URLSearchParams(searchParams);
		params.set('sub', next);
		setSearchParams(params);
	};

	const selectedWaypoint = useMemo(() => trail?.waypoints.find((w) => w.id === selectedId), [trail, selectedId]);
	const reachedCount = trail?.waypoints.filter((w) => w.state === 'reached').length ?? 0;

	if (isLoading) return <p style={{ color: 'var(--text-muted)' }}>Loading trail…</p>;
	if (isError || !trail) return <p style={{ color: 'var(--rose-500)' }}>Failed to load trail: {(error as Error)?.message ?? 'not found'}</p>;

	return (
		<div>
			<Link to={`/${project}/trails`} className="rl-breadcrumb">
				← wayfinder
			</Link>
			<div className="rl-page-header" style={{ marginBottom: 4 }}>
				<h1>{trail.name}</h1>
				<Badge tone={TRAIL_STATUS_TONE[trail.status]}>{TRAIL_STATUS_LABEL[trail.status]}</Badge>
			</div>
			<div className="rl-eyebrow" style={{ marginBottom: 16 }}>
				TRAIL · {trail.id}
			</div>

			{trail.status !== 'abandoned' ? (
				<div style={{ marginBottom: 20 }}>
					<StageStepper steps={TRAIL_STAGES} currentKey={trail.status === 'chartered' ? 'chartered' : trail.status} />
				</div>
			) : null}

			<div className="rl-card rl-card__pad">
				<div className="rl-eyebrow">Trailhead</div>
				<p style={{ marginTop: 6, fontSize: 'var(--text-base)', color: 'var(--text-body)' }}>{trail.trailheadPrompt}</p>
				{trail.destination ? (
					<p style={{ marginTop: 6, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>↳ {trail.destination}</p>
				) : null}
			</div>

			<div className="rl-detail-grid">
				<div>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
						<Tabs
							tabs={[
								{ key: 'graph', label: 'Graph' },
								{ key: 'list', label: 'List' }
							]}
							activeKey={subView}
							onChange={(k) => setSubView(k as 'graph' | 'list')}
						/>
						<span className="rl-eyebrow">
							{reachedCount}/{trail.waypoints.length} reached · claims lapse after 24h
						</span>
					</div>
					<div style={{ marginTop: 16 }}>
						{subView === 'graph' ? (
							<GraphView waypoints={trail.waypoints} selectedId={selectedId} onSelect={setSelectedId} />
						) : (
							<WaypointListView waypoints={trail.waypoints} selectedId={selectedId} onSelect={setSelectedId} />
						)}
					</div>
				</div>
				<div className="rl-detail-grid__rail">
					<WaypointInspector trailId={trail.id} waypoint={selectedWaypoint} />
					{trail.outcomeSpecId ? (
						<div className="rl-card rl-card__pad">
							<div className="rl-eyebrow">Outcome</div>
							<Link to={`/${project}/specs/${trail.outcomeSpecId}`} style={{ marginTop: 6, display: 'inline-block' }}>
								Chartered spec →
							</Link>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
