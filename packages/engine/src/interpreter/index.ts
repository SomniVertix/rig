import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { evaluateGuardExpression, renderTemplate, type TemplateContext } from '../template/index.js';
import { validateWorkflow } from '../validator/index.js';

const execFileAsync = promisify(execFile);

type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface Edge {
	from: string;
	to: string;
}

export interface NodeBase {
	id: string;
	reads: string[];
	writes: string[];
	onError?: string;
}

export interface AgentNode extends NodeBase {
	kind: 'agent';
	prompt: string | { ref: string; inputs?: Record<string, JsonValue> };
	executor?: 'pi' | 'claude';
	model?: string;
	thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
	systemPrompt?: string | null;
	template?: string;
	skill?: string;
	tools?: string[];
	customTools?: Array<string | { ref: string; config?: JsonValue }>;
	timeout?: string;
	capture?: {
		text?: boolean;
		toolCalls?: boolean;
		output?: { schema: JsonValue; required: boolean };
	};
}

export interface GuardNode extends NodeBase {
	kind: 'guard';
	cases: Array<{ when: string; goto: string }>;
	default?: string;
}

export interface HumanNode extends NodeBase {
	kind: 'human';
	prompt: string;
	allowedSignals: string[];
	payloadSchema?: JsonValue;
	timeout?: { after: string; signal: string };
}

export interface ScriptNode extends NodeBase {
	kind: 'script';
	handler: string;
	shell?: string;
	config?: JsonValue;
	timeout?: string;
}

export type WorkflowNode = AgentNode | GuardNode | HumanNode | ScriptNode;

export interface WorkflowDef {
	id: string;
	name: string;
	version?: string;
	description?: string;
	entry: string;
	inputs: Array<{ name: string; description?: string; required: boolean }>;
	artifacts: string[];
	nodes: WorkflowNode[];
	edges: Edge[];
}

export interface RunInputBindings {
	[name: string]: JsonValue;
}

export type RunStatus = 'pending' | 'running' | 'waiting_human' | 'interrupted' | 'succeeded' | 'failed' | 'aborted';

export interface RunEventBase {
	seq: number;
	type: string;
	ts: string;
	payload: { [key: string]: JsonValue };
}

export interface PendingHumanInteraction {
	runId: string;
	nodeId: string;
	prompt: string;
	allowedSignals: string[];
	payloadSchema?: JsonValue;
	deadline?: string | null;
	resolvedAt?: string | null;
	resolvedSignal?: string | null;
	resolvedPayload?: JsonValue;
}

export interface HumanResult {
	signal: string;
	output?: unknown;
	contextPatch?: Record<string, unknown>;
}

export interface AgentResult {
	status: 'ok' | 'failed';
	output?: {
		text?: string;
		toolCalls?: unknown[];
		data?: unknown;
	};
	contextPatch?: Record<string, unknown>;
	message?: string;
	error?: unknown;
}

export interface AgentRunSpec {
	cwd: string;
	model?: string;
	thinkingLevel?: AgentNode['thinkingLevel'];
	systemPrompt?: string | null;
	prompt: string;
	tools: string[];
	customTools: Array<string | { ref: string; config?: JsonValue }>;
	skill?: string;
	signal: AbortSignal;
	timeoutMs?: number;
	capture?: AgentNode['capture'];
	nodeId?: string;
}

export interface AgentRunHandlers {
	onText?(chunk: string): void;
	onThinking?(chunk: string): void;
	onToolStart?(name: string, input: unknown): void;
	onToolEnd?(name: string, output: unknown): void;
	onCustomToolCall?(name: string, input: unknown): Promise<unknown>;
	onEmitOutput?(output: unknown): void;
}

export interface ExecutorCapabilities {
	supportsCustomTools: boolean;
	supportsStructuredOutput: boolean;
	supportsStreaming: boolean;
}

export interface AgentExecutor {
	readonly kind: 'pi' | 'claude';
	readonly capabilities: ExecutorCapabilities;
	run(spec: AgentRunSpec, handlers: AgentRunHandlers): Promise<AgentRunOutcome>;
}

export interface AgentRunOutcome {
	status: 'ok' | 'failed';
	text?: string;
	toolCalls?: unknown[];
	data?: unknown;
	usage?: { tokens?: number; cost?: number };
	error?: unknown;
}

export interface ArtifactMeta {
	runId: string;
	name: string;
	path: string;
	contentHash: string;
	version: number;
	authoringNode: string;
	ts: string;
}

export interface ArtifactStore {
	read(runId: string, name: string): Promise<string>;
	write(runId: string, name: string, contents: string): Promise<void>;
	exists(runId: string, name: string): Promise<boolean>;
	metadata(runId: string, name: string): Promise<ArtifactMeta>;
}

export interface Clock {
	now(): Date;
}

export interface RunState {
	id: string;
	workflowId: string;
	snapshotHash: string;
	status: RunStatus;
	currentNodeId: string;
	context: Record<string, JsonValue>;
	startedAt: string;
	endedAt?: string | null;
	endedAtNode?: string | null;
	inputs?: RunInputBindings;
	workspacePath?: string;
	claim?: { claimedBy: string; claimedAt: string } | null;
	pendingHuman?: PendingHumanInteraction | null;
	history?: RunEventBase[];
	totalNodeExecutions?: number;
}

export interface RunCreateInput {
	id: string;
	workflowId: string;
	snapshotHash: string;
	currentNodeId: string;
	context?: Record<string, JsonValue>;
	inputs?: RunInputBindings;
	workspacePath: string;
	status?: RunStatus;
}

export interface RunStore {
	create(run: RunCreateInput): Promise<RunState>;
	load(runId: string): Promise<RunState>;
	save(runState: RunState): Promise<void>;
	appendEvent(runId: string, event: Omit<RunEventBase, 'seq'>): Promise<{ seq: number }>;
	claimRunnable(cap: number): Promise<RunState | null>;
	listInterrupted(): Promise<RunState[]>;
	putPendingHuman(...args: unknown[]): Promise<void>;
	takePendingHuman(runId: string, submission: { signal: string; payload?: JsonValue }): Promise<HumanResult>;
}

export interface ScriptContext<Config = unknown> {
	node: { id: string; config: Config };
	run: { id: string; workflow: string; startedAt: string };
	context: Readonly<Record<string, JsonValue>>;
	prev?: { nodeId: string; output: unknown; signal?: string };
	artifacts: {
		read(name: string): Promise<string>;
		exists(name: string): Promise<boolean>;
		write(name: string, contents: string): Promise<void>;
	};
	log: { info(message: string): void; warn(message: string): void; error(message: string): void };
	shell: (command: string, options?: unknown) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
	fetch: typeof globalThis.fetch;
	signal: AbortSignal;
}

export interface ScriptResult<Output = unknown> {
	contextPatch?: Record<string, unknown>;
	output?: Output;
	signal?: string;
	status?: 'ok' | 'failed';
	message?: string;
}

export type ScriptHandler<Config = unknown, Output = unknown> = (
	ctx: ScriptContext<Config>
) => Promise<ScriptResult<Output>>;

export interface LibraryResolver {
	resolvePrompt(id: string): Promise<{ id: string; body: string; description?: string; inputs?: Record<string, JsonValue>; defaults?: Record<string, JsonValue>; model?: string; tools?: string[] } | null>;
	resolveTemplate(id: string): Promise<{ id: string; content: string } | null>;
	resolveTool<Config = unknown, Input = unknown, Output = unknown>(id: string): Promise<{ name: string; description: string; parameters: JsonValue; execute: (ctx: { config: Config; input: Input; run: { id: string }; node: { id: string } }) => Promise<Output> } | null>;
	resolveWorkflow(id: string): Promise<{ id: string; workflow: WorkflowDef } | null>;
}

type WorkflowNodeMap = Record<string, { output?: unknown; signal?: string; status?: string }>;

export interface HumanSubmission {
	signal: string;
	payload?: JsonValue;
}

export interface InterpreterDependencies {
	runStore?: RunStore;
	artifactStore?: ArtifactStore;
	libraryResolver?: LibraryResolver;
	executor?: AgentExecutor;
	clock?: Clock;
	maxNodeExecutions?: number;
	scriptHandlers?: Record<string, ScriptHandler>;
}

export interface NextAction {
	kind: 'advance' | 'suspended' | 'succeeded' | 'failed';
	runState: RunState;
	nextNodeId?: string;
	reason?: string;
}

export interface InterpreterOptions {
	submission?: HumanSubmission;
}

export interface Interpreter {
	interpret(workflow: WorkflowDef, runState: RunState, options?: InterpreterOptions): Promise<NextAction>;
	resumeHuman(workflow: WorkflowDef, runState: RunState, submission: HumanSubmission): Promise<NextAction>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function nowIso(clock: Clock | undefined): string {
	return (clock ?? { now: () => new Date() }).now().toISOString();
}

function parseDurationMs(value: string | undefined): number | undefined {
	if (value === undefined) {
		return undefined;
	}
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return undefined;
	}
	if (/^\d+$/.test(trimmed)) {
		return Number(trimmed);
	}
	const match = trimmed.match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/i);
	if (match === null) {
		return undefined;
	}
	const amount = Number(match[1]);
	const unit = match[2];
	if (unit === undefined) {
		return undefined;
	}
	switch (unit.toLowerCase()) {
		case 'ms':
			return amount;
		case 's':
			return amount * 1000;
		case 'm':
			return amount * 60_000;
		case 'h':
			return amount * 3_600_000;
		default:
			return undefined;
	}
}

function workflowNodeMap(workflow: WorkflowDef): Map<string, WorkflowNode> {
	return new Map(workflow.nodes.map((node) => [node.id, node]));
}

function outgoingEdgesMap(workflow: WorkflowDef): Map<string, WorkflowDef['edges']> {
	const map = new Map<string, WorkflowDef['edges']>();
	for (const edge of workflow.edges) {
		const edges = map.get(edge.from) ?? [];
		edges.push(edge);
		map.set(edge.from, edges);
	}
	return map;
}

function nodePreview(node: WorkflowNode): { id: string; kind: string } {
	return { id: node.id, kind: node.kind };
}

function cloneContext(context: Record<string, JsonValue> | undefined): Record<string, JsonValue> {
	return cloneJson(context ?? {});
}

function mergeContext(
	context: Record<string, JsonValue>,
	patch: Record<string, unknown> | undefined,
	key: '_lastAgent' | '_lastHuman' | '_lastError'
): Record<string, JsonValue> {
	if (patch === undefined) {
		return context;
	}
	const next = cloneJson(context);
	next[key] = cloneJson(patch) as JsonValue;
	return next;
}

function toJsonValue<T>(value: T): JsonValue {
	return cloneJson(value) as JsonValue;
}

function buildNodeSnapshots(history: RunState['history']): WorkflowNodeMap {
	const snapshots: WorkflowNodeMap = {};
	for (const entry of history ?? []) {
		const payload = entry.payload;
		if (!isPlainObject(payload) || typeof payload.nodeId !== 'string') {
			continue;
		}
		snapshots[payload.nodeId] = {
			output: payload.output,
			signal: typeof payload.signal === 'string' ? payload.signal : undefined,
			status: typeof payload.status === 'string' ? payload.status : undefined
		};
	}
	return snapshots;
}

function buildTemplateContext(
	runState: RunState,
	node: WorkflowNode,
	deps: InterpreterDependencies,
	nodes: Record<string, { output?: unknown; signal?: string; status?: string }>,
	prev?: { nodeId: string; output: unknown; signal?: string }
): TemplateContext {
	const artifactStore = deps.artifactStore;
	const allowedReads = new Set(node.reads);
	const allowedWrites = new Set(node.writes);
	const artifacts = {
		async read(name: string): Promise<string> {
			if (!allowedReads.has(name) && !allowedWrites.has(name)) {
				throw new Error(`Artifact '${name}' is not declared on node '${node.id}'`);
			}
			if (artifactStore === undefined) {
				throw new Error(`Artifact store is unavailable for '${name}'`);
			}
			return await artifactStore.read(runState.id, name);
		},
		async exists(name: string): Promise<boolean> {
			if (!allowedReads.has(name) && !allowedWrites.has(name)) {
				return false;
			}
			if (artifactStore === undefined) {
				return false;
			}
			return await artifactStore.exists(runState.id, name);
		},
		async write(name: string, contents: string): Promise<void> {
			if (!allowedWrites.has(name)) {
				throw new Error(`Artifact '${name}' is not writable from node '${node.id}'`);
			}
			if (artifactStore === undefined) {
				throw new Error(`Artifact store is unavailable for '${name}'`);
			}
			await artifactStore.write(runState.id, name, contents);
		}
	};

	return {
		context: cloneContext(runState.context),
		artifacts,
		run: {
			id: runState.id,
			workflow: runState.workflowId,
			startedAt: runState.startedAt
		},
		prev,
		nodes,
		node: nodePreview(node),
		inputs: cloneJson(runState.inputs ?? {})
	};
}

async function recordEvent(
	deps: InterpreterDependencies,
	runState: RunState,
	localHistory: NonNullable<RunState['history']>,
	type: string,
	payload: Record<string, JsonValue>
): Promise<void> {
	const event = { type, ts: nowIso(deps.clock), payload };
	if (deps.runStore === undefined) {
		localHistory.push({ seq: localHistory.length + 1, ...event });
		runState.history = localHistory;
		return;
	}
	const result = await deps.runStore.appendEvent(runState.id, event);
	localHistory.push({ seq: result.seq, ...event });
	runState.history = localHistory;
}

async function persistRunState(deps: InterpreterDependencies, runState: RunState): Promise<void> {
	if (deps.runStore !== undefined) {
		await deps.runStore.save(runState);
	}
}

async function maybeAutoResolveHuman(
	runState: RunState,
	node: HumanNode,
	deps: InterpreterDependencies,
	options: InterpreterOptions
): Promise<{ resolved: HumanResult; submission: HumanSubmission }> {
	if (options.submission !== undefined) {
		const resolved = deps.runStore === undefined ? { signal: options.submission.signal, output: options.submission.payload } : await deps.runStore.takePendingHuman(runState.id, options.submission);
		return { resolved, submission: options.submission };
	}

	const pending = runState.pendingHuman;
	if (pending?.resolvedAt !== undefined && pending.resolvedAt !== null) {
		const resolved = { signal: pending.resolvedSignal ?? '', output: pending.resolvedPayload };
		return { resolved, submission: { signal: resolved.signal, payload: pending.resolvedPayload } };
	}
	if (pending?.deadline !== undefined && pending.deadline !== null) {
		const deadline = new Date(pending.deadline).getTime();
		if (!Number.isNaN(deadline) && (deps.clock ?? { now: () => new Date() }).now().getTime() >= deadline && node.timeout !== undefined) {
			const timeoutSignal = node.timeout.signal;
			const resolved = deps.runStore === undefined
				? { signal: timeoutSignal, output: undefined }
				: await deps.runStore.takePendingHuman(runState.id, { signal: timeoutSignal });
			return { resolved, submission: { signal: timeoutSignal } };
		}
	}

	throw new Error(`Human node '${node.id}' is waiting for submission`);
}

async function loadPromptText(
	node: AgentNode,
	deps: InterpreterDependencies,
	runState: RunState,
	nodes: Record<string, { output?: unknown; signal?: string; status?: string }>
): Promise<{ prompt: string; systemPrompt?: string | null }> {
	if (typeof node.prompt === 'string') {
		return { prompt: node.prompt, systemPrompt: node.systemPrompt ?? null };
	}
	if (deps.libraryResolver === undefined) {
		throw new Error(`Prompt reference '${node.prompt.ref}' cannot be resolved without a library resolver`);
	}
	const entry = await deps.libraryResolver.resolvePrompt(node.prompt.ref);
	if (entry === null) {
		throw new Error(`Prompt '${node.prompt.ref}' was not found`);
	}
	const scope = buildTemplateContext(runState, node, deps, nodes, undefined);
	const promptContext: TemplateContext = {
		...scope,
		inputs: {
			...cloneJson(entry.defaults ?? {}),
			...cloneJson(node.prompt.inputs ?? {})
		}
	};
	return {
		prompt: renderTemplate(entry.body, promptContext),
		systemPrompt: node.systemPrompt ?? entry.description ?? null
	};
}

async function renderAgentPrompt(
	node: AgentNode,
	deps: InterpreterDependencies,
	runState: RunState,
	nodes: Record<string, { output?: unknown; signal?: string; status?: string }>,
	prev?: { nodeId: string; output: unknown; signal?: string }
): Promise<{ prompt: string; systemPrompt?: string | null; tools: string[] }> {
	const promptSource = await loadPromptText(node, deps, runState, nodes);
	let prompt = promptSource.prompt;
	let systemPrompt = promptSource.systemPrompt;
	const scope = buildTemplateContext(runState, node, deps, nodes, prev);
	prompt = renderTemplate(prompt, scope);
	if (node.template !== undefined) {
		if (deps.libraryResolver === undefined) {
			throw new Error(`Template '${node.template}' cannot be resolved without a library resolver`);
		}
		const templateEntry = await deps.libraryResolver.resolveTemplate(node.template);
		if (templateEntry === null) {
			throw new Error(`Template '${node.template}' was not found`);
		}
		const renderedTemplate = renderTemplate(templateEntry.content, scope);
		prompt = `${renderedTemplate}\n${prompt}`.trim();
	}
	return { prompt, systemPrompt, tools: node.tools ?? [] };
}

async function runAgentNode(
	node: AgentNode,
	runState: RunState,
	deps: InterpreterDependencies,
	nodes: WorkflowNodeMap,
	prev?: { nodeId: string; output: unknown; signal?: string }
): Promise<{ outcome: AgentResult; emittedOutput: boolean }> {
	if (deps.executor === undefined) {
		throw new Error(`Agent executor is unavailable for node '${node.id}'`);
	}
	const prompt = await renderAgentPrompt(node, deps, runState, nodes, prev);
	const timeoutMs = parseDurationMs(node.timeout);
	const controller = new AbortController();
	const timer = timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(new Error(`Agent node '${node.id}' timed out`)), timeoutMs);
	let emittedOutput = false;
	try {
		const handlers: AgentRunHandlers = {
			onEmitOutput(output: unknown): void {
				emittedOutput = true;
				nodes[node.id] = { ...(nodes[node.id] ?? {}), output, status: 'ok' };
			}
		};
		const spec: AgentRunSpec = {
			cwd: runState.workspacePath ?? process.cwd(),
			model: node.model,
			thinkingLevel: node.thinkingLevel,
			systemPrompt: prompt.systemPrompt ?? null,
			prompt: prompt.prompt,
			tools: prompt.tools,
			customTools: node.customTools ?? [],
			signal: controller.signal,
			timeoutMs,
			skill: node.skill,
			capture: node.capture,
			nodeId: node.id
		};
		const executorOutcome = await deps.executor.run(spec, handlers);
		const outcome: AgentResult = {
			status: executorOutcome.status,
			message: executorOutcome.error instanceof Error ? executorOutcome.error.message : typeof executorOutcome.error === 'string' ? executorOutcome.error : undefined,
			output: {
				text: executorOutcome.text,
				toolCalls: executorOutcome.toolCalls,
				data: executorOutcome.data
			}
		};
		if (deps.artifactStore !== undefined) {
			const writes = [...node.writes];
			if (writes.length === 1 && typeof executorOutcome.text === 'string') {
				await deps.artifactStore.write(runState.id, writes[0]!, executorOutcome.text);
			} else if (isPlainObject(executorOutcome.data)) {
				for (const [artifactName, contents] of Object.entries(executorOutcome.data)) {
					if (typeof contents !== 'string' || !writes.includes(artifactName)) {
						continue;
					}
					await deps.artifactStore.write(runState.id, artifactName, contents);
				}
			}
		}
		return { outcome, emittedOutput };
	} finally {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
	}
}

async function executeScriptNode(
	node: ScriptNode,
	runState: RunState,
	deps: InterpreterDependencies,
	nodes: WorkflowNodeMap,
	prev?: { nodeId: string; output: unknown; signal?: string }
): Promise<ScriptResult> {
	const scriptContext: ScriptContext = {
		node: { id: node.id, config: node.config },
		run: { id: runState.id, workflow: runState.workflowId, startedAt: runState.startedAt },
		context: cloneContext(runState.context),
		prev,
		artifacts: buildTemplateContext(runState, node, deps, nodes, prev).artifacts,
		log: {
			info(): void {},
			warn(): void {},
			error(): void {}
		},
		shell: async (command: string, options?: unknown): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
			const shell = node.shell ?? '/bin/sh';
			const resolved = await execFileAsync(shell, ['-lc', command], {
				...(isPlainObject(options) ? options : {})
			});
			return { stdout: String(resolved.stdout), stderr: String(resolved.stderr), exitCode: 0 };
		},
		fetch: globalThis.fetch.bind(globalThis),
		signal: new AbortController().signal
	};

	const handler = deps.scriptHandlers?.[node.handler];
	if (handler !== undefined) {
		return await handler(scriptContext);
	}

	const [modulePath = '', exportName = 'default'] = node.handler.split('#');
	if (modulePath.length === 0) {
		throw new Error(`Script handler '${node.handler}' is invalid`);
	}
	const resolvedPath = modulePath.startsWith('.') ? resolve(runState.workspacePath ?? process.cwd(), modulePath) : modulePath;
	const module = await import(pathToFileURL(resolvedPath).href);
	const exported = module[exportName] ?? module.default;
	if (typeof exported !== 'function') {
		throw new Error(`Script handler '${node.handler}' did not export a function`);
	}
	return await exported(scriptContext);
}

function buildFailureResult(runState: RunState, nodeId: string, reason: string): NextAction {
	return {
		kind: 'failed',
		runState: {
			...runState,
			status: 'failed',
			endedAt: runState.endedAt ?? new Date().toISOString(),
			endedAtNode: nodeId
		},
		reason
	};
}

function buildSuccessResult(runState: RunState, nodeId: string): NextAction {
	return {
		kind: 'succeeded',
		runState: {
			...runState,
			status: 'succeeded',
			endedAt: runState.endedAt ?? new Date().toISOString(),
			endedAtNode: nodeId
		}
	};
}

async function routeFailure(
	runState: RunState,
	node: WorkflowNode,
	deps: InterpreterDependencies,
	reason: string,
	nodes: WorkflowNodeMap
): Promise<NextAction> {
	runState.context = mergeContext(runState.context, { nodeId: node.id, reason }, '_lastError');
	nodes[node.id] = { ...(nodes[node.id] ?? {}), status: 'failed' };
	await recordEvent(deps, runState, runState.history ?? [], 'error', { nodeId: node.id, reason });
	if ((node.onError ?? '').length > 0) {
		runState.currentNodeId = node.onError!;
		await persistRunState(deps, runState);
		return { kind: 'advance', runState, nextNodeId: node.onError, reason };
	}
	const result = buildFailureResult(runState, node.id, reason);
	await persistRunState(deps, result.runState);
	return result;
}

async function interpretInternal(
	workflow: WorkflowDef,
	initialRunState: RunState,
	deps: InterpreterDependencies,
	options: InterpreterOptions = {}
): Promise<NextAction> {
	const validation = validateWorkflow(workflow);
	if (!validation.ok || validation.workflow === undefined) {
		throw new Error(validation.issues.map((issue) => `${issue.rule}: ${issue.message}`).join('; '));
	}

	const workflowDef = validation.workflow as unknown as WorkflowDef;
	const nodes = workflowNodeMap(workflowDef);
	const outgoingEdges = outgoingEdgesMap(workflowDef);
	const runState = {
		...initialRunState,
		context: cloneContext(initialRunState.context),
		history: cloneJson(initialRunState.history ?? [])
	};
	const localHistory = runState.history ?? [];
	const snapshots = buildNodeSnapshots(runState.history);
	const maxExecutions = deps.maxNodeExecutions ?? 1000;
	let executions = runState.totalNodeExecutions ?? 0;
	let prev: { nodeId: string; output: unknown; signal?: string } | undefined;

	for (;;) {
		if (executions >= maxExecutions) {
			const current = nodes.get(runState.currentNodeId) ?? { id: runState.currentNodeId, kind: 'script', reads: [], writes: [], handler: 'noop' };
			runState.totalNodeExecutions = executions;
			return await routeFailure(runState, current, deps, `Circuit breaker exceeded after ${executions} node executions`, snapshots);
		}

		const node = nodes.get(runState.currentNodeId);
		if (node === undefined) {
			return await routeFailure(runState, { id: runState.currentNodeId, kind: 'script', reads: [], writes: [], handler: 'noop' }, deps, `Current node '${runState.currentNodeId}' does not exist`, snapshots);
		}

		const outgoing = outgoingEdges.get(node.id) ?? [];

		// A human node whose currentNodeId still points here with a pendingHuman already
		// recorded is being *resumed* after a signal was submitted out-of-band (e.g. via the
		// scheduler reclaiming the run), not entered for the first time -- the original
		// 'node_enter' was already recorded when it first suspended.
		const isResumingHumanNode = node.kind === 'human' && runState.pendingHuman !== undefined && runState.pendingHuman !== null && runState.pendingHuman.nodeId === node.id;

		executions += 1;
		runState.totalNodeExecutions = executions;
		if (!isResumingHumanNode) {
			await recordEvent(deps, runState, localHistory, 'node_enter', { nodeId: node.id, kind: node.kind, status: 'running' });
		}

		switch (node.kind) {
			case 'agent': {
				const agentResult = await runAgentNode(node, runState, deps, snapshots, prev);
				const { outcome } = agentResult;
				if (outcome.status !== 'ok') {
					const reason = typeof outcome.error === 'string' ? outcome.error : outcome.error instanceof Error ? outcome.error.message : outcome.message ?? 'Agent execution failed';
					runState.totalNodeExecutions = executions;
					return await routeFailure(runState, node, deps, reason, snapshots);
				}
				if (node.capture?.output?.required === true && agentResult.emittedOutput !== true && outcome.output?.data === undefined) {
					runState.totalNodeExecutions = executions;
					return await routeFailure(runState, node, deps, 'Required emit_output output was not produced', snapshots);
				}
				runState.context = mergeContext(runState.context, { nodeId: node.id, output: outcome.output?.data ?? outcome.output?.text ?? null }, '_lastAgent');
				snapshots[node.id] = { output: outcome.output?.data ?? outcome.output?.text, status: 'ok' };
				await recordEvent(deps, runState, localHistory, 'node_exit', { nodeId: node.id, status: 'ok', output: toJsonValue(outcome.output?.data ?? outcome.output?.text ?? null) });
				const nextNodeId = outgoing[0]?.to;
				if (nextNodeId === undefined) {
					return buildSuccessResult(runState, node.id);
				}
				runState.currentNodeId = nextNodeId;
				prev = { nodeId: node.id, output: outcome.output?.data ?? outcome.output?.text ?? null };
				await persistRunState(deps, runState);
				continue;
			}
			case 'guard': {
				let selected: string | undefined;
				for (const entry of node.cases) {
					if (evaluateGuardExpression(entry.when, buildTemplateContext(runState, node, deps, snapshots, prev))) {
						selected = entry.goto;
						break;
					}
				}
				if (selected === undefined) {
					if (node.default === undefined) {
						return await routeFailure(runState, node, deps, `Guard '${node.id}' did not match any case`, snapshots);
					}
					selected = node.default;
				}
				runState.context = mergeContext(runState.context, { nodeId: node.id, output: selected, signal: prev?.signal ?? null }, '_lastAgent');
				snapshots[node.id] = { output: selected, signal: prev?.signal, status: 'ok' };
				await recordEvent(deps, runState, localHistory, 'node_exit', { nodeId: node.id, status: 'ok', output: selected, signal: prev?.signal ?? null });
				runState.currentNodeId = selected;
				await persistRunState(deps, runState);
				continue;
			}
			case 'human': {
				const humanNode = node;
				if (options.submission !== undefined && !humanNode.allowedSignals.includes(options.submission.signal)) {
					throw new Error(`Signal '${options.submission.signal}' is not in allowedSignals for human node '${humanNode.id}'`);
				}
				if (options.submission === undefined && (runState.pendingHuman === undefined || runState.pendingHuman === null)) {
					const deadline = humanNode.timeout === undefined ? undefined : new Date(Date.now() + (parseDurationMs(humanNode.timeout.after) ?? 0)).toISOString();
					if (deps.runStore !== undefined) {
						await deps.runStore.putPendingHuman(runState.id, humanNode.id, humanNode.prompt, humanNode.allowedSignals, humanNode.payloadSchema, deadline);
					}
					runState.pendingHuman = {
						runId: runState.id,
						nodeId: humanNode.id,
						prompt: humanNode.prompt,
						allowedSignals: [...humanNode.allowedSignals],
						payloadSchema: humanNode.payloadSchema,
						deadline: deadline ?? null
					};
					runState.status = 'waiting_human';
					runState.totalNodeExecutions = executions;
					await recordEvent(deps, runState, localHistory, 'human_pending', { nodeId: humanNode.id, prompt: humanNode.prompt, allowedSignals: toJsonValue(humanNode.allowedSignals) });
					await persistRunState(deps, runState);
					return { kind: 'suspended', runState, nextNodeId: humanNode.id, reason: 'waiting for human submission' };
				}

				const resolved = await maybeAutoResolveHuman(runState, humanNode, deps, options);
				const submission = resolved.submission;
				const humanResult = resolved.resolved;
				// Clear the submission after consuming it so we don't reuse it if we loop back to another human node
				options.submission = undefined;
				// Clear pendingHuman after resolving so the next human node will put a new one
				runState.pendingHuman = null;
				runState.status = 'running';
				prev = { nodeId: humanNode.id, output: humanResult.output ?? submission.payload ?? null, signal: humanResult.signal };
				runState.context = mergeContext(runState.context, { nodeId: humanNode.id, output: humanResult.output ?? submission.payload ?? null, signal: humanResult.signal }, '_lastHuman');
				snapshots[humanNode.id] = { output: humanResult.output ?? submission.payload, signal: humanResult.signal, status: 'ok' };
				await recordEvent(deps, runState, localHistory, 'signal_received', { nodeId: humanNode.id, signal: humanResult.signal, output: humanResult.output === undefined ? null : toJsonValue(humanResult.output) });
				const nextNodeId = outgoing[0]?.to;
				if (nextNodeId === undefined) {
					return buildSuccessResult(runState, humanNode.id);
				}
				runState.currentNodeId = nextNodeId;
				await persistRunState(deps, runState);
				continue;
			}
			case 'script': {
				const result = await executeScriptNode(node, runState, deps, snapshots, prev);
				if (result.status === 'failed') {
					return await routeFailure(runState, node, deps, result.message ?? 'Script execution failed', snapshots);
				}
				runState.context = mergeContext(runState.context, { nodeId: node.id, output: result.output ?? null, signal: result.signal ?? null }, '_lastAgent');
				snapshots[node.id] = { output: result.output, signal: result.signal, status: 'ok' };
				await recordEvent(deps, runState, localHistory, 'node_exit', { nodeId: node.id, status: 'ok', output: result.output === undefined ? null : toJsonValue(result.output), signal: result.signal ?? null });
				const nextNodeId = outgoing[0]?.to;
				if (nextNodeId === undefined) {
					return buildSuccessResult(runState, node.id);
				}
				runState.currentNodeId = nextNodeId;
				prev = { nodeId: node.id, output: result.output ?? null, signal: result.signal };
				await persistRunState(deps, runState);
				continue;
			}
		}
	}
}

export async function interpret(workflow: WorkflowDef, runState: RunState, deps: InterpreterDependencies = {}, options: InterpreterOptions = {}): Promise<NextAction> {
	return await interpretInternal(workflow, runState, deps, options);
}

export async function resumeHuman(workflow: WorkflowDef, runState: RunState, submission: HumanSubmission, deps: InterpreterDependencies = {}): Promise<NextAction> {
	return await interpretInternal(workflow, runState, deps, { submission });
}

export function createInterpreter(deps: InterpreterDependencies = {}): Interpreter {
	return {
		interpret: async (workflow: WorkflowDef, runState: RunState, options: InterpreterOptions = {}) => await interpretInternal(workflow, runState, deps, options),
		resumeHuman: async (workflow: WorkflowDef, runState: RunState, submission: HumanSubmission) => await interpretInternal(workflow, runState, deps, { submission })
	};
}