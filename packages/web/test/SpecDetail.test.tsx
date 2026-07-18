import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { SpecDetail } from '../src/routes/SpecDetail';
import * as client from '../src/api/client';

vi.mock('../src/api/client');
vi.mock('react-router-dom', async () => {
	const actual = await vi.importActual('react-router-dom');
	return {
		...actual,
		useParams: vi.fn(() => ({
			specId: 'spec-123'
		}))
	};
});

function renderWithProviders(queryClient: QueryClient) {
	return render(
		<QueryClientProvider client={queryClient}>
			<BrowserRouter>
				<SpecDetail />
			</BrowserRouter>
		</QueryClientProvider>
	);
}

describe('SpecDetail', () => {
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

		// StageDocumentView (nested per stage) fetches unconditionally once a spec loads
		// -- default it to a benign resolved value so tests that only care about the
		// top-level spec fields don't hang/error on it.
		vi.mocked(client.getSpecStageDocument).mockResolvedValue({ markdown: '' });
	});

	it('renders loading state', () => {
		vi.mocked(client.getSpec).mockImplementation(
			() => new Promise(() => {
				// Never resolves to keep loading state
			})
		);

		renderWithProviders(queryClient);

		expect(screen.getByText('Loading spec…')).toBeInTheDocument();
	});

	it('renders error state with error message', async () => {
		const errorMessage = 'Failed to fetch spec';
		vi.mocked(client.getSpec).mockRejectedValue(new Error(errorMessage));

		renderWithProviders(queryClient);

		expect(await screen.findByRole('alert')).toBeInTheDocument();
		expect(await screen.findByText(errorMessage)).toBeInTheDocument();
	});

	it('smoke test: renders spec detail with mocked API response', async () => {
		const mockSpec: client.SpecDetail = {
			id: 'spec-123',
			slug: 'my-spec',
			featureName: 'My Spec Feature',
			currentStage: 'design',
			stages: {
				requirements: 'approved',
				design: 'in_review',
				tasks: 'not_started'
			}
		};

		vi.mocked(client.getSpec).mockResolvedValue(mockSpec);

		renderWithProviders(queryClient);

		// Wait for the spec detail to render
		expect(await screen.findByText('My Spec Feature')).toBeInTheDocument();
		expect(screen.getByTestId('spec-detail-slug')).toHaveTextContent('my-spec');

		// Verify each stage section is present
		expect(screen.getByTestId('stage-requirements')).toBeInTheDocument();
		expect(screen.getByTestId('stage-design')).toBeInTheDocument();
		expect(screen.getByTestId('stage-tasks')).toBeInTheDocument();
	});

	it('fetches spec with correct specId from params', async () => {
		const mockSpec: client.SpecDetail = {
			id: 'spec-456',
			slug: 'test-spec',
			featureName: 'Test Spec',
			currentStage: 'requirements',
			stages: {
				requirements: 'not_started',
				design: 'not_started',
				tasks: 'not_started'
			}
		};

		vi.mocked(client.getSpec).mockResolvedValue(mockSpec);

		renderWithProviders(queryClient);

		await screen.findByText('Test Spec');

		// Verify getSpec was called with the correct specId
		expect(client.getSpec).toHaveBeenCalledWith('spec-123');
	});

	it('renders spec with all required data fields', async () => {
		const mockSpec: client.SpecDetail = {
			id: 'spec-789',
			slug: 'detailed-spec',
			featureName: 'Detailed Spec',
			currentStage: 'tasks',
			stages: {
				requirements: 'approved',
				design: 'approved',
				tasks: 'approved'
			}
		};

		vi.mocked(client.getSpec).mockResolvedValue(mockSpec);

		renderWithProviders(queryClient);

		await screen.findByText('Detailed Spec');

		expect(screen.getByTestId('spec-detail-slug')).toHaveTextContent('detailed-spec');
		expect(screen.getByTestId('stage-status-requirements')).toHaveTextContent('Approved');
		expect(screen.getByTestId('stage-status-design')).toHaveTextContent('Approved');
		expect(screen.getByTestId('stage-status-tasks')).toHaveTextContent('Approved');
	});

	it('does not throw when rendering with representative mocked API response', async () => {
		const mockSpec: client.SpecDetail = {
			id: 'spec-pipeline-mcp',
			slug: 'spec-pipeline-mcp-ui',
			featureName: 'Spec Pipeline MCP UI',
			currentStage: 'design',
			stages: {
				requirements: 'approved',
				design: 'in_review',
				tasks: 'not_started'
			}
		};

		vi.mocked(client.getSpec).mockResolvedValue(mockSpec);

		expect(() => {
			renderWithProviders(queryClient);
		}).not.toThrow();
	});
});
