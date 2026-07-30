export interface Turn {
	n: number;
	question: string;
	answer: string;
}

export interface Session {
	id: string;
	kind: 'discovery' | 'scratch';
	executor: 'claude' | 'pi';
	model: string;
	startedAt: string;
	trailId?: string;
	outcomeSpecId?: string;
	turns: Turn[];
}
