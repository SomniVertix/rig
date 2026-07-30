import type { ReactNode } from 'react';
import { CheckCircle2, XCircle, Info } from 'lucide-react';
import { Icon } from './Icon';

export type ToastTone = 'success' | 'danger' | 'info';

export interface ToastProps {
	tone?: ToastTone;
	title: string;
	message?: ReactNode;
}

const iconByTone: Record<ToastTone, typeof CheckCircle2> = {
	success: CheckCircle2,
	danger: XCircle,
	info: Info
};

export function Toast({ tone = 'info', title, message }: ToastProps) {
	return (
		<div className={['rl-toast', `rl-toast--${tone}`].join(' ')} role="status">
			<span className="rl-toast__icon">
				<Icon icon={iconByTone[tone]} size={16} />
			</span>
			<div>
				<div className="rl-toast__title">{title}</div>
				{message ? <div className="rl-toast__msg">{message}</div> : null}
			</div>
		</div>
	);
}
