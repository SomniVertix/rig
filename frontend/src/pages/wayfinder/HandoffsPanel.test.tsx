import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { HandoffsPanel } from './HandoffsPanel';
import * as api from '../../api/client';
import type { HandoffDTO } from '../../api/types';

// Mock the API client
vi.mock('../../api/client', () => ({
	listHandoffs: vi.fn(),
	getHandoff: vi.fn(),
	getHandoffConversation: vi.fn()
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
	vi.clearAllMocks();
});

const mockHandoff: HandoffDTO = {
	id: 'h1',
	sourceWorkspaceId: 'ws-source',
	targetWorkspaceId: 'ws-target',
	title: 'Test Handoff',
	type: 'bug',
	status: 'pending',
	hasConversation: false,
	sentBy: 'alice',
	sentAt: '2026-08-07T12:00:00Z',
	createdAt: '2026-08-07T11:00:00Z',
	updatedAt: '2026-08-07T12:00:00Z'
};

describe('HandoffsPanel', () => {
	beforeEach(() => {
		queryClient.clear();
	});

	it('renders empty state when no handoffs', async () => {
		vi.mocked(api.listHandoffs).mockResolvedValue({ handoffs: [] });

		render(
			<QueryClientProvider client={queryClient}>
				<HandoffsPanel workspaceId="ws-test" />
			</QueryClientProvider>
		);

		expect(await screen.findByText(/No open handoffs/)).toBeInTheDocument();
	});

	it('renders handoff row with correct columns', async () => {
		vi.mocked(api.listHandoffs).mockImplementation((_workspaceId, direction) =>
			Promise.resolve({ handoffs: direction === 'inbound' ? [mockHandoff] : [] })
		);

		render(
			<QueryClientProvider client={queryClient}>
				<HandoffsPanel workspaceId="ws-target" />
			</QueryClientProvider>
		);

		expect(await screen.findByText('Test Handoff')).toBeInTheDocument();
		expect(screen.getByText('bug')).toBeInTheDocument();
	});

	it('opens detail dialog on row click', async () => {
		vi.mocked(api.listHandoffs).mockImplementation((_workspaceId, direction) =>
			Promise.resolve({ handoffs: direction === 'inbound' ? [mockHandoff] : [] })
		);

		vi.mocked(api.getHandoff).mockResolvedValue(mockHandoff);

		render(
			<QueryClientProvider client={queryClient}>
				<HandoffsPanel workspaceId="ws-target" />
			</QueryClientProvider>
		);

		const row = await screen.findByText('Test Handoff');
		fireEvent.click(row);

		// The dialog should be open and fetching the handoff detail
		expect(api.getHandoff).toHaveBeenCalledWith('h1');
	});

	it('verifies no mutation controls present', async () => {
		vi.mocked(api.listHandoffs).mockImplementation((_workspaceId, direction) =>
			Promise.resolve({ handoffs: direction === 'inbound' ? [mockHandoff] : [] })
		);

		const { container } = render(
			<QueryClientProvider client={queryClient}>
				<HandoffsPanel workspaceId="ws-target" />
			</QueryClientProvider>
		);

		// Verify no send/dismiss/action buttons anywhere
		const sendButton = container.querySelector('button[aria-label*="send"]');
		const dismissButton = container.querySelector('button[aria-label*="dismiss"]');
		const actionButton = container.querySelector('button[aria-label*="action"]');

		expect(sendButton).not.toBeInTheDocument();
		expect(dismissButton).not.toBeInTheDocument();
		expect(actionButton).not.toBeInTheDocument();
	});
});
