import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from '../data/queryClient';
import { AppStateProvider } from './state/AppStateContext';
import { router } from './router';

export function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<AppStateProvider>
				<RouterProvider router={router} />
			</AppStateProvider>
		</QueryClientProvider>
	);
}
