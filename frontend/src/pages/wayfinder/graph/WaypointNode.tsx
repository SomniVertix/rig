import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import type { Waypoint } from '../../../data/trails/types';
import { WAYPOINT_STATE_LABEL } from '../shared';
import { WAYPOINT_STATE_PILL } from './graphStyle';
import './graph.css';

export type WaypointNodeData = {
	waypoint: Waypoint;
};

export type WaypointFlowNode = Node<WaypointNodeData, 'waypoint'>;

export const WaypointNode = memo(function WaypointNode({ data, selected, sourcePosition, targetPosition }: NodeProps<WaypointFlowNode>) {
	const { waypoint } = data;
	const pill = WAYPOINT_STATE_PILL[waypoint.state];
	const bypassed = waypoint.state === 'bypassed';

	const classes = ['rl-graph-node', selected ? 'rl-graph-node--selected' : '', bypassed ? 'rl-graph-node--bypassed' : '']
		.filter(Boolean)
		.join(' ');

	return (
		<div className={classes}>
			{/* Side follows the layout direction (set by useTrailGraph per LR/TB) rather than a
			    hardcoded Left/Right — otherwise TB edges loop around the node sides instead of
			    running top-to-bottom. */}
			<Handle type="target" position={targetPosition ?? Position.Left} />
			<div className="rl-graph-node__top">
				<span className={`rl-graph-pill rl-graph-pill--${waypoint.state}`} style={{ color: pill.fg, background: pill.bg }}>
					<span className="rl-graph-pill__dot" />
					{WAYPOINT_STATE_LABEL[waypoint.state]}
				</span>
				<span className="rl-graph-node__id">{waypoint.id.slice(0, 6)}</span>
			</div>
			<div className="rl-graph-node__title">{waypoint.title}</div>
			<Handle type="source" position={sourcePosition ?? Position.Right} />
		</div>
	);
});
