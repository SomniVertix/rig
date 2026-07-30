import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'info' | 'outline';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	tone?: BadgeTone;
	children?: ReactNode;
}

export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
	const classes = ['rl-badge', `rl-badge--${tone}`, className ?? ''].filter(Boolean).join(' ');
	return (
		<span className={classes} {...rest}>
			{children}
		</span>
	);
}
