import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown } from 'lucide-react';
import { Badge, Icon } from '../../ds';
import { useWorkspaces } from '../../data/workspaces';

export interface WorkspacePickerProps {
	currentWorkspaceId?: string;
	workspaceCount?: number;
}

export function WorkspacePicker({ currentWorkspaceId, workspaceCount }: WorkspacePickerProps) {
	const [open, setOpen] = useState(false);
	// Menu is portaled to <body> and positioned in fixed coordinates so it
	// isn't clipped by the sidebar's `overflow: hidden` — this bites hardest
	// when the sidebar is collapsed to 64px, far narrower than the menu.
	const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
	const btnRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();
	const { data: workspaces } = useWorkspaces();

	useEffect(() => {
		if (!open) return;

		const place = () => {
			const rect = btnRef.current?.getBoundingClientRect();
			if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left });
		};
		place();

		const onPointerDown = (e: MouseEvent) => {
			const target = e.target as Node;
			if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setOpen(false);
		};

		window.addEventListener('resize', place);
		window.addEventListener('scroll', place, true);
		document.addEventListener('mousedown', onPointerDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('resize', place);
			window.removeEventListener('scroll', place, true);
			document.removeEventListener('mousedown', onPointerDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [open]);

	const goTo = (workspaceId: string) => {
		setOpen(false);
		navigate(`/${workspaceId}/trails`);
	};

	return (
		<div className="rl-workspace-picker">
			<button
				ref={btnRef}
				type="button"
				className="rl-workspace-picker__btn"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
			>
				<span className="rl-workspace-picker__text">{currentWorkspaceId ?? 'Select workspace'}</span>
				{workspaceCount !== undefined ? <Badge tone="neutral">{workspaceCount}</Badge> : null}
				<Icon icon={ChevronsUpDown} size={14} />
			</button>
			{open && menuPos
				? createPortal(
						<div
							ref={menuRef}
							className="rl-workspace-picker__menu"
							style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}
						>
							{(workspaces ?? []).map((w) => (
								<div
									key={w.id}
									className={[
										'rl-workspace-picker__item',
										w.id === currentWorkspaceId ? 'rl-workspace-picker__item--active' : ''
									]
										.filter(Boolean)
										.join(' ')}
									onClick={() => goTo(w.id)}
								>
									<span>{w.id}</span>
								</div>
							))}
							<div
								className="rl-workspace-picker__footer"
								onClick={() => {
									setOpen(false);
									navigate('/workspaces');
								}}
							>
								Open full workspaces view →
							</div>
						</div>,
						document.body
					)
				: null}
		</div>
	);
}
