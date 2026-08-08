import { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Card, Icon, RelativeTime, Tag } from '../../ds';
import { useHandoffs } from '../../data/handoffs';
import { HandoffDetailDialog } from './HandoffDetailDialog';
import type { HandoffType, HandoffStatus } from '../../api/types';

export interface HandoffsPanelProps {
	workspaceId: string;
}

export function HandoffsPanel({ workspaceId }: HandoffsPanelProps) {
	const { data: handoffs = [], isLoading } = useHandoffs(workspaceId);
	const [selectedHandoffId, setSelectedHandoffId] = useState<string | undefined>();
	const [detailOpen, setDetailOpen] = useState(false);

	const handleRowClick = (id: string) => {
		setSelectedHandoffId(id);
		setDetailOpen(true);
	};

	const handleDetailClose = () => {
		setDetailOpen(false);
	};

	if (isLoading) {
		return (
			<Card className="handoffs-panel">
				<div className="handoffs-panel__loading">Loading handoffs…</div>
			</Card>
		);
	}

	if (handoffs.length === 0) {
		return (
			<Card className="handoffs-panel handoffs-panel--empty">
				<div className="handoffs-panel__empty-state" style={{ borderStyle: 'dashed', padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
					No open handoffs for this workspace.
				</div>
			</Card>
		);
	}

	return (
		<>
			<Card className="handoffs-panel">
				<div className="handoffs-panel__header">
					<h3>Handoffs</h3>
				</div>
				<table className="handoffs-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
					<thead>
						<tr>
							<th className="handoffs-table__direction" style={{ textAlign: 'left', paddingBottom: '0.75rem' }}>Direction</th>
							<th className="handoffs-table__counterparty" style={{ textAlign: 'left', paddingBottom: '0.75rem' }}>Counterparty</th>
							<th className="handoffs-table__title" style={{ textAlign: 'left', paddingBottom: '0.75rem' }}>Title</th>
							<th className="handoffs-table__type" style={{ textAlign: 'left', paddingBottom: '0.75rem' }}>Type</th>
							<th className="handoffs-table__status" style={{ textAlign: 'left', paddingBottom: '0.75rem' }}>Status</th>
							<th className="handoffs-table__sent" style={{ textAlign: 'left', paddingBottom: '0.75rem' }}>Sent</th>
						</tr>
					</thead>
					<tbody>
						{handoffs.map((handoff) => (
							<tr
								key={handoff.id}
								className="handoffs-table__row"
								onClick={() => handleRowClick(handoff.id)}
								style={{ cursor: 'pointer', borderBottomStyle: 'solid', borderBottomColor: 'var(--border-muted)', borderBottomWidth: '1px', paddingTop: '0.5rem', paddingBottom: '0.5rem' }}
								onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-secondary)')}
								onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
							>
								<td className="handoffs-table__direction" style={{ paddingRight: '1rem' }}>
									<span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
										{handoff.direction === 'inbound' ? (
											<Icon icon={ArrowDown} size={14} />
										) : (
											<Icon icon={ArrowUp} size={14} />
										)}
										<span>{handoff.direction === 'inbound' ? 'Inbound' : 'Outbound'}</span>
									</span>
								</td>
								<td className="handoffs-table__counterparty" style={{ paddingRight: '1rem' }}>{handoff.counterpartyName}</td>
								<td className="handoffs-table__title" style={{ paddingRight: '1rem' }}>
									<strong>{handoff.title}</strong>
								</td>
								<td className="handoffs-table__type" style={{ paddingRight: '1rem' }}>
									<Tag className={`tag--${getTypeVariant(handoff.type)}`}>{handoff.type}</Tag>
								</td>
								<td className="handoffs-table__status" style={{ paddingRight: '1rem' }}>
									<StatusBadge status={handoff.status} />
								</td>
								<td className="handoffs-table__sent" style={{ paddingRight: '1rem' }}>
									<RelativeTime value={handoff.sentAt} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</Card>

			{selectedHandoffId && (
				<HandoffDetailDialog handoffId={selectedHandoffId} isOpen={detailOpen} onClose={handleDetailClose} />
			)}
		</>
	);
}

/**
 * Map handoff type to CSS class name for color coding.
 */
function getTypeVariant(type: HandoffType): string {
	switch (type) {
		case 'bug':
			return 'error';
		case 'question':
			return 'info';
		case 'fyi':
			return 'neutral';
		case 'dependency-change':
			return 'warning';
		default:
			return 'neutral';
	}
}

/**
 * Simple status badge component for handoff status.
 */
function StatusBadge({ status }: { status: HandoffStatus }) {
	const className = `status-badge status-badge--${status}`;
	const label = status.charAt(0).toUpperCase() + status.slice(1);

	return <span className={className}>{label}</span>;
}
