import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	size?: ButtonSize;
	block?: boolean;
	icon?: LucideIcon;
	children?: ReactNode;
}

export function Button({
	variant = 'secondary',
	size = 'md',
	block = false,
	icon,
	className,
	children,
	...rest
}: ButtonProps) {
	const classes = [
		'rl-btn',
		`rl-btn--${variant}`,
		`rl-btn--${size}`,
		block ? 'rl-btn--block' : '',
		className ?? ''
	]
		.filter(Boolean)
		.join(' ');

	return (
		<button className={classes} {...rest}>
			{icon ? <Icon icon={icon} size={size === 'sm' ? 14 : 16} /> : null}
			{children}
		</button>
	);
}
