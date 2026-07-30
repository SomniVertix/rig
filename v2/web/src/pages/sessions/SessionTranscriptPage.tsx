import { Link, useParams } from 'react-router-dom';
import { StatusBadge } from '../../ds';
import { usePageTitle } from '../../app/state/AppStateContext';
import { useSessionTranscript } from '../../data/sessions';
import { TranscriptTurns } from './TranscriptTurns';
import './sessions.css';

export function SessionTranscriptPage() {
	// :workspace is always present — this route only ever mounts under /:workspace.
	const { workspace, sessionId = '' } = useParams() as { workspace: string; sessionId?: string };
	const { data: session, isLoading } = useSessionTranscript(sessionId);
	usePageTitle('Session transcript');

	if (isLoading || !session) return <p style={{ color: 'var(--text-muted)' }}>Loading…</p>;

	return (
		<div>
			{session.trailId ? (
				<Link to={`/${workspace}/trails/${session.trailId}`} className="rl-breadcrumb">
					← trail {session.trailId}
				</Link>
			) : null}
			<div className="rl-eyebrow" style={{ marginTop: 8 }}>
				GRILLING · {session.id}
			</div>
			<div className="rl-page-header" style={{ marginBottom: 4 }}>
				<h1>Session transcript</h1>
				<StatusBadge status="approved" label="completed" />
			</div>

			<div className="rl-detail-grid">
				<div className="rl-card rl-card__pad">
					<TranscriptTurns turns={session.turns} />
					<div
						style={{
							marginTop: 20,
							paddingTop: 12,
							borderTop: '1px solid var(--border-subtle)',
							fontFamily: 'var(--font-mono)',
							fontSize: 11,
							color: 'var(--text-faint)'
						}}
					>
						session finalized → trailhead prompt
					</div>
				</div>
				<div className="rl-detail-grid__rail">
					<div className="rl-card rl-card__pad rl-kv-card">
						<div className="rl-kv-card__row">
							<span className="rl-kv-card__label">Session</span>
							<span>{session.id}</span>
						</div>
						<div className="rl-kv-card__row">
							<span className="rl-kv-card__label">Started</span>
							<span>{session.startedAt}</span>
						</div>
						<div className="rl-kv-card__row">
							<span className="rl-kv-card__label">Turns</span>
							<span>{session.turns.length}</span>
						</div>
						<div className="rl-kv-card__row">
							<span className="rl-kv-card__label">Stage</span>
							<span>grilling</span>
						</div>
					</div>
					{session.trailId || session.outcomeSpecId ? (
						<div className="rl-card rl-card__pad">
							<div className="rl-eyebrow" style={{ marginBottom: 8 }}>
								Fed into
							</div>
							{session.trailId ? (
								<div style={{ marginBottom: 6 }}>
									<Link to={`/${workspace}/trails/${session.trailId}`}>Trail: {session.trailId} →</Link>
								</div>
							) : null}
							{session.outcomeSpecId ? <Link to={`/${workspace}/specs/${session.outcomeSpecId}`}>Outcome spec →</Link> : null}
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
