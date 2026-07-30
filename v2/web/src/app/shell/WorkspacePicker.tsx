import { useState } from 'react';
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
	const navigate = useNavigate();
	const { data: workspaces } = useWorkspaces();

	const goTo = (workspaceId: string) => {
		setOpen(false);
		navigate(`/${workspaceId}/trails`);
	};

	return (
		<div className="rl-workspace-picker">
			<button type="button" className="rl-workspace-picker__btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
				<span className="rl-workspace-picker__text">{currentWorkspaceId ?? 'Select workspace'}</span>
				{workspaceCount !== undefined ? <Badge tone="neutral">{workspaceCount}</Badge> : null}
				<Icon icon={ChevronsUpDown} size={14} />
			</button>
			{open ? (
				<div className="rl-workspace-picker__menu">
					{(workspaces ?? []).map((w) => (
						<div
							key={w.id}
							className={['rl-workspace-picker__item', w.id === currentWorkspaceId ? 'rl-workspace-picker__item--active' : '']
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
				</div>
			) : null}
		</div>
	);
}
