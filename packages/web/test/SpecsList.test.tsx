import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SpecsList } from '../src/routes/SpecsList';
import * as client from '../src/api/client';

vi.mock('../src/api/client');

function renderWithProviders(queryClient: QueryClient) {
	return render(
		<QueryClientProvider client={queryClient}>
			<MemoryRouter initialEntries={['/?project=test-project']}>
				<SpecsList />
			</MemoryRouter>
		</QueryClientProvider>
	);
}

describe('SpecsList', () => {
	let queryClient: QueryClient;

	beforeEach(() => {
		queryClient = new QueryClient({
			defaultOptions: {
				queries: {
					retry: false
				}
			}
		});

		vi.clearAllMocks();
	});

	it('renders loading state', () => {
		vi.mocked(client.getSpecs).mockImplementation(
			() => new Promise(() => {
				// Never resolves to keep loading state
			})
		);

		renderWithProviders(queryClient);

		expect(screen.getByText('Loading specs…')).toBeInTheDocument();
	});

	it('renders error state with error message', async () => {
		const errorMessage = 'Failed to fetch';
		vi.mocked(client.getSpecs).mockRejectedValue(new Error(errorMessage));

		renderWithProviders(queryClient);

		expect(await screen.findByRole('alert')).toBeInTheDocument();
		expect(await screen.findByText(errorMessage)).toBeInTheDocument();
	});

	it('renders empty state when no specs available', async () => {
		vi.mocked(client.getSpecs).mockResolvedValue([]);

		renderWithProviders(queryClient);

		expect(await screen.findByText('No specs yet.')).toBeInTheDocument();
	});

	it('smoke test: renders specs list with mocked API response', async () => {
		const mockSpecs: client.Spec[] = [
			{
				id: 'spec-1',
				slug: 'my-feature',
				featureName: 'My Feature',
				currentStage: 'design',
				stages: {
					requirements: 'approved',
					design: 'in_review',
					tasks: 'not_started'
				}
			},
			{
				id: 'spec-2',
				slug: 'another-feature',
				featureName: 'Another Feature',
				currentStage: 'requirements',
				stages: {
					requirements: 'not_started',
					design: 'not_started',
					tasks: 'not_started'
				}
			}
		];

		vi.mocked(client.getSpecs).mockResolvedValue(mockSpecs);

		renderWithProviders(queryClient);

		// Wait for the list to render
		const specRows = await screen.findAllByTestId('spec-row');
		expect(specRows).toHaveLength(2);

		// Verify first spec is rendered
		expect(screen.getByText('My Feature')).toBeInTheDocument();
		expect(screen.getByText('(my-feature)')).toBeInTheDocument();

		// Verify second spec is rendered
		expect(screen.getByText('Another Feature')).toBeInTheDocument();
		expect(screen.getByText('(another-feature)')).toBeInTheDocument();

		// Verify status badges are rendered
		const statusBadges = screen.getAllByTestId(/spec-row-/);
		expect(statusBadges.length).toBeGreaterThan(0);
	});

	it('renders table with correct columns', async () => {
		const mockSpecs: client.Spec[] = [
			{
				id: 'spec-1',
				slug: 'test-spec',
				featureName: 'Test Spec',
				currentStage: 'tasks',
				stages: {
					requirements: 'approved',
					design: 'approved',
					tasks: 'approved'
				}
			}
		];

		vi.mocked(client.getSpecs).mockResolvedValue(mockSpecs);

		renderWithProviders(queryClient);

		// Wait for table to render
		await screen.findByText('Feature');

		// Verify column headers
		expect(screen.getByText('Feature')).toBeInTheDocument();
		expect(screen.getByText('Requirements')).toBeInTheDocument();
		expect(screen.getByText('Design')).toBeInTheDocument();
		expect(screen.getByText('Tasks')).toBeInTheDocument();

		// Verify spec row has correct data attributes
		const specRow = screen.getByTestId('spec-row');
		expect(specRow).toHaveAttribute('data-spec-id', 'spec-1');
		expect(specRow).toHaveAttribute('data-spec-slug', 'test-spec');
	});

	it('does not throw when rendering with representative mocked API response', async () => {
		const mockSpecs: client.Spec[] = [
			{
				id: 'spec-abc-123',
				slug: 'pipeline-mcp-ui',
				featureName: 'Pipeline MCP UI',
				currentStage: 'design',
				stages: {
					requirements: 'approved',
					design: 'in_review',
					tasks: 'not_started'
				}
			}
		];

		vi.mocked(client.getSpecs).mockResolvedValue(mockSpecs);

		expect(() => {
			renderWithProviders(queryClient);
		}).not.toThrow();
	});
});
