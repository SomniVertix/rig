export type Status = 'draft' | 'in_review' | 'approved' | 'denied' | 'running';

export interface StatusBadgeProps {
	status: Status;
	/** Override the displayed label; defaults to the machine value (e.g. "in_review"). */
	label?: string;
	className?: string;
}

/** The five workflow states, color + dot — never emoji. Label prints the lowercase machine value by default. */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
	const classes = ['rl-status', `rl-status--${status}`, className ?? ''].filter(Boolean).join(' ');
	return (
		<span className={classes}>
			<span className="rl-status__dot" />
			<span className="rl-status__label">{label ?? status}</span>
		</span>
	);
}
