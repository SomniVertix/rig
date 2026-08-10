export type RunStatus = 'running' | 'in_review' | 'approved' | 'denied';
export type RunExecutor = 'claude' | 'pi' | '—';

export interface Run {
	id: string;
	workflow: string;
	node: string;
	executor: RunExecutor;
	status: RunStatus;
	started: string;
}
