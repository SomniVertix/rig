import { useEffect, useMemo } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useReactFlow, type NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './graph.css';
import type { Waypoint } from '../../../data/trails/types';
import { WAYPOINT_STATE_PILL } from './graphStyle';
import { WaypointNode, type WaypointFlowNode } from './WaypointNode';
import { useTrailGraph, type GraphDirection } from './useTrailGraph';

const nodeTypes = { waypoint: WaypointNode };

export interface TrailGraphViewProps {
	waypoints: Waypoint[];
	direction: GraphDirection;
	selectedId?: string;
	onSelect: (id: string) => void;
}

function TrailGraphViewInner({ waypoints, direction, selectedId, onSelect }: TrailGraphViewProps) {
	const { nodes, edges, isLayouting } = useTrailGraph(waypoints, direction);
	const { fitView } = useReactFlow();

	// Controlled selection: TrailDetailPage's selectedId is the single source
	// of truth (WaypointInspector reads it too) — ReactFlow's own click
	// handling only ever proposes a change via onNodeClick, never owns state.
	const selectedNodes = useMemo<WaypointFlowNode[]>(
		() => nodes.map((n) => (n.id === selectedId ? { ...n, selected: true } : n)),
		[nodes, selectedId]
	);

	// fitView is imperative on purpose: it needs to rerun after every relayout
	// (direction toggle, data change), not just on first mount, so the
	// declarative `fitView` prop (mount-only) isn't enough here. maxZoom caps
	// it at native size — uncapped, a small graph (a handful of nodes) zooms
	// in past 100% to fill the fixed-height canvas, which overflows the
	// (non-scrolling) container instead of just showing the graph centered.
	useEffect(() => {
		if (!isLayouting) fitView({ padding: 0.2, duration: 200, maxZoom: 1 });
	}, [nodes, isLayouting, fitView]);

	const handleNodeClick: NodeMouseHandler = (_event, node) => onSelect(node.id);

	return (
		<div
			style={{
				position: 'relative',
				width: '100%',
				height: 480,
				borderRadius: 'var(--radius-md)',
				border: '1px solid var(--border-subtle)'
			}}
		>
			<ReactFlow
				nodes={selectedNodes}
				edges={edges}
				nodeTypes={nodeTypes}
				onNodeClick={handleNodeClick}
				selectNodesOnDrag={false}
				multiSelectionKeyCode={null}
				proOptions={{ hideAttribution: true }}
			>
				<Background gap={20} />
				<Controls showInteractive={false} />
				<MiniMap
					pannable
					zoomable
					nodeColor={(n) => {
						const waypoint = (n as WaypointFlowNode).data?.waypoint;
						return waypoint ? WAYPOINT_STATE_PILL[waypoint.state].fg : 'var(--text-faint)';
					}}
				/>
			</ReactFlow>
			{isLayouting && nodes.length === 0 ? (
				<div
					style={{
						position: 'absolute',
						inset: 0,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						color: 'var(--text-faint)',
						fontSize: 'var(--text-sm)',
						pointerEvents: 'none'
					}}
				>
					Laying out graph…
				</div>
			) : null}
		</div>
	);
}

/** Self-contained: owns its own ReactFlowProvider rather than requiring
 * TrailDetailPage to wrap one, per the expedition's no-reusable-infra
 * scoping — nothing outside this file needs ReactFlow's own context. */
export function TrailGraphView(props: TrailGraphViewProps) {
	return (
		<ReactFlowProvider>
			<TrailGraphViewInner {...props} />
		</ReactFlowProvider>
	);
}
