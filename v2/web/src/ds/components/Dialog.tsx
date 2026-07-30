import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';

export interface DialogProps {
	open: boolean;
	onClose: () => void;
	title: string;
	children: ReactNode;
	footer?: ReactNode;
	/** Overrides the default 480px `.rl-dialog__panel` max-width for wider dialogs. */
	maxWidth?: number;
}

export function Dialog({ open, onClose, title, children, footer, maxWidth }: DialogProps) {
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKeyDown);
		panelRef.current?.focus();
		return () => document.removeEventListener('keydown', onKeyDown);
	}, [open, onClose]);

	if (!open) return null;

	return createPortal(
		<div
			className="rl-dialog__scrim"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className="rl-dialog__panel"
				style={maxWidth ? { maxWidth } : undefined}
				role="dialog"
				aria-modal="true"
				aria-labelledby="rl-dialog-title"
				ref={panelRef}
				tabIndex={-1}
			>
				<div className="rl-dialog__header">
					<div className="rl-dialog__title" id="rl-dialog-title">
						{title}
					</div>
					<IconButton icon={X} size="sm" aria-label="Close dialog" onClick={onClose} />
				</div>
				<div className="rl-dialog__body">{children}</div>
				{footer ? <div className="rl-dialog__footer">{footer}</div> : null}
			</div>
		</div>,
		document.body
	);
}
