// Extracted from RL_DATA.runs / RL_DATA.runDetails (public.runs) — see README.md.

export type RunStatus = 'running' | 'in_review' | 'approved' | 'denied';
export type RunExecutor = 'claude' | 'pi' | '—';
export type NodeKind = 'agent' | 'human' | 'guard' | 'script';
export type NodeStatus = 'done' | 'running' | 'waiting' | 'pending' | 'denied';

export interface FixtureRunSummary {
	id: string;
	workflow: string;
	node: string;
	kind: NodeKind;
	status: RunStatus;
	executor: RunExecutor;
	started: string;
}

export const FIXTURE_RUNS: FixtureRunSummary[] = [
	{ id: 'run_7f3a', workflow: 'relentless-default', node: 'design.compile', kind: 'agent', status: 'running', executor: 'claude', started: '1m ago' },
	{ id: 'run_5c18', workflow: 'relentless-default', node: 'requirements.gate', kind: 'human', status: 'in_review', executor: '—', started: '18m ago' },
	{ id: 'run_2b90', workflow: 'relentless-default', node: 'tasks.compile', kind: 'agent', status: 'approved', executor: 'pi', started: '44m ago' },
	{ id: 'run_0d41', workflow: 'nightly-audit', node: 'scan.guard', kind: 'guard', status: 'approved', executor: '—', started: '2h ago' },
	{ id: 'run_9a2e', workflow: 'relentless-default', node: 'design.gate', kind: 'human', status: 'denied', executor: '—', started: '2h ago' }
];

export interface FixtureRunNode {
	id: string;
	kind: NodeKind;
	status: NodeStatus;
	dur?: string;
}

export interface FixtureRunArtifact {
	name: string;
	version: number;
	node: string;
	hash: string;
	ts: string;
}

export interface FixtureRunEvent {
	seq: number;
	type: string;
	ts: string;
	detail: string;
}

export interface FixtureRunDetail extends FixtureRunSummary {
	ended?: string;
	snapshot: string;
	workspace: string;
	claimedBy: string;
	nodes: FixtureRunNode[];
	/** Present only while a human gate is open, waiting on approve/deny. */
	gate?: { node: string; prompt: string; allowedSignals: string[] };
	/** Present once a human gate has been resolved. */
	resolvedGate?: { node: string; signal: 'approve' | 'deny'; by: string; ts: string; payload?: string };
	/** Present only while an agent node is actively running. */
	executing?: { node: string; agent: string; model: string; elapsed: string };
	/** Present once the run has ended (approved/denied terminal states). */
	summary?: { headline: string; detail: string };
	artifacts: FixtureRunArtifact[];
	events: FixtureRunEvent[];
}

export const FIXTURE_RUN_DETAILS: Record<string, FixtureRunDetail> = {
	run_5c18: {
		id: 'run_5c18',
		workflow: 'relentless-default',
		node: 'requirements.gate',
		kind: 'human',
		status: 'in_review',
		executor: '—',
		started: '18m ago',
		snapshot: 'b3d91f04',
		workspace: '/work/relentless/a1f3',
		claimedBy: 'scheduler-1',
		nodes: [
			{ id: 'requirements.compile', kind: 'agent', status: 'done', dur: '3m 40s' },
			{ id: 'requirements.review', kind: 'guard', status: 'done', dur: '2s' },
			{ id: 'requirements.gate', kind: 'human', status: 'waiting', dur: '18m …' },
			{ id: 'design.compile', kind: 'agent', status: 'pending' },
			{ id: 'design.gate', kind: 'human', status: 'pending' },
			{ id: 'tasks.compile', kind: 'agent', status: 'pending' },
			{ id: 'tasks.gate', kind: 'human', status: 'pending' }
		],
		gate: {
			node: 'requirements.gate',
			prompt: 'Requirements for structured-logging-pipeline are ready. Approve to advance to design, or deny with a reason for the redraft.',
			allowedSignals: ['approve', 'deny']
		},
		artifacts: [
			{ name: 'requirements.md', version: 2, node: 'requirements.compile', hash: '9c41e2ab', ts: '22m ago' },
			{ name: 'glossary.json', version: 1, node: 'requirements.compile', hash: '77d0f3c1', ts: '24m ago' }
		],
		events: [
			{ seq: 1, type: 'run_started', ts: '14:01:02', detail: 'inputs: { spec: a1f3 }' },
			{ seq: 2, type: 'node_entered', ts: '14:01:02', detail: 'requirements.compile · executor claude' },
			{ seq: 3, type: 'artifact_written', ts: '14:03:11', detail: 'glossary.json v1 · 77d0f3c1' },
			{ seq: 4, type: 'artifact_written', ts: '14:04:38', detail: 'requirements.md v2 · 9c41e2ab' },
			{ seq: 5, type: 'node_exited', ts: '14:04:42', detail: 'requirements.compile · 3m 40s' },
			{ seq: 6, type: 'guard_passed', ts: '14:04:44', detail: 'requirements.review · reads satisfied' },
			{ seq: 7, type: 'human_gate_opened', ts: '14:04:45', detail: 'requirements.gate · signals: approve | deny' }
		]
	},
	run_7f3a: {
		id: 'run_7f3a',
		workflow: 'relentless-default',
		node: 'design.compile',
		kind: 'agent',
		status: 'running',
		executor: 'claude',
		started: '1m ago',
		snapshot: 'b3d91f04',
		workspace: '/work/relentless/a1f3',
		claimedBy: 'scheduler-1',
		nodes: [
			{ id: 'requirements.compile', kind: 'agent', status: 'done', dur: '3m 40s' },
			{ id: 'requirements.review', kind: 'guard', status: 'done', dur: '2s' },
			{ id: 'requirements.gate', kind: 'human', status: 'done', dur: 'approved · 41m' },
			{ id: 'design.compile', kind: 'agent', status: 'running', dur: '1m …' },
			{ id: 'design.gate', kind: 'human', status: 'pending' },
			{ id: 'tasks.compile', kind: 'agent', status: 'pending' },
			{ id: 'tasks.gate', kind: 'human', status: 'pending' }
		],
		executing: { node: 'design.compile', agent: 'design-drafter', model: 'opus', elapsed: '1m 12s' },
		artifacts: [{ name: 'requirements.md', version: 3, node: 'requirements.compile', hash: '4b8e11fc', ts: '46m ago' }],
		events: [
			{ seq: 1, type: 'run_started', ts: '13:14:20', detail: 'inputs: { spec: a1f3 }' },
			{ seq: 2, type: 'node_exited', ts: '13:18:00', detail: 'requirements.compile · 3m 40s' },
			{ seq: 3, type: 'human_gate_resolved', ts: '13:59:04', detail: 'requirements.gate · approve · web-ui' },
			{ seq: 4, type: 'node_entered', ts: '13:59:06', detail: 'design.compile · executor claude · opus' },
			{ seq: 5, type: 'agent_turn', ts: '14:00:18', detail: 'design-drafter · reading requirements + codebase' }
		]
	},
	run_2b90: {
		id: 'run_2b90',
		workflow: 'relentless-default',
		node: 'tasks.compile',
		kind: 'agent',
		status: 'approved',
		executor: 'pi',
		started: '44m ago',
		ended: '12m ago',
		snapshot: 'b3d91f04',
		workspace: '/work/relentless/7b02',
		claimedBy: 'scheduler-2',
		nodes: [
			{ id: 'requirements.compile', kind: 'agent', status: 'done', dur: '2m 58s' },
			{ id: 'requirements.gate', kind: 'human', status: 'done', dur: 'approved · 6m' },
			{ id: 'design.compile', kind: 'agent', status: 'done', dur: '7m 21s' },
			{ id: 'design.gate', kind: 'human', status: 'done', dur: 'approved · 9m' },
			{ id: 'tasks.compile', kind: 'agent', status: 'done', dur: '2m 05s' },
			{ id: 'tasks.gate', kind: 'human', status: 'done', dur: 'approved · 4m' }
		],
		summary: {
			headline: 'Run succeeded · ended 12m ago at tasks.gate',
			detail: 'All three stages approved. spec-implementation-orchestrator dispatches 22 tasks from here.'
		},
		artifacts: [
			{ name: 'requirements.md', version: 1, node: 'requirements.compile', hash: 'c2a94e10', ts: '41m ago' },
			{ name: 'design.md', version: 2, node: 'design.compile', hash: 'f6d1082b', ts: '28m ago' },
			{ name: 'tasks.md', version: 1, node: 'tasks.compile', hash: '1e77ab9d', ts: '16m ago' }
		],
		events: [
			{ seq: 1, type: 'run_started', ts: '13:18:44', detail: 'inputs: { spec: 7b02 }' },
			{ seq: 2, type: 'human_gate_resolved', ts: '13:27:51', detail: 'requirements.gate · approve · web-ui' },
			{ seq: 3, type: 'human_gate_resolved', ts: '13:44:19', detail: 'design.gate · approve · web-ui' },
			{ seq: 4, type: 'human_gate_resolved', ts: '13:50:33', detail: 'tasks.gate · approve · web-ui' },
			{ seq: 5, type: 'run_succeeded', ts: '13:50:34', detail: 'ended_at_node: tasks.gate' }
		]
	},
	run_0d41: {
		id: 'run_0d41',
		workflow: 'nightly-audit',
		node: 'scan.guard',
		kind: 'guard',
		status: 'approved',
		executor: '—',
		started: '2h ago',
		ended: '2h ago',
		snapshot: '77aa02c9',
		workspace: '/work/relentless/nightly',
		claimedBy: 'scheduler-1',
		nodes: [
			{ id: 'scan.collect', kind: 'script', status: 'done', dur: '14s' },
			{ id: 'scan.guard', kind: 'guard', status: 'done', dur: '1s' },
			{ id: 'scan.report', kind: 'script', status: 'done', dur: '3s' }
		],
		summary: {
			headline: 'Run succeeded · ended 2h ago at scan.report',
			detail: 'No guard violations: every audit_log row attributed to a known actor.'
		},
		artifacts: [{ name: 'audit-report.md', version: 1, node: 'scan.report', hash: '90bc45e7', ts: '2h ago' }],
		events: [
			{ seq: 1, type: 'run_started', ts: '12:00:00', detail: 'trigger: schedule · nightly' },
			{ seq: 2, type: 'guard_passed', ts: '12:00:15', detail: 'scan.guard · 0 violations' },
			{ seq: 3, type: 'run_succeeded', ts: '12:00:18', detail: 'ended_at_node: scan.report' }
		]
	},
	run_9a2e: {
		id: 'run_9a2e',
		workflow: 'relentless-default',
		node: 'design.gate',
		kind: 'human',
		status: 'denied',
		executor: 'claude',
		started: '2h ago',
		ended: '1h ago',
		snapshot: 'b3d91f04',
		workspace: '/work/relentless/f230',
		claimedBy: 'scheduler-2',
		nodes: [
			{ id: 'requirements.compile', kind: 'agent', status: 'done', dur: '3m 02s' },
			{ id: 'requirements.gate', kind: 'human', status: 'done', dur: 'approved · 11m' },
			{ id: 'design.compile', kind: 'agent', status: 'done', dur: '8m 44s' },
			{ id: 'design.gate', kind: 'human', status: 'denied', dur: 'denied · 1h ago' },
			{ id: 'tasks.compile', kind: 'agent', status: 'pending' },
			{ id: 'tasks.gate', kind: 'human', status: 'pending' }
		],
		resolvedGate: { node: 'design.gate', signal: 'deny', by: 'web-ui', ts: '1h ago', payload: 'Data model missing traceability to REQ-014.' },
		artifacts: [
			{ name: 'requirements.md', version: 1, node: 'requirements.compile', hash: '5d20cf83', ts: '2h ago' },
			{ name: 'design.md', version: 1, node: 'design.compile', hash: 'e09b7714', ts: '1h ago' }
		],
		events: [
			{ seq: 1, type: 'run_started', ts: '12:04:10', detail: 'inputs: { spec: f230 }' },
			{ seq: 2, type: 'human_gate_resolved', ts: '12:18:40', detail: 'requirements.gate · approve · web-ui' },
			{ seq: 3, type: 'node_exited', ts: '12:27:24', detail: 'design.compile · 8m 44s' },
			{ seq: 4, type: 'human_gate_resolved', ts: '13:02:51', detail: 'design.gate · deny · web-ui' },
			{ seq: 5, type: 'run_ended', ts: '13:02:52', detail: 'ended_at_node: design.gate · deny payload returned to design-drafter' }
		]
	}
};
