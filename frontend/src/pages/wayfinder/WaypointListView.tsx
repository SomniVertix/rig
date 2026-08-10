import type { Waypoint } from '../../data/trails/types';
import { WAYPOINT_STATE_LABEL, WaypointStateDot } from './shared';

export interface WaypointListViewProps {
	waypoints: Waypoint[];
	selectedId?: string;
	onSelect: (id: string) => void;
}

export function WaypointListView({ waypoints, selectedId, onSelect }: WaypointListViewProps) {
	return (
		<div>
			{waypoints.map((wp) => (
				<div
					key={wp.id}
					onClick={() => onSelect(wp.id)}
					className={['rl-trail-row', wp.id === selectedId ? 'rl-trail-row--selected' : ''].filter(Boolean).join(' ')}
					style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, padding: '8px 12px' }}
				>
					<WaypointStateDot state={wp.state} />
					<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', flex: 'none' }}>
						{wp.id.slice(0, 6)}
					</span>
					<span style={{ flex: 1, fontSize: 13, color: 'var(--text-strong)' }}>{wp.title}</span>
					{wp.dependsOn.length > 0 ? (
						<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>
							deps: {wp.dependsOn.length}
						</span>
					) : null}
					<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', width: 70 }}>
						{WAYPOINT_STATE_LABEL[wp.state]}
					</span>
				</div>
			))}
		</div>
	);
}
