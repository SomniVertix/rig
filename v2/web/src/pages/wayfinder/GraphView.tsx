import { useMemo } from 'react';
import type { Waypoint } from '../../data/trails/types';
import { WAYPOINT_STATE_LABEL, WaypointStateDot } from './shared';
import { computeGraphLayout, GRAPH_NODE_WIDTH, GRAPH_NODE_HEIGHT } from './graphLayout';

const EDGE_COLOR: Record<string, string> = {
	sighted: 'var(--text-faint)',
	marked: 'var(--text-muted)',
	claimed: 'var(--amber-500)',
	reached: 'var(--emerald-500)',
	bypassed: 'var(--rose-500)'
};

export interface GraphViewProps {
	waypoints: Waypoint[];
	selectedId?: string;
	onSelect: (id: string) => void;
}

export function GraphView({ waypoints, selectedId, onSelect }: GraphViewProps) {
	const { nodes, edges, width, height } = useMemo(() => computeGraphLayout(waypoints), [waypoints]);
	const byId = useMemo(() => new Map(nodes.map((n) => [n.waypoint.id, n])), [nodes]);

	return (
		<div
			style={{
				position: 'relative',
				width: '100%',
				overflow: 'auto',
				minHeight: 320,
				borderRadius: 'var(--radius-md)',
				border: '1px solid var(--border-subtle)',
				backgroundImage: 'radial-gradient(var(--border-subtle) 1px, transparent 1px)',
				backgroundSize: '18px 18px'
			}}
		>
			<div style={{ position: 'relative', width: width + 40, height: height + 40, padding: 20 }}>
				<svg
					width={width}
					height={height}
					style={{ position: 'absolute', top: 20, left: 20, pointerEvents: 'none', overflow: 'visible' }}
				>
					{edges.map((edge) => {
						const from = byId.get(edge.fromId);
						const to = byId.get(edge.toId);
						if (!from || !to) return null;
						const x1 = from.x + GRAPH_NODE_WIDTH;
						const y1 = from.y + GRAPH_NODE_HEIGHT / 2;
						const x2 = to.x;
						const y2 = to.y + GRAPH_NODE_HEIGHT / 2;
						const midX = (x1 + x2) / 2;
						return (
							<path
								key={`${edge.fromId}-${edge.toId}`}
								d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
								fill="none"
								stroke={EDGE_COLOR[from.waypoint.state]}
								strokeWidth={1.5}
								strokeDasharray={edge.pending ? '4 3' : undefined}
							/>
						);
					})}
				</svg>
				{nodes.map((node) => {
					const selected = node.waypoint.id === selectedId;
					return (
						<div
							key={node.waypoint.id}
							onClick={() => onSelect(node.waypoint.id)}
							style={{
								position: 'absolute',
								left: node.x,
								top: node.y,
								width: GRAPH_NODE_WIDTH,
								minHeight: GRAPH_NODE_HEIGHT,
								background: 'var(--bg-surface)',
								border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-default)'}`,
								borderRadius: 'var(--radius-sm)',
								padding: 10,
								cursor: 'pointer'
							}}
						>
							<div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
								<WaypointStateDot state={node.waypoint.state} />
								<span
									style={{
										fontFamily: 'var(--font-mono)',
										fontSize: 10,
										textTransform: 'uppercase',
										letterSpacing: 'var(--tracking-caps)',
										color: 'var(--text-faint)'
									}}
								>
									{WAYPOINT_STATE_LABEL[node.waypoint.state]} · {node.waypoint.id.slice(0, 6)}
								</span>
							</div>
							<div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-strong)' }}>{node.waypoint.title}</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
