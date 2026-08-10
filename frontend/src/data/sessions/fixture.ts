import { useQuery } from '@tanstack/react-query';
import { FIXTURE_COMPLETED_SESSION } from '../../fixtures/sessions';
import { queryKeys } from '../queryKeys';
import type { Session } from './types';

// Stage B — sessions have no V2 backend at all yet (see GAPS.md §3).
export function useSessionTranscript(sessionId: string) {
	return useQuery<Session>({
		queryKey: queryKeys.session(sessionId),
		queryFn: async () => FIXTURE_COMPLETED_SESSION,
		enabled: Boolean(sessionId)
	});
}
