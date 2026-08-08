import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import * as api from '../../api/client';
import type { HandoffDTO, HandoffConversationDTO, HandoffTurnDTO } from '../../api/types';
import { queryKeys } from '../queryKeys';
import type { HandoffSummary } from './types';

/**
 * Fetch all handoffs for a workspace (both inbound and outbound, pending and read only).
 * Maps HandoffDTO → HandoffSummary for list rendering.
 */
export function useHandoffs(workspaceId: string | undefined): UseQueryResult<HandoffSummary[]> {
	return useQuery({
		queryKey: queryKeys.handoffs(workspaceId ?? ''),
		queryFn: async () => {
			if (!workspaceId) return [];

			// Fetch both directions in parallel
			const [inboundResponse, outboundResponse] = await Promise.all([
				api.listHandoffs(workspaceId, 'inbound'),
				api.listHandoffs(workspaceId, 'outbound')
			]);

			const allHandoffs = [
				...inboundResponse.handoffs.map((h) => ({
					...h,
					_direction: 'inbound' as const
				})),
				...outboundResponse.handoffs.map((h) => ({
					...h,
					_direction: 'outbound' as const
				}))
			];

			// Filter to pending + read only, map to summary, sort by sentAt DESC
			return allHandoffs
				.filter((h) => h.status === 'pending' || h.status === 'read')
				.map((h) => mapToSummary(h, h._direction))
				.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
		},
		enabled: Boolean(workspaceId)
	});
}

/**
 * Fetch a single handoff with full details (body + attachments).
 */
export function useHandoff(id: string | undefined): UseQueryResult<HandoffDTO> {
	return useQuery({
		queryKey: queryKeys.handoff(id ?? ''),
		queryFn: () => api.getHandoff(id!),
		enabled: Boolean(id)
	});
}

/**
 * Fetch a handoff's conversation (if one exists) with ordered turns.
 */
export function useHandoffConversation(
	id: string | undefined
): UseQueryResult<{ conversation: HandoffConversationDTO; turns: HandoffTurnDTO[] }> {
	return useQuery({
		queryKey: queryKeys.handoffConversation(id ?? ''),
		queryFn: () => api.getHandoffConversation(id!),
		enabled: Boolean(id)
	});
}

/**
 * Map a HandoffDTO to HandoffSummary for UI rendering.
 */
function mapToSummary(dto: HandoffDTO, direction: 'inbound' | 'outbound'): HandoffSummary {
	const counterpartyId = direction === 'inbound' ? dto.sourceWorkspaceId : dto.targetWorkspaceId;
	// Note: In a real app, we'd resolve workspace IDs to names via a workspace lookup.
	// For now, use the ID as the name placeholder.
	return {
		id: dto.id,
		title: dto.title,
		type: dto.type,
		status: dto.status,
		direction,
		counterpartyId,
		counterpartyName: counterpartyId, // TODO: resolve workspace ID to friendly name
		sentAt: dto.sentAt
	};
}
