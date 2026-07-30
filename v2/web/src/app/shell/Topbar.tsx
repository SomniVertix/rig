import { Button } from '../../ds';
import { ThemeToggle } from './ThemeToggle';

export interface TopbarProps {
	title: string;
	onNewSession: () => void;
}

export function Topbar({ title, onNewSession }: TopbarProps) {
	return (
		<header className="rl-topbar">
			<div className="rl-topbar__title">{title}</div>
			<div className="rl-topbar__actions">
				<Button variant="primary" onClick={onNewSession}>
					New session
				</Button>
				{/* Static — V2 has no SSE mechanism yet (see GAPS.md §3); no pulse until it lands. */}
				<span className="rl-sse-chip">
					<span className="rl-sse-chip__dot" style={{ animation: 'none', background: 'var(--text-faint)' }} />
					no live updates
				</span>
				<ThemeToggle />
			</div>
		</header>
	);
}
