import type { ReactNode } from 'react';

export interface TooltipProps {
	label: string;
	children: ReactNode;
	className?: string;
}

/** Pure-CSS hover bubble (opacity transition on `--dur-fast`, no JS delay) —
 * use in place of a native `title` attribute, which browsers gate behind a
 * ~1s hover delay. */
export function Tooltip({ label, children, className }: TooltipProps) {
	return (
		<span className={['rl-tooltip', className ?? ''].filter(Boolean).join(' ')}>
			{children}
			<span className="rl-tooltip__bubble">{label}</span>
		</span>
	);
}
