import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown } from 'lucide-react';
import { Badge, Icon } from '../../ds';
import { useWorkspaces } from '../../data/workspaces';

export interface ProjectPickerProps {
	currentProjectId?: string;
	projectCount?: number;
}

export function ProjectPicker({ currentProjectId, projectCount }: ProjectPickerProps) {
	const [open, setOpen] = useState(false);
	const navigate = useNavigate();
	const { data: projects } = useWorkspaces();

	const goTo = (projectId: string) => {
		setOpen(false);
		navigate(`/${projectId}/trails`);
	};

	return (
		<div className="rl-project-picker">
			<button type="button" className="rl-project-picker__btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
				<span className="rl-project-picker__text">{currentProjectId ?? 'Select project'}</span>
				{projectCount !== undefined ? <Badge tone="neutral">{projectCount}</Badge> : null}
				<Icon icon={ChevronsUpDown} size={14} />
			</button>
			{open ? (
				<div className="rl-project-picker__menu">
					{(projects ?? []).map((p) => (
						<div
							key={p.id}
							className={['rl-project-picker__item', p.id === currentProjectId ? 'rl-project-picker__item--active' : '']
								.filter(Boolean)
								.join(' ')}
							onClick={() => goTo(p.id)}
						>
							<span>{p.id}</span>
						</div>
					))}
					<div
						className="rl-project-picker__footer"
						onClick={() => {
							setOpen(false);
							navigate('/projects');
						}}
					>
						Open full projects view →
					</div>
				</div>
			) : null}
		</div>
	);
}
