import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from './Icon';

export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	icon: LucideIcon;
	size?: IconButtonSize;
	solid?: boolean;
	/** Required — an icon-only button must always have an accessible name. */
	'aria-label': string;
}

const iconSizeBySize: Record<IconButtonSize, number> = { sm: 15, md: 17, lg: 19 };

export function IconButton({ icon, size = 'md', solid = false, className, ...rest }: IconButtonProps) {
	const classes = ['rl-iconbtn', `rl-iconbtn--${size}`, solid ? 'rl-iconbtn--solid' : '', className ?? '']
		.filter(Boolean)
		.join(' ');

	return (
		<button className={classes} {...rest}>
			<Icon icon={icon} size={iconSizeBySize[size]} />
		</button>
	);
}
