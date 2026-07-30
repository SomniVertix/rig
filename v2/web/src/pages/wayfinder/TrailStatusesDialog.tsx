import { Dialog, Badge } from '../../ds';
import { TRAIL_STATUS_TONE, WaypointStateDot, WAYPOINT_STATE_LABEL } from './shared';
import type { TrailStatus, WaypointState } from '../../data/trails/types';

const TRAIL_STATUSES: { status: TrailStatus; note: string }[] = [
	{ status: 'active', note: 'Being walked — waypoints still sighted/marked/claimed.' },
	{ status: 'settled', note: 'Destination reached with a decision or change outcome; no spec was chartered.' },
	{ status: 'chartered', note: 'Destination reached and handed off as a spec (outcomeSpecId set).' },
	{ status: 'abandoned', note: 'Consciously dropped. Can be reopened.' }
];

const WAYPOINT_STATES: WaypointState[] = ['sighted', 'marked', 'claimed', 'reached', 'bypassed'];
const WAYPOINT_NOTES: Record<WaypointState, string> = {
	sighted: 'Sensed but not yet a sharp question — not claimable.',
	marked: 'A sharp question, claimable once its dependencies have terminated.',
	claimed: 'A conversation is actively resolving it. Claims lapse after 24h if stuck.',
	reached: 'Resolved — resolution and a short gist are recorded.',
	bypassed: 'Consciously routed around, with a reason.'
};

export interface TrailStatusesDialogProps {
	open: boolean;
	onClose: () => void;
}

export function TrailStatusesDialog({ open, onClose }: TrailStatusesDialogProps) {
	return (
		<Dialog open={open} onClose={onClose} title="Trail statuses" maxWidth={560}>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<div>
					<div className="rl-eyebrow" style={{ marginBottom: 8 }}>
						Trail
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						{TRAIL_STATUSES.map((s) => (
							<div key={s.status} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
								<Badge tone={TRAIL_STATUS_TONE[s.status]}>{s.status}</Badge>
								<span style={{ color: 'var(--text-body)', fontSize: 'var(--text-sm)' }}>{s.note}</span>
							</div>
						))}
					</div>
				</div>
				<div>
					<div className="rl-eyebrow" style={{ marginBottom: 8 }}>
						Waypoint
					</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
						{WAYPOINT_STATES.map((state) => (
							<div key={state} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
								<span style={{ display: 'flex', alignItems: 'center', gap: 6, width: 74, flex: 'none' }}>
									<WaypointStateDot state={state} />
									<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{WAYPOINT_STATE_LABEL[state]}</span>
								</span>
								<span style={{ color: 'var(--text-body)', fontSize: 'var(--text-sm)' }}>{WAYPOINT_NOTES[state]}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</Dialog>
	);
}
