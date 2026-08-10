import { useQuery } from '@tanstack/react-query';
import { FIXTURE_AUDIT } from '../../fixtures/audit';
import { queryKeys } from '../queryKeys';
import type { AuditRow } from './types';

// Stage B — no general audit_log table/endpoint exists in V2 yet (see GAPS.md §3).
export function useAudit(workspaceId: string) {
	return useQuery<AuditRow[]>({
		queryKey: queryKeys.audit(workspaceId),
		queryFn: async () => FIXTURE_AUDIT.map((row) => ({ ts: row.ts, actor: row.actor, action: row.action, target: `${row.table} · ${row.row}` }))
	});
}
