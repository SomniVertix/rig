import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Info, Map } from 'lucide-react';
import { Button, IconButton, Icon } from '../../ds';
import { usePageTitle, useAppState } from '../../app/state/AppStateContext';
import { useTrails } from '../../data/trails';
import { errorMessage } from '../../api/client';
import { BoardView } from './BoardView';
import { ListView } from './ListView';
import { TrailStatusesDialog } from './TrailStatusesDialog';
import { HandoffsPanel } from './HandoffsPanel';
import './wayfinder.css';

export function TrailsPage() {
	usePageTitle('Wayfinder');
	// :workspace is always present — this route only ever mounts under /:workspace.
	const { workspace } = useParams() as { workspace: string };
	const [searchParams, setSearchParams] = useSearchParams();
	const [infoOpen, setInfoOpen] = useState(false);
	const { openSessionLauncher } = useAppState();
	const view = searchParams.get('view') === 'list' ? 'list' : 'board';

	const { data: trails, isLoading, isError, error } = useTrails(workspace);

	const setView = (next: 'board' | 'list') => {
		const params = new URLSearchParams(searchParams);
		params.set('view', next);
		setSearchParams(params);
	};

	return (
		<div>
			<div className="rl-page-header">
				<div className="rl-page-header__title">
					<h1>Wayfinder</h1>
					<IconButton icon={Info} size="sm" aria-label="Trail statuses" onClick={() => setInfoOpen(true)} />
				</div>
				<div className="rl-page-header__spacer" />
				<div className="rl-page-header__actions">
					<div className="rl-view-toggle">
						<button
							type="button"
							className={['rl-view-toggle__btn', view === 'board' ? 'rl-view-toggle__btn--active' : ''].filter(Boolean).join(' ')}
							onClick={() => setView('board')}
						>
							<Icon icon={LayoutGrid} size={13} /> Board
						</button>
						<button
							type="button"
							className={['rl-view-toggle__btn', view === 'list' ? 'rl-view-toggle__btn--active' : ''].filter(Boolean).join(' ')}
							onClick={() => setView('list')}
						>
							<Icon icon={List} size={13} /> List
						</button>
					</div>
					<Button variant="primary" onClick={openSessionLauncher}>
						New session
					</Button>
				</div>
			</div>

			{isLoading ? <p style={{ color: 'var(--text-muted)' }}>Loading trails…</p> : null}
			{isError ? <p style={{ color: 'var(--rose-500)' }}>Failed to load trails: {errorMessage(error)}</p> : null}

			{trails && trails.length === 0 ? (
				<div className="rl-card rl-card__pad" style={{ textAlign: 'center', borderStyle: 'dashed' }}>
					<Icon icon={Map} size={28} />
					<p style={{ marginTop: 12, color: 'var(--text-muted)' }}>
						No trails yet. Start one with the wayfinder skill, or create one directly.
					</p>
				</div>
			) : null}

			{/* Handoffs panel */}
			<HandoffsPanel workspaceId={workspace} />

			{trails && trails.length > 0 ? (
				view === 'board' ? (
					<BoardView trails={trails} workspaceId={workspace} />
				) : (
					<ListView trails={trails} workspaceId={workspace} />
				)
			) : null}

			<TrailStatusesDialog open={infoOpen} onClose={() => setInfoOpen(false)} />
		</div>
	);
}
