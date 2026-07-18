import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import { getSpecs, queryKeys } from '../api/client';
import type { Spec, SpecStageName, StageStatus } from '../api/client';

/**
 * SpecsList (Story 1): the `/` route. Lists every spec returned by `GET /api/specs`
 * (Story 1 AC1) with an id/slug, feature name, and a status badge per stage
 * (requirements/design/tasks). Fetched with `useQuery({ queryKey: queryKeys.specs(), ... })`
 * so that any invalidation of the `['specs']` query key elsewhere in the app -- e.g. after
 * a mutation on another screen -- refetches this list and re-renders it with no manual
 * reload (Story 1 AC2).
 *
 * `GET /api/specs` requires a `project` query param server-side (`ensureProject` in
 * `packages/server/src/web/routes/reads.ts`) -- project scoping is an explicit open
 * question in the design, so this reads it straight from the page's own URL search
 * params (`?project=`) rather than inventing a default here.
 */

const STAGES: readonly SpecStageName[] = ['requirements', 'design', 'tasks'];

const STAGE_LABELS: Record<SpecStageName, string> = {
	requirements: 'Requirements',
	design: 'Design',
	tasks: 'Tasks'
};

const STATUS_LABELS: Record<StageStatus, string> = {
	not_started: 'Not started',
	in_review: 'In review',
	approved: 'Approved'
};

function stageStatus(spec: Spec, stageName: SpecStageName): StageStatus {
	return spec.stages[stageName] ?? 'not_started';
}

function StatusBadge({ status }: { status: StageStatus }) {
	return (
		<span className={`status-badge status-badge--${status}`} data-status={status}>
			{STATUS_LABELS[status]}
		</span>
	);
}

export function SpecsList() {
	const [searchParams] = useSearchParams();
	const project = searchParams.get('project') ?? '';

	const { data, isLoading, isError, error } = useQuery({
		queryKey: queryKeys.specs(),
		queryFn: () => getSpecs(project)
	});

	if (isLoading) {
		return <p>Loading specs…</p>;
	}

	if (isError) {
		const message = error instanceof Error ? error.message : 'Failed to load specs.';
		return <p role="alert">{message}</p>;
	}

	const specs = data ?? [];

	if (specs.length === 0) {
		return <p>No specs yet.</p>;
	}

	return (
		<table>
			<thead>
				<tr>
					<th>Feature</th>
					{STAGES.map((stage) => (
						<th key={stage}>{STAGE_LABELS[stage]}</th>
					))}
				</tr>
			</thead>
			<tbody>
				{specs.map((spec) => (
					<tr key={spec.id} data-testid="spec-row" data-spec-id={spec.id} data-spec-slug={spec.slug}>
						<td>
							<Link to={`/specs/${spec.id}`}>{spec.featureName}</Link> <span>({spec.slug})</span>
						</td>
						{STAGES.map((stage) => (
							<td key={stage} data-testid={`spec-row-${stage}`}>
								<StatusBadge status={stageStatus(spec, stage)} />
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
}

export default SpecsList;
