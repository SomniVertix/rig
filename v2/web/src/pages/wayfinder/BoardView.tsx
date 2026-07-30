import { useNavigate } from 'react-router-dom';
import type { TrailSummary, TrailStatus } from '../../data/trails/types';
import { TRAIL_STATUS_LABEL } from './shared';

// 'grilling' — the design's 4th board column — depends on session/discovery
// data that has no V2 backend yet (see GAPS.md §3); it would sit permanently
// empty. Swapped for 'abandoned', a real V2 expedition state the original
// 4-status design predates.
const COLUMNS: TrailStatus[] = ['active', 'settled', 'chartered', 'abandoned'];

export interface BoardViewProps {
	trails: TrailSummary[];
	projectId: string;
}

export function BoardView({ trails, projectId }: BoardViewProps) {
	const navigate = useNavigate();
	const byStatus = (status: TrailStatus) => trails.filter((t) => t.status === status);

	return (
		<div className="rl-board">
			{COLUMNS.map((status) => {
				const items = byStatus(status);
				return (
					<div className="rl-board__col" key={status}>
						<div className="rl-board__col-header">
							{TRAIL_STATUS_LABEL[status]} · {items.length}
						</div>
						{items.length === 0 ? (
							<div className="rl-board__empty">empty</div>
						) : (
							// No per-card status badge: the column already carries status,
							// and TrailStatus has no StatusBadge token mapping (that
							// component is scoped to the five spec-pipeline statuses).
							items.map((trail) => (
								<div key={trail.id} className="rl-board__card" onClick={() => navigate(`/${projectId}/trails/${trail.id}`)}>
									<div className="rl-board__card-title">
										<span>{trail.name}</span>
									</div>
									<div className="rl-board__card-subtitle">{trail.trailheadPrompt}</div>
									<div className="rl-board__card-footer">updated {trail.updatedAt}</div>
								</div>
							))
						)}
					</div>
				);
			})}
		</div>
	);
}
