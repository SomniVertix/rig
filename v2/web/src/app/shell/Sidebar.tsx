import { NavLink } from 'react-router-dom';
import { Map, FileText, Play, ScrollText, PanelLeftClose } from 'lucide-react';
import { Icon } from '../../ds';
import { useAppState } from '../state/AppStateContext';
import { useTrails } from '../../data/trails';
import { useSpecs } from '../../data/specs';
import { WorkspacePicker } from './WorkspacePicker';

export interface SidebarProps {
	workspaceId?: string;
}

interface NavItem {
	to: string;
	label: string;
	icon: typeof Map;
	count?: number;
}

export function Sidebar({ workspaceId }: SidebarProps) {
	const { sidebarCollapsed, setSidebarCollapsed } = useAppState();
	// Real counts (Stage A). Runs/Audit have no V2 backend at all yet (see
	// GAPS.md §3) — their nav items just show no count, same as before,
	// rather than mixing in a fixture-derived number that would look just
	// as "live" as the real ones next to it.
	const { data: trails } = useTrails(workspaceId);
	const { data: specs } = useSpecs(workspaceId);

	// No workspace selected (e.g. on /workspaces) — nav items have nowhere
	// workspace-scoped to point yet, so they stay put on the overview.
	const scoped = (path: string) => (workspaceId ? `/${workspaceId}/${path}` : '/workspaces');

	const groups: { label: string; items: NavItem[] }[] = [
		{
			label: 'Discovery',
			items: [{ to: scoped('trails'), label: 'Wayfinder', icon: Map, count: trails?.length }]
		},
		{
			label: 'Deployment',
			items: [
				{ to: scoped('specs'), label: 'Specifications', icon: FileText, count: specs?.length },
				{ to: scoped('runs'), label: 'Runs', icon: Play }
			]
		},
		{
			label: 'Administration',
			items: [{ to: scoped('audit'), label: 'Audit log', icon: ScrollText }]
		}
	];

	return (
		<aside className="rl-sidebar">
			<div className="rl-sidebar__wordmark">
				<span className="rl-sidebar__dot" />
				<span className="rl-sidebar__wordmark-text">rig</span>
				<span className="rl-sidebar__version">v0.4</span>
			</div>

			<WorkspacePicker currentWorkspaceId={workspaceId} workspaceCount={specs?.length} />

			<nav className="rl-nav">
				{groups.map((group) => (
					<div className="rl-nav__group" key={group.label}>
						<div className="rl-nav__group-label">{group.label}</div>
						{group.items.map((item) => (
							<NavLink
								// Keyed by label, not `to`: when no workspace is selected every
								// item's `to` falls back to the same '/workspaces' href, so
								// keying on `to` gave sibling items duplicate React keys —
								// harmless on a fresh mount, but a real bug on the live
								// transition into a workspace, where React has to reconcile
								// "two children sharing one key" into distinct hrefs and can
								// leave a stray duplicated DOM node behind.
								key={item.label}
								to={item.to}
								// isActive alone isn't enough: with no workspace selected every
								// item falls back to the same '/workspaces' href, and NavLink
								// would mark all of them active against that one location.
								className={({ isActive }) =>
									['rl-nav__item', isActive && workspaceId ? 'rl-nav__item--active' : ''].filter(Boolean).join(' ')
								}
							>
								<Icon icon={item.icon} size={17} />
								<span className="rl-nav__label">{item.label}</span>
								{item.count !== undefined ? <span className="rl-nav__count">{item.count}</span> : null}
							</NavLink>
						))}
					</div>
				))}
			</nav>

			<div className="rl-sidebar__footer">
				{/* Static — V2 has no /api/health endpoint yet, so this isn't a live check. */}
				<div className="rl-sidebar__footer-text">
					<span className="rl-sidebar__status-dot" />
					daemon · :8789 · neo4j
				</div>
				<button type="button" className="rl-sidebar__collapse" onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
					<Icon icon={PanelLeftClose} size={15} />
					<span className="rl-sidebar__collapse-label">Collapse</span>
					<span className="rl-sidebar__collapse-kbd">⌘B</span>
				</button>
			</div>
		</aside>
	);
}
