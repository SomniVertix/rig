import type { WaypointState } from '../../../data/trails/types';

export const WAYPOINT_NODE_WIDTH = 220;
export const WAYPOINT_NODE_HEIGHT = 76;

export interface WaypointStatePillColors {
	fg: string;
	bg: string;
}

/** Reuses the same fg/bg token pairs StatusBadge's workflow statuses already
 * define (draft/in_review/approved/denied) rather than inventing new hues —
 * sighted has no analog there, so it gets a plain neutral pair instead. */
export const WAYPOINT_STATE_PILL: Record<WaypointState, WaypointStatePillColors> = {
	sighted: { fg: 'var(--text-muted)', bg: 'var(--bg-inset)' },
	marked: { fg: 'var(--status-draft-fg)', bg: 'var(--status-draft-bg)' },
	claimed: { fg: 'var(--status-review-fg)', bg: 'var(--status-review-bg)' },
	reached: { fg: 'var(--status-approved-fg)', bg: 'var(--status-approved-bg)' },
	bypassed: { fg: 'var(--status-denied-fg)', bg: 'var(--status-denied-bg)' }
};

export function isWaypointResolved(state: WaypointState): boolean {
	return state === 'reached' || state === 'bypassed';
}

export interface WaypointEdgeStyle {
	stroke: string;
	dashed: boolean;
}

/** Binary edge color (variant A, locked at W1): color only ever answers "is
 * the blocker done" — full per-state detail lives on the node pill, so edges
 * stay quiet on graphs with many dependencies. */
export function getWaypointEdgeStyle(sourceState: WaypointState): WaypointEdgeStyle {
	return isWaypointResolved(sourceState)
		? { stroke: 'var(--success)', dashed: false }
		: { stroke: 'var(--text-faint)', dashed: true };
}
