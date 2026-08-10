import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './shell/AppShell';
import { Gallery } from '../gallery/Gallery';
import { WorkspacesOverview } from '../pages/WorkspacesOverview';
import { SpecsListPage } from '../pages/specs/SpecsListPage';
import { SpecDetailPage } from '../pages/specs/SpecDetailPage';
import { TrailsPage } from '../pages/wayfinder/TrailsPage';
import { TrailDetailPage } from '../pages/wayfinder/TrailDetailPage';
import { SessionTranscriptPage } from '../pages/sessions/SessionTranscriptPage';
import { LiveSessionPage } from '../pages/sessions/LiveSessionPage';
import { AuditLog } from '../pages/AuditLog';
import { Runs } from '../pages/Runs';

export const router = createBrowserRouter([
	// No default workspace to guess at anymore — GET /workspaces is the real
	// source of which workspaces exist, so "/" lands on the overview that
	// lists them instead of assuming one.
	{ path: '/', element: <Navigate to="/workspaces" replace /> },
	{ path: '/_gallery', element: <Gallery /> },
	{
		// Workspaces overview isn't scoped to one workspace — it's the picker
		// across all of them — but still renders inside the app shell like
		// every other screen; AppShell already defaults gracefully when
		// `:workspace` is absent from the URL.
		path: '/workspaces',
		element: <AppShell />,
		children: [{ index: true, element: <WorkspacesOverview /> }]
	},
	{
		path: '/:workspace',
		element: <AppShell />,
		children: [
			{ path: 'specs', element: <SpecsListPage /> },
			{ path: 'specs/:specId', element: <SpecDetailPage /> },
			{ path: 'trails', element: <TrailsPage /> },
			{ path: 'trails/:trailId', element: <TrailDetailPage />, /* trail detail is capped 1180px per the handoff */ handle: { mainWidth: 'wide' } },
			{ path: 'sessions/:sessionId', element: <SessionTranscriptPage /> },
			{ path: 'sessions/:sessionId/live', element: <LiveSessionPage />, handle: { mainWidth: 'xwide' } },
			{ path: 'audit', element: <AuditLog /> },
			{ path: 'runs', element: <Runs /> }
		]
	}
]);
