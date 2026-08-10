import type { HTMLAttributes, ReactNode } from 'react';
import { X } from 'lucide-react';
import { Icon } from './Icon';

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
	children?: ReactNode;
	onRemove?: () => void;
}

export function Tag({ className, children, onRemove, ...rest }: TagProps) {
	return (
		<span className={['rl-tag', className ?? ''].filter(Boolean).join(' ')} {...rest}>
			{children}
			{onRemove ? (
				<span
					className="rl-tag__x"
					role="button"
					tabIndex={0}
					onClick={onRemove}
					onKeyDown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') onRemove();
					}}
				>
					<Icon icon={X} size={12} />
				</span>
			) : null}
		</span>
	);
}
