import type { SpecStageName, SpecStageStatus } from '../../api/types';

export type { SpecStageName, SpecStageStatus };

/**
 * 'denied' isn't a real stored enum value — deny transitions requirements/
 * design back to 'not_started' (destructive, per openapi.yaml) but leaves
 * `*LastDenialReason` set until the next finalize. Its presence is what
 * distinguishes "denied, not yet redrafted" from "never started" in the UI
 * (see domain/specs.ts). Tasks has no per-spec denial reason (denials live
 * on individual TasksDocs, which aren't listable via REST today — see
 * GAPS.md) so its display status never resolves to 'denied'.
 */
export type DisplayStageStatus = SpecStageStatus | 'denied';

export interface SpecSummary {
	id: string;
	slug: string;
	featureName: string;
	/** First non-approved stage in order, or 'implementation' once tasks is approved. */
	currentStage: SpecStageName | 'implementation';
	stages: Record<SpecStageName, DisplayStageStatus>;
	updatedAt: string;
}

export interface SpecDetail extends SpecSummary {
	requirementsOverview: string;
	requirementsDeniedAt?: string;
	requirementsLastDenialReason?: string;
	designOverview: string;
	designArchitecture: string;
	designDataModelOverview?: string;
	designDeniedAt?: string;
	designLastDenialReason?: string;
	createdAt: string;
}
