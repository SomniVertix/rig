import { useEffect } from 'react';
import { Outlet, createBrowserRouter } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

import { subscribeToSpecEvents } from './api/events';
import { SpecsList } from './routes/SpecsList';
import { SpecDetail } from './routes/SpecDetail';

/**
 * App (web-spa; Requirements Story 8 AC1, Story 4 AC3; Design "SPA structure +
 * data-fetch/invalidation contract (web-spa) (module)" -- "A single app-level SSE
 * subscription"): the router's root layout. Rendered once by `router` below and never
 * remounted as the user navigates -- switching between `/` and `/specs/:specId` only
 * swaps the `<Outlet />` content -- so the `useEffect` here opens exactly one
 * `EventSource` (via `subscribeToSpecEvents`) for the lifetime of the page, regardless
 * of which route is active.
 */
function App() {
	const queryClient = useQueryClient();

	useEffect(() => {
		const unsubscribe = subscribeToSpecEvents(queryClient);
		return unsubscribe;
	}, [queryClient]);

	return <Outlet />;
}

/**
 * Top-level router (Story 1 AC1 `/`, Story 2 AC1 `/specs/:specId`). Both screens nest
 * under `App` so it stays mounted across route changes. Built with
 * `createBrowserRouter` -- real paths, not a hash router -- so a hard refresh on any
 * nested route relies on `rest-bff-api`'s static fallback to re-serve `index.html` and
 * let this router resolve the path client-side.
 */
export const router = createBrowserRouter([
	{
		path: '/',
		element: <App />,
		children: [
			{ index: true, element: <SpecsList /> },
			{ path: 'specs/:specId', element: <SpecDetail /> }
		]
	}
]);

export default App;
