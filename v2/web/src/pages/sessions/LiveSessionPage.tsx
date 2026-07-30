import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Badge, Button, StatusBadge, Textarea } from '../../ds';
import { usePageTitle } from '../../app/state/AppStateContext';
import { FIXTURE_LIVE_SESSION_SCRIPT, FIXTURE_LIVE_SESSION_UPCOMING } from '../../fixtures/sessions';
import type { Turn } from '../../data/sessions/types';
import { TranscriptTurns } from './TranscriptTurns';
import './sessions.css';

// Split-view (two independently-open sessions side by side, driven by the
// topbar's open-session tabs) needs multi-session state this single-route
// page doesn't have real second-session data to demonstrate — out of scope
// for this pass. This page renders one interactive pane for the routed
// session, matching the design's pane layout/copy exactly.
export function LiveSessionPage() {
	const { sessionId = '' } = useParams<{ sessionId: string }>();
	usePageTitle('Live session');

	const [turns, setTurns] = useState<Turn[]>(FIXTURE_LIVE_SESSION_SCRIPT.turns);
	const [upcoming, setUpcoming] = useState<string[]>(FIXTURE_LIVE_SESSION_UPCOMING);
	const [currentQuestion, setCurrentQuestion] = useState<string | null>(upcoming[0] ?? null);
	const [draft, setDraft] = useState('');
	const [agentTurnInProgress, setAgentTurnInProgress] = useState(false);
	const [finalized, setFinalized] = useState(false);

	// `upcoming` always still holds `currentQuestion` as its first element
	// until the next submit shifts it out, so this sum double-counts nothing.
	const totalQuestions = turns.length + upcoming.length;

	const submitAnswer = () => {
		if (!draft.trim() || !currentQuestion) return;
		const answered: Turn = { n: turns.length + 1, question: currentQuestion, answer: draft.trim() };
		setTurns((prev) => [...prev, answered]);
		setDraft('');
		setCurrentQuestion(null);
		setAgentTurnInProgress(true);

		const remaining = upcoming.slice(1);
		setTimeout(() => {
			setUpcoming(remaining);
			setCurrentQuestion(remaining[0] ?? null);
			setAgentTurnInProgress(false);
		}, 1400);
	};

	return (
		<div className="rl-live-cols">
			<div className="rl-session-pane">
				<div className="rl-session-pane__header">
					<span className="rl-session-pane__id">SESSION · {sessionId}</span>
					<span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>discovery</span>
					<Badge tone="accent">claude</Badge>
					<StatusBadge status="running" />
					<span className="rl-session-pane__meta">
						actor claude · project {FIXTURE_LIVE_SESSION_SCRIPT.executor} · run-id {sessionId}
					</span>
				</div>
				<div className="rl-session-pane__body">
					<TranscriptTurns turns={turns} />

					{currentQuestion && !finalized ? (
						<div className="rl-pending-turn">
							<div className="rl-turn__q-label">Q{turns.length + 1} · grilling</div>
							<div className="rl-turn__question">{currentQuestion}</div>
							<Textarea
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								placeholder="Answer in your own words — one question at a time, to a usable answer."
							/>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
								<Button variant="primary" disabled={!draft.trim()} onClick={submitAnswer}>
									Submit answer
								</Button>
								<span className="rl-eyebrow">
									{turns.length}/{totalQuestions} answered · persists to the transcript
								</span>
							</div>
						</div>
					) : null}

					{agentTurnInProgress ? (
						<div className="rl-agent-turn-progress">
							<div className="rl-agent-turn-progress__label">agent turn in progress</div>
							<div className="rl-agent-turn-progress__note">ACP session/prompt · the agent may call MCP tools before responding</div>
							<div className="rl-agent-turn-progress__bar" />
						</div>
					) : null}

					{!currentQuestion && !agentTurnInProgress && !finalized ? (
						<div style={{ marginTop: 20 }}>
							<Button variant="primary" onClick={() => setFinalized(true)}>
								Finalize → propose trailhead
							</Button>
							<p style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
								Sends a fixed instruction as the next turn — same as typing it.
							</p>
						</div>
					) : null}

					{finalized ? (
						<div className="rl-pending-turn" style={{ marginTop: 20 }}>
							<p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>
								The agent would propose a trailhead/destination here as ordinary transcript text — no backend exists in V2
								to actually run this turn (see GAPS.md §3), so this is where the simulation stops.
							</p>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
}
