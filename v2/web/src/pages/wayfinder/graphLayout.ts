import type { Waypoint } from '../../data/trails/types';

export interface GraphNode {
	waypoint: Waypoint;
	x: number;
	y: number;
}

export interface GraphEdge {
	fromId: string;
	toId: string;
	pending: boolean;
}

const NODE_W = 224;
const NODE_H = 78;
const COL_GAP = 64;
const ROW_GAP = 24;

/** Simple longest-path layering: depth = 1 + max(dep depths), 0 if no deps.
 * Columns left-to-right by depth; nodes stacked top-to-bottom within a column. */
export function computeGraphLayout(waypoints: Waypoint[]): { nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number } {
	const byId = new Map(waypoints.map((w) => [w.id, w]));
	const depthCache = new Map<string, number>();

	function depthOf(id: string, visiting: Set<string>): number {
		if (depthCache.has(id)) return depthCache.get(id)!;
		if (visiting.has(id)) return 0; // cycle guard — shouldn't happen per domain rules
		const w = byId.get(id);
		if (!w || w.dependsOn.length === 0) {
			depthCache.set(id, 0);
			return 0;
		}
		visiting.add(id);
		const d = 1 + Math.max(...w.dependsOn.filter((dep) => byId.has(dep)).map((dep) => depthOf(dep, visiting)), -1);
		visiting.delete(id);
		const depth = Math.max(d, 0);
		depthCache.set(id, depth);
		return depth;
	}

	const columns = new Map<number, Waypoint[]>();
	for (const w of waypoints) {
		const depth = depthOf(w.id, new Set());
		if (!columns.has(depth)) columns.set(depth, []);
		columns.get(depth)!.push(w);
	}

	const nodes: GraphNode[] = [];
	const maxCol = Math.max(0, ...columns.keys());
	for (const [depth, items] of columns) {
		items.forEach((w, i) => {
			nodes.push({
				waypoint: w,
				x: depth * (NODE_W + COL_GAP),
				y: i * (NODE_H + ROW_GAP)
			});
		});
	}

	const edges: GraphEdge[] = [];
	for (const w of waypoints) {
		for (const depId of w.dependsOn) {
			const dep = byId.get(depId);
			if (!dep) continue;
			edges.push({ fromId: depId, toId: w.id, pending: dep.state !== 'reached' && dep.state !== 'bypassed' });
		}
	}

	const maxRows = Math.max(1, ...Array.from(columns.values()).map((items) => items.length));
	return {
		nodes,
		edges,
		width: (maxCol + 1) * (NODE_W + COL_GAP),
		height: maxRows * (NODE_H + ROW_GAP)
	};
}

export const GRAPH_NODE_WIDTH = NODE_W;
export const GRAPH_NODE_HEIGHT = NODE_H;
