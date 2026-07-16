import { createHash } from 'node:crypto';

import type {
	AgentExecutor,
	AgentRunHandlers,
	AgentRunOutcome,
	AgentRunSpec,
	ArtifactMeta,
	ArtifactStore,
	Clock,
	HumanResult,
	JsonValue,
	PendingHumanInteraction,
	RunCreateInput,
	RunEventBase,
	RunState,
	RunStore,
	WorkflowDef
} from '@relentless/schema';

function cloneValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function hashContents(contents: string): string {
	return createHash('sha256').update(contents).digest('hex');
}

export class ConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConflictError';
	}
}

interface StoredHumanInteraction extends PendingHumanInteraction {
	resolved: boolean;
	result?: HumanResult;
}

export class FakeClock implements Clock {
	private currentTime: Date;

	constructor(initialTime: Date = new Date('2026-01-01T00:00:00.000Z')) {
		this.currentTime = new Date(initialTime.getTime());
	}

	now(): Date {
		return new Date(this.currentTime.getTime());
	}

	set(time: Date): void {
		this.currentTime = new Date(time.getTime());
	}

	advance(milliseconds: number): void {
		this.currentTime = new Date(this.currentTime.getTime() + milliseconds);
	}
}

export class FakeArtifactStore implements ArtifactStore {
	private readonly contentsByRunAndName = new Map<string, string>();
	private readonly metadataByRunAndName = new Map<string, ArtifactMeta>();

	private key(runId: string, name: string): string {
		return `${runId}:${name}`;
	}

	async read(runId: string, name: string): Promise<string> {
		const value = this.contentsByRunAndName.get(this.key(runId, name));
		if (value === undefined) {
			throw new Error(`Artifact not found: ${name}`);
		}
		return value;
	}

	async write(runId: string, name: string, contents: string): Promise<void> {
		const key = this.key(runId, name);
		const previous = this.metadataByRunAndName.get(key);
		const version = previous ? previous.version + 1 : 1;
		const now = new Date().toISOString();
		this.contentsByRunAndName.set(key, contents);
		this.metadataByRunAndName.set(key, {
			runId,
			name,
			path: `workspace/${name}`,
			contentHash: hashContents(contents),
			version,
			authoringNode: previous?.authoringNode ?? 'unknown',
			ts: now
		});
	}

	async exists(runId: string, name: string): Promise<boolean> {
		return this.contentsByRunAndName.has(this.key(runId, name));
	}

	async metadata(runId: string, name: string): Promise<ArtifactMeta> {
		const value = this.metadataByRunAndName.get(this.key(runId, name));
		if (value === undefined) {
			throw new Error(`Artifact metadata not found: ${name}`);
		}
		return cloneValue(value);
	}
}

export class FakeRunStore implements RunStore {
	private readonly runs = new Map<string, RunState>();
	private readonly events = new Map<string, RunEventBase[]>();
	private readonly pendingHuman = new Map<string, StoredHumanInteraction>();

	async create(run: RunCreateInput): Promise<RunState> {
		const created: RunState = {
			id: run.id,
			workflowId: run.workflowId,
			snapshotHash: run.snapshotHash,
			status: run.status ?? 'pending',
			currentNodeId: run.currentNodeId,
			context: cloneValue(run.context ?? {}),
			startedAt: new Date().toISOString(),
			inputs: cloneValue(run.inputs ?? {}),
			workspacePath: run.workspacePath,
			history: []
		};
		this.runs.set(created.id, cloneValue(created));
		this.events.set(created.id, []);
		return cloneValue(created);
	}

	async load(runId: string): Promise<RunState> {
		const run = this.runs.get(runId);
		if (run === undefined) {
			throw new Error(`Run not found: ${runId}`);
		}
		const history = this.events.get(runId) ?? [];
		return {
			...cloneValue(run),
			history: cloneValue(history)
		};
	}

	async save(runState: RunState): Promise<void> {
		this.runs.set(runState.id, cloneValue(runState));
		if (!this.events.has(runState.id)) {
			this.events.set(runState.id, []);
		}
	}

	async appendEvent(runId: string, event: Omit<RunEventBase, 'seq'>): Promise<{ seq: number }> {
		const history = this.events.get(runId);
		if (history === undefined) {
			throw new Error(`Run not found: ${runId}`);
		}
		const seq = history.length + 1;
		history.push({ ...cloneValue(event), seq });
		const run = this.runs.get(runId);
		if (run !== undefined) {
			run.history = cloneValue(history);
		}
		return { seq };
	}

	async claimRunnable(_cap: number): Promise<RunState | null> {
		for (const run of this.runs.values()) {
			if (run.status === 'pending' || run.status === 'interrupted') {
				return cloneValue(run);
			}
		}
		return null;
	}

	async listInterrupted(): Promise<RunState[]> {
		return Array.from(this.runs.values())
			.filter((run) => run.status === 'interrupted')
			.map((run) => cloneValue(run));
	}

	async putPendingHuman(...args: unknown[]): Promise<void> {
		const [runId, nodeId, prompt, allowedSignals, payloadSchema, deadline] = args as [
			string,
			string,
			string,
			string[],
			JsonValue | undefined,
			string | undefined
		];
		this.pendingHuman.set(runId, {
			runId,
			nodeId,
			prompt,
			allowedSignals,
			payloadSchema,
			deadline,
			resolved: false
		});
		const run = this.runs.get(runId);
		if (run !== undefined) {
			run.status = 'waiting_human';
			run.currentNodeId = nodeId;
		}
	}

	async takePendingHuman(runId: string, submission: { signal: string; payload?: JsonValue }): Promise<HumanResult> {
		const pending = this.pendingHuman.get(runId);
		if (pending === undefined) {
			throw new Error(`Pending human interaction not found: ${runId}`);
		}
		if (pending.resolved) {
			throw new ConflictError(`Pending human interaction already resolved: ${runId}`);
		}
		if (!pending.allowedSignals.includes(submission.signal)) {
			throw new Error(`Signal not allowed: ${submission.signal}`);
		}
		pending.resolved = true;
		const result: HumanResult = { signal: submission.signal, output: submission.payload };
		pending.result = result;
		return cloneValue(result);
	}
}

export interface FakeAgentPlan {
	status?: AgentRunOutcome['status'];
	text?: string;
	toolCalls?: unknown[];
	data?: unknown;
	signal?: string;
	usage?: AgentRunOutcome['usage'];
	error?: unknown;
	onRun?: (spec: AgentRunSpec, handlers: AgentRunHandlers) => Promise<AgentRunOutcome> | AgentRunOutcome;
}

export class FakeAgentExecutor implements AgentExecutor {
	readonly kind: 'pi' | 'claude';
	readonly capabilities: AgentExecutor['capabilities'];
	private readonly plans = new Map<string, FakeAgentPlan>();

	constructor(
		kind: 'pi' | 'claude' = 'pi',
		capabilities: AgentExecutor['capabilities'] = {
			supportsCustomTools: true,
			supportsStructuredOutput: true,
			supportsStreaming: true
		}
	) {
		this.kind = kind;
		this.capabilities = capabilities;
	}

	setPlan(nodeId: string, plan: FakeAgentPlan): void {
		this.plans.set(nodeId, plan);
	}

	async run(spec: AgentRunSpec, handlers: AgentRunHandlers): Promise<AgentRunOutcome> {
		const nodeId = spec.nodeId ?? spec.prompt;
		const plan = this.plans.get(nodeId);
		if (plan?.onRun !== undefined) {
			return plan.onRun(spec, handlers);
		}

		if (plan?.text !== undefined) {
			handlers.onText?.(plan.text);
		}
		if (plan?.toolCalls !== undefined) {
			for (const toolCall of plan.toolCalls) {
				handlers.onToolStart?.('tool', toolCall);
				handlers.onToolEnd?.('tool', toolCall);
			}
		}
		if (plan?.data !== undefined) {
			handlers.onEmitOutput?.(plan.data);
		}

		return {
			status: plan?.status ?? 'ok',
			text: plan?.text,
			toolCalls: plan?.toolCalls,
			data: plan?.data,
			usage: plan?.usage,
			error: plan?.error
		};
	}
}

export function buildMinimalWorkflowDef(): WorkflowDef {
	return {
		id: 'minimal-workflow',
		name: 'Minimal Workflow',
		entry: 'finish',
		inputs: [],
		artifacts: ['output.md'],
		nodes: [
			{
				kind: 'script',
				id: 'finish',
				reads: [],
				writes: ['output.md'],
				handler: 'noop'
			}
		],
		edges: []
	};
}

export function buildRelentlessDefaultWorkflowShape(): WorkflowDef {
	return {
		id: 'relentless-default',
		name: 'Relentless Default Workflow',
		entry: 'compile-requirements',
		inputs: [{ name: 'decisions.md', required: true }],
		artifacts: ['requirements.md', 'design.md', 'tasks.md'],
		nodes: [
			{
				kind: 'agent',
				id: 'compile-requirements',
				reads: ['decisions.md'],
				writes: ['requirements.md'],
				prompt: 'requirements-compiler',
				template: 'requirements'
			},
			{
				kind: 'human',
				id: 'review-requirements',
				reads: ['requirements.md'],
				writes: [],
				prompt: 'Review requirements',
				allowedSignals: ['approve', 'deny']
			},
			{
				kind: 'guard',
				id: 'requirements-gate',
				reads: ['requirements.md'],
				writes: [],
				cases: [
					{ when: 'approve', goto: 'draft-design' },
					{ when: 'deny', goto: 'compile-requirements' }
				],
				default: 'compile-requirements'
			},
			{
				kind: 'agent',
				id: 'draft-design',
				reads: ['requirements.md'],
				writes: ['design.md'],
				prompt: 'design-drafter',
				template: 'design'
			},
			{
				kind: 'human',
				id: 'review-design',
				reads: ['design.md'],
				writes: [],
				prompt: 'Review design',
				allowedSignals: ['approve', 'deny']
			},
			{
				kind: 'guard',
				id: 'design-gate',
				reads: ['design.md'],
				writes: [],
				cases: [
					{ when: 'approve', goto: 'draft-tasks' },
					{ when: 'deny', goto: 'draft-design' }
				],
				default: 'draft-design'
			},
			{
				kind: 'agent',
				id: 'draft-tasks',
				reads: ['design.md'],
				writes: ['tasks.md'],
				prompt: 'tasks-drafter',
				template: 'tasks'
			},
			{
				kind: 'human',
				id: 'review-tasks',
				reads: ['tasks.md'],
				writes: [],
				prompt: 'Review tasks',
				allowedSignals: ['approve']
			},
			{
				kind: 'guard',
				id: 'tasks-gate',
				reads: ['tasks.md'],
				writes: [],
				cases: [{ when: 'approve', goto: 'done' }],
				default: 'done'
			},
			{
				kind: 'script',
				id: 'done',
				reads: ['tasks.md'],
				writes: [],
				handler: 'noop'
			}
		],
		edges: [
			{ from: 'compile-requirements', to: 'review-requirements' },
			{ from: 'review-requirements', to: 'requirements-gate' },
			{ from: 'requirements-gate', to: 'draft-design' },
			{ from: 'draft-design', to: 'review-design' },
			{ from: 'review-design', to: 'design-gate' },
			{ from: 'design-gate', to: 'draft-tasks' },
			{ from: 'draft-tasks', to: 'review-tasks' },
			{ from: 'review-tasks', to: 'tasks-gate' },
			{ from: 'tasks-gate', to: 'done' }
		]
	};
}

export function runFakeSupportSelfTest(): void {
	const runStore = new FakeRunStore();
	const artifactStore = new FakeArtifactStore();

	void (async () => {
		const created = await runStore.create({
			id: 'run-1',
			workflowId: 'workflow-1',
			snapshotHash: 'snapshot-1',
			currentNodeId: 'node-1',
			workspacePath: '/tmp/workspace'
		});
		await runStore.save({ ...created, status: 'running' });
		await runStore.appendEvent('run-1', { type: 'node_enter', ts: new Date().toISOString(), payload: {} });
		const loaded = await runStore.load('run-1');
		if (loaded.history === undefined || loaded.history.length !== 1) {
			throw new Error('FakeRunStore self-test failed');
		}

		await artifactStore.write('run-1', 'example.md', 'hello');
		const contents = await artifactStore.read('run-1', 'example.md');
		if (contents !== 'hello') {
			throw new Error('FakeArtifactStore self-test failed');
		}
	})().catch((error) => {
		throw error;
	});
}

