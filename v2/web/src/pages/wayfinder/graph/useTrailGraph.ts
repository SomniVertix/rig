import { useEffect, useRef, useState } from 'react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { Edge } from '@xyflow/react';
import { MarkerType, Position } from '@xyflow/react';
import type { Waypoint } from '../../../data/trails/types';
import type { WaypointFlowNode } from './WaypointNode';
import { WAYPOINT_NODE_WIDTH, WAYPOINT_NODE_HEIGHT, getWaypointEdgeStyle } from './graphStyle';

const elk = new ELK();

export type GraphDirection = 'lr' | 'tb';

// Locked at W2 — tuned for the 220x76 node locked at W1, not copied from
// elk's bare 20/20 defaults or the reactflow.dev reference's 100/80 (sized
// for its smaller demo node).
const BASE_ELK_OPTIONS = {
	'elk.algorithm': 'layered',
	'elk.layered.spacing.nodeNodeBetweenLayers': '96',
	'elk.spacing.nodeNode': '32'
};

function buildEdges(waypoints: Waypoint[]): Edge[] {
	const byId = new Map(waypoints.map((w) => [w.id, w]));
	return waypoints.flatMap((w) =>
		w.dependsOn.flatMap((depId) => {
			const dep = byId.get(depId);
			if (!dep) return [];
			const { stroke, dashed } = getWaypointEdgeStyle(dep.state);
			const edge: Edge = {
				id: `${depId}->${w.id}`,
				source: depId,
				target: w.id,
				style: { stroke, strokeWidth: 1.5, strokeDasharray: dashed ? '4 3' : undefined },
				markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 16, height: 16 }
			};
			return [edge];
		})
	);
}

export interface UseTrailGraphResult {
	nodes: WaypointFlowNode[];
	edges: Edge[];
	/** True only while no layout has ever completed yet — a relayout (data
	 * change or direction toggle) keeps the previous nodes/edges on screen
	 * instead of flashing back to this, and swaps in the new ones once ready. */
	isLayouting: boolean;
}

/** Owns the elk.layout() lifecycle end to end: turns Waypoint[]/dependsOn[]
 * into raw ReactFlow nodes/edges, reruns layout whenever waypoints or
 * direction change (elk always recomputes fresh — manual drag positions
 * are never fed back in), and exposes only the laid-out result. Selection
 * is deliberately not this hook's concern — TrailGraphView owns that. */
export function useTrailGraph(waypoints: Waypoint[], direction: GraphDirection): UseTrailGraphResult {
	const [layout, setLayout] = useState<{ nodes: WaypointFlowNode[]; edges: Edge[] }>({ nodes: [], edges: [] });
	const [isLayouting, setIsLayouting] = useState(true);
	const generation = useRef(0);

	useEffect(() => {
		const gen = ++generation.current;
		const edges = buildEdges(waypoints);
		const byId = new Map(waypoints.map((w) => [w.id, w]));

		const elkGraph = {
			id: 'root',
			layoutOptions: { ...BASE_ELK_OPTIONS, 'elk.direction': direction === 'tb' ? 'DOWN' : 'RIGHT' },
			children: waypoints.map((w) => ({ id: w.id, width: WAYPOINT_NODE_WIDTH, height: WAYPOINT_NODE_HEIGHT })),
			edges: edges.map((e) => ({ id: e.id, sources: [e.source as string], targets: [e.target as string] }))
		};

		// Handle sides must track direction — LR routes left-to-right, TB top-to-bottom;
		// a node hardcoded to Left/Right target/source would loop edges around its sides
		// in TB mode instead of running straight through.
		const targetPosition = direction === 'tb' ? Position.Top : Position.Left;
		const sourcePosition = direction === 'tb' ? Position.Bottom : Position.Right;

		elk.layout(elkGraph).then((result) => {
			if (gen !== generation.current) return; // a newer layout superseded this one — drop it
			const nodes: WaypointFlowNode[] = (result.children ?? []).map((n) => ({
				id: n.id,
				type: 'waypoint',
				position: { x: n.x ?? 0, y: n.y ?? 0 },
				sourcePosition,
				targetPosition,
				data: { waypoint: byId.get(n.id)! }
			}));
			setLayout({ nodes, edges });
			setIsLayouting(false);
		});
	}, [waypoints, direction]);

	return { nodes: layout.nodes, edges: layout.edges, isLayouting };
}
