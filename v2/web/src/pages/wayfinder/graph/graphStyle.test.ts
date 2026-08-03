import { describe, expect, it } from 'vitest';
import { WAYPOINT_STATE_PILL, getWaypointEdgeStyle, isWaypointResolved } from './graphStyle';
import type { WaypointState } from '../../../data/trails/types';

const ALL_STATES: WaypointState[] = ['sighted', 'marked', 'claimed', 'reached', 'bypassed'];

describe('isWaypointResolved', () => {
	it('treats reached and bypassed as resolved, everything else as not', () => {
		expect(ALL_STATES.filter(isWaypointResolved)).toEqual(['reached', 'bypassed']);
	});
});

describe('getWaypointEdgeStyle', () => {
	it('renders a solid success-colored edge when the blocker is resolved', () => {
		expect(getWaypointEdgeStyle('reached')).toEqual({ stroke: 'var(--success)', dashed: false });
		expect(getWaypointEdgeStyle('bypassed')).toEqual({ stroke: 'var(--success)', dashed: false });
	});

	it('renders a dashed faint edge when the blocker is still pending', () => {
		expect(getWaypointEdgeStyle('sighted')).toEqual({ stroke: 'var(--text-faint)', dashed: true });
		expect(getWaypointEdgeStyle('marked')).toEqual({ stroke: 'var(--text-faint)', dashed: true });
		expect(getWaypointEdgeStyle('claimed')).toEqual({ stroke: 'var(--text-faint)', dashed: true });
	});
});

describe('WAYPOINT_STATE_PILL', () => {
	it('defines a color pair for every waypoint state', () => {
		for (const state of ALL_STATES) {
			expect(WAYPOINT_STATE_PILL[state].fg).toMatch(/^var\(--/);
			expect(WAYPOINT_STATE_PILL[state].bg).toMatch(/^var\(--/);
		}
	});
});
