import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useTrailGraph } from './useTrailGraph';
import type { Waypoint } from '../../../data/trails/types';

// A small chain: a1 (no deps) blocks b1, which blocks c1.
const waypoints: Waypoint[] = [
	{ id: 'a1', title: 'Pick the queue backend', state: 'reached', dependsOn: [] },
	{ id: 'b1', title: 'Define retry policy', state: 'marked', dependsOn: ['a1'] },
	{ id: 'c1', title: 'Wire the dead-letter queue', state: 'sighted', dependsOn: ['b1'] }
];

// Real elk.layout() is exercised deliberately, not mocked — W2 established
// it's deterministic for identical (graph, options) input, so there's
// nothing flaky about asserting on its real output. Assertions are
// structural (relative position, counts) rather than exact pixel values,
// since exact positions are elk's implementation detail and could shift
// across elk versions without the layout actually being wrong.
describe('useTrailGraph', () => {
	it('produces one node per waypoint and one edge per dependsOn entry', async () => {
		const { result } = renderHook(() => useTrailGraph(waypoints, 'lr'));

		await waitFor(() => expect(result.current.isLayouting).toBe(false));

		expect(result.current.nodes).toHaveLength(3);
		expect(result.current.nodes.map((n) => n.id).sort()).toEqual(['a1', 'b1', 'c1']);
		expect(result.current.edges).toHaveLength(2);
		expect(result.current.edges.map((e) => e.id).sort()).toEqual(['a1->b1', 'b1->c1']);
	});

	it('places a blocker strictly before its dependent along the direction axis (lr = x, tb = y)', async () => {
		const { result: lr } = renderHook(() => useTrailGraph(waypoints, 'lr'));
		await waitFor(() => expect(lr.current.isLayouting).toBe(false));
		const lrById = new Map(lr.current.nodes.map((n) => [n.id, n.position]));
		expect(lrById.get('a1')!.x).toBeLessThan(lrById.get('b1')!.x);
		expect(lrById.get('b1')!.x).toBeLessThan(lrById.get('c1')!.x);

		const { result: tb } = renderHook(() => useTrailGraph(waypoints, 'tb'));
		await waitFor(() => expect(tb.current.isLayouting).toBe(false));
		const tbById = new Map(tb.current.nodes.map((n) => [n.id, n.position]));
		expect(tbById.get('a1')!.y).toBeLessThan(tbById.get('b1')!.y);
		expect(tbById.get('b1')!.y).toBeLessThan(tbById.get('c1')!.y);
	});

	it('sets Handle sides to match direction (lr: left/right, tb: top/bottom)', async () => {
		const { result: lr } = renderHook(() => useTrailGraph(waypoints, 'lr'));
		await waitFor(() => expect(lr.current.isLayouting).toBe(false));
		expect(lr.current.nodes[0]!.targetPosition).toBe('left');
		expect(lr.current.nodes[0]!.sourcePosition).toBe('right');

		const { result: tb } = renderHook(() => useTrailGraph(waypoints, 'tb'));
		await waitFor(() => expect(tb.current.isLayouting).toBe(false));
		expect(tb.current.nodes[0]!.targetPosition).toBe('top');
		expect(tb.current.nodes[0]!.sourcePosition).toBe('bottom');
	});

	it('colors an edge by whether its blocker is resolved (reached/bypassed) or still pending', async () => {
		const { result } = renderHook(() => useTrailGraph(waypoints, 'lr'));
		await waitFor(() => expect(result.current.isLayouting).toBe(false));

		const byId = new Map(result.current.edges.map((e) => [e.id, e]));
		// a1 (reached) -> b1: resolved, solid
		expect(byId.get('a1->b1')!.style?.strokeDasharray).toBeUndefined();
		// b1 (marked) -> c1: pending, dashed
		expect(byId.get('b1->c1')!.style?.strokeDasharray).toBe('4 3');
	});
});
