import { useMutation, useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

import { approveStage, denyStage, getSpec, getSpecStageDocument } from '../api/client';
import type { SpecStageName, StageStatus } from '../api/client';

/**
 * SpecDetail (Story 2): the `/specs/:specId` route. Shows the per-stage status and the
 * rendered markdown document for each of the requirements/design/tasks stages, fetched
 * via `useQuery({ queryKey: ['spec', specId] })` / `useQuery({ queryKey: ['spec-doc',
 * specId, stage] })` (`../api/client`'s typed wrappers around `GET /api/specs/:specId` and
 * `GET /api/specs/:specId/stages/:stage/document` -- `packages/server/src/web/routes/reads.ts`)
 * (Story 2 AC1). Those literal key shapes are exactly what the app-level SSE subscriber
 * (`api/events.ts`'s `getInvalidationKeysForEvent`, wired once in `App.tsx`) invalidates on
 * a `spec_changed` ping for this spec/stage, so a live event refetches and redisplays both
 * with no extra wiring in this file (Story 2 AC4). Keys are written as plain array literals
 * rather than through `../api/client`'s `queryKeys` helper so they still resolve correctly
 * when a test does `vi.mock('../api/client')` -- automocking replaces every function nested
 * inside an exported object (including `queryKeys.spec`/`queryKeys.specDoc`) with a stub
 * that returns `undefined`, which would collapse every query in this screen onto the same
 * cache entry.
 *
 * Markdown is rendered through `react-markdown` with the `rehype-sanitize` plugin so a
 * document's content -- ultimately agent-authored, stored, and rendered server-side by
 * `SpecRepository.renderDocument` -- can never inject raw HTML into the page.
 *
 * Shows an approve/deny action only on whichever stage is currently `in_review` (Story 2
 * AC2). Submitting either calls `approveStage`/`denyStage` (POSTing to that stage's write
 * endpoint in `packages/server/src/web/routes/writes.ts`) and intentionally does *not*
 * invalidate or otherwise locally mutate the `['spec', specId]`/`['spec-doc', specId, stage]`
 * caches on success -- the write's own self-triggered `spec_changed` SSE ping is what
 * refreshes the displayed status once it completes (Story 2 AC3, AC5; design "Approve/deny
 * buttons POST to the write endpoints and rely on the resulting SSE ping to refresh").
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

function StageActions({ specId, stage }: { specId: string; stage: SpecStageName }) {
	const approve = useMutation({ mutationFn: () => approveStage(specId, stage) });
	const deny = useMutation({ mutationFn: () => denyStage(specId, stage) });

	const pending = approve.isPending || deny.isPending;
	const failure = approve.error ?? deny.error;

	return (
		<div data-testid={`stage-actions-${stage}`}>
			<button type="button" onClick={() => approve.mutate()} disabled={pending} data-testid={`approve-${stage}`}>
				Approve
			</button>
			<button type="button" onClick={() => deny.mutate()} disabled={pending} data-testid={`deny-${stage}`}>
				Deny
			</button>
			{failure ? <p role="alert">{failure instanceof Error ? failure.message : 'Action failed.'}</p> : null}
		</div>
	);
}

function StageDocumentView({ specId, stage }: { specId: string; stage: SpecStageName }) {
	const { data, isLoading, isError, error } = useQuery({
		queryKey: ['spec-doc', specId, stage],
		queryFn: () => getSpecStageDocument(specId, stage)
	});

	if (isLoading) {
		return <p>Loading document…</p>;
	}

	if (isError) {
		const message = error instanceof Error ? error.message : 'Failed to load document.';
		return <p role="alert">{message}</p>;
	}

	return (
		<div data-testid={`stage-document-${stage}`}>
			<ReactMarkdown rehypePlugins={[rehypeSanitize]}>{data?.markdown ?? ''}</ReactMarkdown>
		</div>
	);
}

export function SpecDetail() {
	const { specId } = useParams<{ specId: string }>();

	const specQuery = useQuery({
		queryKey: ['spec', specId],
		queryFn: () => getSpec(specId as string),
		enabled: Boolean(specId)
	});

	if (!specId) {
		return <p role="alert">No spec ID provided</p>;
	}

	if (specQuery.isLoading) {
		return <p>Loading spec…</p>;
	}

	if (specQuery.isError || specQuery.data === undefined) {
		const message = specQuery.error instanceof Error ? specQuery.error.message : 'Failed to load spec.';
		return <p role="alert">{message}</p>;
	}

	const spec = specQuery.data;

	return (
		<div>
			<h1>{spec.featureName}</h1>
			<p data-testid="spec-detail-slug">{spec.slug}</p>
			{STAGES.map((stage) => {
				const status = spec.stages[stage];
				return (
					<section key={stage} aria-label={STAGE_LABELS[stage]} data-testid={`stage-${stage}`}>
						<h2>{STAGE_LABELS[stage]}</h2>
						<p data-testid={`stage-status-${stage}`} data-status={status}>
							Status: {STATUS_LABELS[status]}
						</p>
						{status === 'in_review' ? <StageActions specId={specId} stage={stage} /> : null}
						<StageDocumentView specId={specId} stage={stage} />
					</section>
				);
			})}
		</div>
	);
}

export default SpecDetail;
