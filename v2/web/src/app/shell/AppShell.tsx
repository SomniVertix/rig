import { Outlet, useMatches, useParams } from 'react-router-dom';
import { useAppState } from '../state/AppStateContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ToastHost } from './ToastHost';
import { SessionLauncherDialog } from '../../pages/SessionLauncherDialog';
import './shell.css';

interface RouteHandle {
	mainWidth?: 'default' | 'wide' | 'xwide';
}

export function AppShell() {
	// Absent on /workspaces (no :workspace segment) — Sidebar/SessionLauncherDialog
	// both handle an unselected workspace gracefully rather than guessing one.
	const { workspace } = useParams<{ workspace: string }>();
	const { sidebarCollapsed, pageTitle, sessionLauncherOpen, openSessionLauncher, closeSessionLauncher } = useAppState();
	const matches = useMatches();
	// Deepest matched route wins — only leaf routes set a non-default width.
	const mainWidth = [...matches].reverse().map((m) => (m.handle as RouteHandle | undefined)?.mainWidth).find(Boolean) ?? 'default';

	const innerClass = [
		'rl-shell__main-inner',
		mainWidth === 'wide' ? 'rl-shell__main-inner--wide' : '',
		mainWidth === 'xwide' ? 'rl-shell__main-inner--xwide' : ''
	]
		.filter(Boolean)
		.join(' ');

	return (
		<div className={['rl-shell', sidebarCollapsed ? 'rl-shell--collapsed' : ''].filter(Boolean).join(' ')}>
			<Sidebar workspaceId={workspace} />
			<Topbar title={pageTitle} onNewSession={openSessionLauncher} />
			<main className="rl-shell__main">
				<div className={innerClass}>
					<Outlet />
				</div>
			</main>
			<ToastHost />
			<SessionLauncherDialog open={sessionLauncherOpen} onClose={closeSessionLauncher} defaultWorkspaceId={workspace} />
		</div>
	);
}
