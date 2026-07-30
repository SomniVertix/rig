import type { WaypointState } from '../../data/trails/types';
import type { TrailStatus } from '../../data/trails/types';
import type { BadgeTone } from '../../ds';

export const WAYPOINT_STATE_LABEL: Record<WaypointState, string> = {
	sighted: 'sighted',
	marked: 'marked',
	claimed: 'claimed',
	reached: 'reached',
	bypassed: 'bypassed'
};

/** No dedicated tokens exist for waypoint states (StatusBadge is scoped to the
 * five spec-pipeline statuses) — mapped onto the closest semantic color. */
const WAYPOINT_STATE_COLOR: Record<WaypointState, string> = {
	sighted: 'var(--text-faint)',
	marked: 'var(--text-muted)',
	claimed: 'var(--amber-500)',
	reached: 'var(--emerald-500)',
	bypassed: 'var(--rose-500)'
};

export function WaypointStateDot({ state }: { state: WaypointState }) {
	return (
		<span
			style={{
				display: 'inline-block',
				width: 7,
				height: 7,
				borderRadius: '50%',
				background: WAYPOINT_STATE_COLOR[state],
				flex: 'none'
			}}
			title={WAYPOINT_STATE_LABEL[state]}
		/>
	);
}

/** TrailStatus (active/settled/chartered/abandoned) has no StatusBadge tokens
 * either — those are workflow-stage statuses, not expedition lifecycle. */
export const TRAIL_STATUS_TONE: Record<TrailStatus, BadgeTone> = {
	active: 'accent',
	settled: 'neutral',
	chartered: 'success',
	abandoned: 'outline'
};

export const TRAIL_STATUS_LABEL: Record<TrailStatus, string> = {
	active: 'active',
	settled: 'settled',
	chartered: 'chartered',
	abandoned: 'abandoned'
};
