import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SpecDetailPage } from './SpecDetailPage';
import { AppStateProvider } from '../../app/state/AppStateContext';
import * as api from '../../api/client';
import { ApiError } from '../../api/client';
import type { SpecDTO, TasksDocDTO } from '../../api/types';

vi.mock('../../api/client', async () => {
	const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
	return {
		...actual,
		getSpec: vi.fn(),
		listTasksDocs: vi.fn(),
		renderSpecDocument: vi.fn(),
		approveStage: vi.fn(),
		denyStage: vi.fn(),
		getExpeditionBySpec: vi.fn()
	};
});

const SPEC_ID = 'spec-1';

const baseSpec: SpecDTO = {
	id: SPEC_ID,
	workspaceId: 'haven',
	slug: 'haven-ledger-backend-v1',
	featureName: 'Haven Ledger Backend v1',
	requirementsOverview: 'req overview',
	requirementsStageStatus: 'approved',
	designOverview: 'design overview',
	designArchitecture: 'design arch',
	designStageStatus: 'approved',
	tasksStageStatus: 'in_review',
	implementationStageStatus: 'not_started',
	createdAt: '2026-08-01T00:00:00Z',
	updatedAt: '2026-08-01T00:00:00Z'
};

const alphaDoc: TasksDocDTO = {
	id: 'doc-alpha',
	specId: SPEC_ID,
	designComponentId: 'comp-alpha',
	componentSlug: 'alpha',
	componentName: 'Alpha Component',
	status: 'in_review'
};

const betaDoc: TasksDocDTO = {
	id: 'doc-beta',
	specId: SPEC_ID,
	designComponentId: 'comp-beta',
	componentSlug: 'beta',
	componentName: 'Beta Component',
	status: 'approved'
};

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<AppStateProvider>
				<MemoryRouter initialEntries={[`/haven/specs/${SPEC_ID}`]}>
					<Routes>
						<Route path=":workspace/specs/:specId" element={<SpecDetailPage />} />
					</Routes>
				</MemoryRouter>
			</AppStateProvider>
		</QueryClientProvider>
	);
}

beforeEach(() => {
	vi.mocked(api.getSpec).mockResolvedValue(baseSpec);
	vi.mocked(api.getExpeditionBySpec).mockRejectedValue(new ApiError(404, 'not found'));
	vi.mocked(api.renderSpecDocument).mockImplementation(async (_id, _stage, component) => ({
		// Checkbox lines drive the "components complete" metric below (domain/taskCompletion.ts):
		// alpha is partially checked (1/2), beta is fully checked (2/2) — one of two components complete.
		markdown:
			component === 'alpha'
				? `# Tasks: alpha\n\n- [x] one\n- [ ] two\n`
				: component === 'beta'
					? `# Tasks: beta\n\n- [x] one\n- [x] two\n`
					: `# Tasks: ${component}`
	}));
	vi.mocked(api.listTasksDocs).mockResolvedValue({ tasksDocs: [alphaDoc, betaDoc] });
});

describe('SpecDetailPage — Tasks tab', () => {
	it('defaults to the first component (alphabetical) and renders its doc', async () => {
		renderPage();

		expect(await screen.findByText('Alpha Component')).toBeInTheDocument();
		expect(screen.getByText('Beta Component')).toBeInTheDocument();
		expect(await screen.findByText('Tasks: alpha')).toBeInTheDocument();
		expect(screen.getByText('1/2 components complete')).toBeInTheDocument();
	});

	it('switches the rendered doc and review-gate status when another switcher row is clicked', async () => {
		renderPage();
		await screen.findByText('Tasks: alpha');

		fireEvent.click(screen.getByText('Beta Component'));

		expect(await screen.findByText('Tasks: beta')).toBeInTheDocument();
		expect(await screen.findByText(/Component approved/)).toBeInTheDocument();
	});

	it('approve sends the selected component slug', async () => {
		vi.mocked(api.approveStage).mockResolvedValue({});
		renderPage();
		await screen.findByText('Tasks: alpha');

		fireEvent.click(screen.getByRole('button', { name: /Approve/ }));

		await waitFor(() => {
			expect(api.approveStage).toHaveBeenCalledWith(SPEC_ID, { stage: 'tasks', component: 'alpha' });
		});
	});

	it('deny sends the reason and the selected component slug', async () => {
		vi.mocked(api.denyStage).mockResolvedValue({});
		renderPage();
		await screen.findByText('Tasks: alpha');

		fireEvent.click(screen.getByRole('button', { name: /Deny & redraft/ }));
		fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'needs more detail' } });
		fireEvent.click(screen.getByRole('button', { name: /Confirm deny/ }));

		await waitFor(() => {
			expect(api.denyStage).toHaveBeenCalledWith(SPEC_ID, { stage: 'tasks', component: 'alpha', reason: 'needs more detail' });
		});
	});

	it('shows the not-started empty state when the tasks stage has no TasksDocs yet', async () => {
		vi.mocked(api.getSpec).mockResolvedValue({ ...baseSpec, tasksStageStatus: 'not_started' });
		vi.mocked(api.listTasksDocs).mockResolvedValue({ tasksDocs: [] });
		renderPage();

		expect(await screen.findByText('no document')).toBeInTheDocument();
		expect(screen.getByText(/tasks-drafter drafts this stage, per design component/)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /Approve/ })).not.toBeInTheDocument();
	});
});
