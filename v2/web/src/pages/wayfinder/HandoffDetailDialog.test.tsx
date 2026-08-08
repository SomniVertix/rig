import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { HandoffDetailDialog } from './HandoffDetailDialog';
import * as api from '../../api/client';
import type { HandoffDTO, HandoffConversationDTO, HandoffTurnDTO } from '../../api/types';

// Mock the API client
vi.mock('../../api/client', () => ({
	getHandoff: vi.fn(),
	getHandoffConversation: vi.fn()
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const mockHandoff: HandoffDTO = {
	id: 'h1',
	sourceWorkspaceId: 'ws-source',
	targetWorkspaceId: 'ws-target',
	title: 'Test Handoff',
	body: '# This is a test\n\nWith some content',
	type: 'bug',
	status: 'read',
	sentBy: 'alice',
	sentAt: '2026-08-07T12:00:00Z',
	createdAt: '2026-08-07T12:00:00Z',
	updatedAt: '2026-08-07T12:00:00Z',
	attachments: [
		{
			id: 'a1',
			ordinal: 1,
			repoPath: 'src/main.ts',
			commitSha: 'abc123def456',
			note: 'Main entry point'
		}
	]
};

const mockConversation: HandoffConversationDTO = {
	id: 'conv1',
	handoffId: 'h1',
	status: 'closed_agreed',
	turnCap: '15',
	draftedAction: 'action',
	draftedResolutionNote: 'Agreed to fix the bug',
	arbiterSessionId: 'session-1',
	createdAt: '2026-08-07T12:00:00Z',
	updatedAt: '2026-08-07T12:00:00Z'
};

const mockTurns: HandoffTurnDTO[] = [
	{
		id: 't1',
		conversationId: 'conv1',
		turnNumber: 1,
		speaker: 'source',
		content: 'Found a critical bug',
		verdict: 'action',
		createdAt: '2026-08-07T12:01:00Z'
	},
	{
		id: 't2',
		conversationId: 'conv1',
		turnNumber: 2,
		speaker: 'target',
		content: 'Agree, will fix immediately',
		verdict: 'action',
		createdAt: '2026-08-07T12:02:00Z'
	}
];

describe('HandoffDetailDialog', () => {
	beforeEach(() => {
		queryClient.clear();
	});

	it('renders loading state initially', () => {
		vi.mocked(api.getHandoff).mockImplementation(() => new Promise(() => {})); // Never resolves

		render(
			<QueryClientProvider client={queryClient}>
				<HandoffDetailDialog handoffId="h1" isOpen={true} onClose={() => {}} />
			</QueryClientProvider>
		);

		expect(screen.getByText(/Loading handoff/)).toBeInTheDocument();
	});

	it('renders error state on fetch failure', async () => {
		vi.mocked(api.getHandoff).mockRejectedValue(new Error('Network error'));

		render(
			<QueryClientProvider client={queryClient}>
				<HandoffDetailDialog handoffId="h1" isOpen={true} onClose={() => {}} />
			</QueryClientProvider>
		);

		await waitFor(() => {
			expect(screen.getByText(/Unable to load handoff/)).toBeInTheDocument();
		});
	});

	it('renders body markdown', async () => {
		vi.mocked(api.getHandoff).mockResolvedValue(mockHandoff);
		vi.mocked(api.getHandoffConversation).mockResolvedValue({ conversation: mockConversation, turns: [] });

		render(
			<QueryClientProvider client={queryClient}>
				<HandoffDetailDialog handoffId="h1" isOpen={true} onClose={() => {}} />
			</QueryClientProvider>
		);

		await waitFor(() => {
			expect(screen.getByText(/This is a test/)).toBeInTheDocument();
		});
	});

	it('renders attachments section', async () => {
		vi.mocked(api.getHandoff).mockResolvedValue(mockHandoff);
		vi.mocked(api.getHandoffConversation).mockResolvedValue({ conversation: mockConversation, turns: [] });

		render(
			<QueryClientProvider client={queryClient}>
				<HandoffDetailDialog handoffId="h1" isOpen={true} onClose={() => {}} />
			</QueryClientProvider>
		);

		await waitFor(() => {
			expect(screen.getByText(/Attachments/)).toBeInTheDocument();
			expect(screen.getByText(/src\/main\.ts/)).toBeInTheDocument();
			expect(screen.getByText(/Main entry point/)).toBeInTheDocument();
		});
	});

	it('renders conversation transcript when present', async () => {
		vi.mocked(api.getHandoff).mockResolvedValue(mockHandoff);
		vi.mocked(api.getHandoffConversation).mockResolvedValue({
			conversation: mockConversation,
			turns: mockTurns
		});

		render(
			<QueryClientProvider client={queryClient}>
				<HandoffDetailDialog handoffId="h1" isOpen={true} onClose={() => {}} />
			</QueryClientProvider>
		);

		await waitFor(() => {
			expect(screen.getByText(/Conversation Transcript/)).toBeInTheDocument();
			expect(screen.getByText(/Found a critical bug/)).toBeInTheDocument();
			expect(screen.getByText(/Agree, will fix immediately/)).toBeInTheDocument();
		});
	});

	it('shows verdicts when present in turns', async () => {
		vi.mocked(api.getHandoff).mockResolvedValue(mockHandoff);
		vi.mocked(api.getHandoffConversation).mockResolvedValue({
			conversation: mockConversation,
			turns: mockTurns
		});

		render(
			<QueryClientProvider client={queryClient}>
				<HandoffDetailDialog handoffId="h1" isOpen={true} onClose={() => {}} />
			</QueryClientProvider>
		);

		await waitFor(() => {
			const verdictElements = screen.getAllByText('action', { selector: '.handoff-turn__verdict strong' });
			expect(verdictElements.length).toBeGreaterThan(0);
		});
	});

	it('hides dialog when isOpen is false', () => {
		render(
			<QueryClientProvider client={queryClient}>
				<HandoffDetailDialog handoffId="h1" isOpen={false} onClose={() => {}} />
			</QueryClientProvider>
		);

		// The dialog should not be rendered
		expect(screen.queryByText(/Loading handoff/)).not.toBeInTheDocument();
	});

	it('verifies no mutation controls present', async () => {
		vi.mocked(api.getHandoff).mockResolvedValue(mockHandoff);
		vi.mocked(api.getHandoffConversation).mockResolvedValue({ conversation: mockConversation, turns: [] });

		const { container } = render(
			<QueryClientProvider client={queryClient}>
				<HandoffDetailDialog handoffId="h1" isOpen={true} onClose={() => {}} />
			</QueryClientProvider>
		);

		await waitFor(() => {
			expect(screen.getByText(/This is a test/)).toBeInTheDocument();
		});

		// Verify no send/dismiss/action buttons anywhere
		const sendButton = container.querySelector('button[aria-label*="send"]');
		const dismissButton = container.querySelector('button[aria-label*="dismiss"]');
		const actionButton = container.querySelector('button[aria-label*="action"]');

		expect(sendButton).not.toBeInTheDocument();
		expect(dismissButton).not.toBeInTheDocument();
		expect(actionButton).not.toBeInTheDocument();
	});
});
