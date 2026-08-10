import type { Turn } from '../../data/sessions/types';

export function TranscriptTurns({ turns }: { turns: Turn[] }) {
	return (
		<>
			{turns.map((turn) => (
				<div className="rl-turn" key={turn.n}>
					<div className="rl-turn__q-label">Q{turn.n} · grilling</div>
					<div className="rl-turn__question">{turn.question}</div>
					<div className="rl-turn__a-label">A · you</div>
					<div className="rl-turn__answer">{turn.answer}</div>
				</div>
			))}
		</>
	);
}
