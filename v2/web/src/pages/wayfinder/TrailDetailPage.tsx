import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowDown } from 'lucide-react';
import { Badge, StageStepper, Tabs, Icon } from '../../ds';
import { usePageTitle } from '../../app/state/AppStateContext';
import { useTrail } from '../../data/trails';
import { TRAIL_STATUS_LABEL, TRAIL_STATUS_TONE } from './shared';
import { TrailGraphView } from './graph/TrailGraphView';
import type { GraphDirection } from './graph/useTrailGraph';
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
	// :workspace is always present — this route only ever mounts under /:workspace.
	const { workspace, trailId = '' } = useParams() as { workspace: string; trailId?: string };
	const { data: trail, isLoading, isError, error } = useTrail(trailId);
	usePageTitle(trail ? trail.name : 'Trail detail');

	const [searchParams, setSearchParams] = useSearchParams();
	const subView = searchParams.get('sub') === 'list' ? 'list' : 'graph';
	// Locked at W2: LR is the default (matches the old hand-rolled layout's
	// left-to-right reading direction), persisted the same way as `sub`.
	const direction: GraphDirection = searchParams.get('dir') === 'tb' ? 'tb' : 'lr';
	const [selectedId, setSelectedId] = useState<string | undefined>();

	const setSubView = (next: 'graph' | 'list') => {
		const params = new URLSearchParams(searchParams);
		params.set('sub', next);
		setSearchParams(params);
	};

	const setDirection = (next: GraphDirection) => {
		const params = new URLSearchParams(searchParams);
		params.set('dir', next);
		setSearchParams(params);
	};

	const selectedWaypoint = useMemo(() => trail?.waypoints.find((w) => w.id === selectedId), [trail, selectedId]);
	const reachedCount = trail?.waypoints.filter((w) => w.state === 'reached').length ?? 0;

	if (isLoading) return <p style={{ color: 'var(--text-muted)' }}>Loading trail…</p>;
	if (isError || !trail) return <p style={{ color: 'var(--rose-500)' }}>Failed to load trail: {(error as Error)?.message ?? 'not found'}</p>;

	return (
		<div>
			<Link to={`/${workspace}/trails`} className="rl-breadcrumb">
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
						<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
							<Tabs
								tabs={[
									{ key: 'graph', label: 'Graph' },
									{ key: 'list', label: 'List' }
								]}
								activeKey={subView}
								onChange={(k) => setSubView(k as 'graph' | 'list')}
							/>
							{subView === 'graph' ? (
								<div className="rl-view-toggle">
									<button
										type="button"
										className={['rl-view-toggle__btn', direction === 'lr' ? 'rl-view-toggle__btn--active' : '']
											.filter(Boolean)
											.join(' ')}
										onClick={() => setDirection('lr')}
									>
										<Icon icon={ArrowRight} size={13} /> LR
									</button>
									<button
										type="button"
										className={['rl-view-toggle__btn', direction === 'tb' ? 'rl-view-toggle__btn--active' : '']
											.filter(Boolean)
											.join(' ')}
										onClick={() => setDirection('tb')}
									>
										<Icon icon={ArrowDown} size={13} /> TB
									</button>
								</div>
							) : null}
						</div>
						<span className="rl-eyebrow">
							{reachedCount}/{trail.waypoints.length} reached · claims lapse after 24h
						</span>
					</div>
					<div style={{ marginTop: 16 }}>
						{subView === 'graph' ? (
							<TrailGraphView waypoints={trail.waypoints} direction={direction} selectedId={selectedId} onSelect={setSelectedId} />
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
							<Link to={`/${workspace}/specs/${trail.outcomeSpecId}`} style={{ marginTop: 6, display: 'inline-block' }}>
								Chartered spec →
							</Link>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
