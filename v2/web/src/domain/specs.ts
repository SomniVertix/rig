import type { SpecDTO, SpecStageName } from '../api/types';
import type { SpecDetail, SpecSummary } from '../data/specs/types';

/** Pipeline order — for StageStepper rendering (requirements → design → tasks → implementation). */
export const SPEC_STAGE_ORDER: SpecStageName[] = ['requirements', 'design', 'tasks'];

function currentStageOf(spec: SpecDTO): SpecStageName | 'implementation' {
	if (spec.requirementsStageStatus !== 'approved') return 'requirements';
	if (spec.designStageStatus !== 'approved') return 'design';
	if (spec.tasksStageStatus !== 'approved') return 'tasks';
	return 'implementation';
}

function stagesOf(spec: SpecDTO): SpecSummary['stages'] {
	return {
		requirements: spec.requirementsLastDenialReason ? 'denied' : spec.requirementsStageStatus,
		design: spec.designLastDenialReason ? 'denied' : spec.designStageStatus,
		// No per-spec denial reason for tasks — see DisplayStageStatus's doc comment.
		tasks: spec.tasksStageStatus
	};
}

export function toSpecSummary(spec: SpecDTO): SpecSummary {
	return {
		id: spec.id,
		slug: spec.slug,
		featureName: spec.featureName,
		currentStage: currentStageOf(spec),
		stages: stagesOf(spec),
		updatedAt: spec.updatedAt
	};
}

export function toSpecDetail(spec: SpecDTO): SpecDetail {
	return {
		...toSpecSummary(spec),
		requirementsOverview: spec.requirementsOverview,
		requirementsDeniedAt: spec.requirementsDeniedAt ?? undefined,
		requirementsLastDenialReason: spec.requirementsLastDenialReason ?? undefined,
		designOverview: spec.designOverview,
		designArchitecture: spec.designArchitecture,
		designDataModelOverview: spec.designDataModelOverview ?? undefined,
		designDeniedAt: spec.designDeniedAt ?? undefined,
		designLastDenialReason: spec.designLastDenialReason ?? undefined,
		createdAt: spec.createdAt,
		updatedAt: spec.updatedAt
	};
}
