export type StageDistributionStatus = 'not_started' | 'in_review' | 'approved' | 'denied';

export interface Project {
	slug: string;
	name: string;
	specCount: number;
	trailCount: number;
	gatesWaiting: number;
	stageDistribution: { status: StageDistributionStatus; count: number }[];
	/** Max updatedAt across the project's specs/expeditions; undefined if it has neither. */
	lastWriteAt?: string;
}
