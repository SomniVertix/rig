import type { HandoffType, HandoffStatus } from '../../api/types';

/**
 * UI-facing Handoff summary type, derived from the REST API's HandoffDTO.
 * Used for list rendering in the Handoffs panel.
 */
export interface HandoffSummary {
	id: string;
	title: string;
	type: HandoffType;
	status: HandoffStatus;
	direction: 'inbound' | 'outbound';
	counterpartyId: string;
	counterpartyName: string;
	sentAt: string;
}
