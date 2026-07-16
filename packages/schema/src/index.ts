import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };
export type JsonSchema = JsonValue;

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)])
);

export const JsonSchemaSchema: z.ZodType<JsonSchema> = JsonValueSchema;

export const InputDeclSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	required: z.boolean()
});

export type InputDecl = z.infer<typeof InputDeclSchema>;

export const EdgeSchema = z.object({
	from: z.string().min(1),
	to: z.string().min(1)
});

export type Edge = z.infer<typeof EdgeSchema>;

export const NodeBaseSchema = z.object({
	id: z.string().min(1),
	reads: z.array(z.string().min(1)),
	writes: z.array(z.string().min(1)),
	onError: z.string().min(1).optional()
});

export type NodeBase = z.infer<typeof NodeBaseSchema>;

const PromptReferenceSchema = z.object({
	ref: z.string().min(1),
	inputs: z.record(JsonValueSchema).optional()
});

const CustomToolReferenceSchema = z.union([
	z.string().min(1),
	z.object({
		ref: z.string().min(1),
		config: JsonValueSchema.optional()
	})
]);

export const AgentNodeSchema = NodeBaseSchema.extend({
	kind: z.literal('agent'),
	executor: z.enum(['pi', 'claude']).optional(),
	model: z.string().min(1).optional(),
	thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
	prompt: z.union([z.string().min(1), PromptReferenceSchema]),
	systemPrompt: z.string().nullable().optional(),
	template: z.string().min(1).optional(),
	skill: z.string().min(1).optional(),
	tools: z.array(z.string().min(1)).optional(),
	customTools: z.array(CustomToolReferenceSchema).optional(),
	timeout: z.string().min(1).optional(),
	capture: z
		.object({
			text: z.boolean().optional(),
			toolCalls: z.boolean().optional(),
			output: z
				.object({
					schema: JsonSchemaSchema,
					required: z.boolean()
				})
				.optional()
		})
		.optional()
});

export type AgentNode = z.infer<typeof AgentNodeSchema>;

export const GuardNodeSchema = NodeBaseSchema.extend({
	kind: z.literal('guard'),
	cases: z.array(
		z.object({
			when: z.string().min(1),
			goto: z.string().min(1)
		})
	),
	default: z.string().min(1).optional()
});

export type GuardNode = z.infer<typeof GuardNodeSchema>;

export const HumanNodeSchema = NodeBaseSchema.extend({
	kind: z.literal('human'),
	prompt: z.string().min(1),
	allowedSignals: z.array(z.string().min(1)).min(1),
	payloadSchema: JsonSchemaSchema.optional(),
	timeout: z
		.object({
			after: z.string().min(1),
			signal: z.string().min(1)
		})
		.optional()
});

export type HumanNode = z.infer<typeof HumanNodeSchema>;

export const ScriptNodeSchema = NodeBaseSchema.extend({
	kind: z.literal('script'),
	handler: z.string().min(1),
	shell: z.string().min(1).optional(),
	config: JsonValueSchema.optional(),
	timeout: z.string().min(1).optional()
});

export type ScriptNode = z.infer<typeof ScriptNodeSchema>;

export const NodeDefSchema = z.discriminatedUnion('kind', [
	AgentNodeSchema,
	GuardNodeSchema,
	HumanNodeSchema,
	ScriptNodeSchema
]);

export type NodeDef = z.infer<typeof NodeDefSchema>;

export const WorkflowDefSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	version: z.string().min(1).optional(),
	description: z.string().optional(),
	entry: z.string().min(1),
	inputs: z.array(InputDeclSchema),
	artifacts: z.array(z.string().min(1)),
	nodes: z.array(NodeDefSchema),
	edges: z.array(EdgeSchema)
});

export type WorkflowDef = z.infer<typeof WorkflowDefSchema>;

export const workflowJsonSchema: JsonSchema = zodToJsonSchema(WorkflowDefSchema, {
	name: 'WorkflowDef'
}) as JsonSchema;

export interface RunInputBindings {
	[name: string]: JsonValue;
}

export type RunStatus = 'pending' | 'running' | 'waiting_human' | 'interrupted' | 'succeeded' | 'failed' | 'aborted';

export interface RunEventBase {
	seq: number;
	type: string;
	ts: string;
	payload: JsonObject;
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

export interface PendingHumanInteraction {
	runId: string;
	nodeId: string;
	prompt: string;
	allowedSignals: string[];
	payloadSchema?: JsonSchema;
	deadline?: string | null;
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
	signal?: string;
	contextPatch?: Record<string, unknown>;
	message?: string;
}

export interface ToolContext<Config = unknown> {
	config: Config;
	run: { id: string; workflow: string; startedAt: string };
	node: { id: string; config: Config };
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

export interface ToolDef<Config = unknown, Input = unknown, Output = unknown> {
	name: string;
	description: string;
	parameters: JsonSchema;
	execute: (ctx: ToolContext<Config> & { input: Input }) => Promise<Output>;
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

export interface AgentRunOutcome {
	status: 'ok' | 'failed';
	text?: string;
	toolCalls?: unknown[];
	data?: unknown;
	usage?: { tokens?: number; cost?: number };
	error?: unknown;
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

export interface PromptLibraryEntry {
	id: string;
	body: string;
	description?: string;
	inputs?: Record<string, JsonSchema>;
	defaults?: Record<string, JsonValue>;
	model?: string;
	tools?: string[];
}

export interface TemplateLibraryEntry {
	id: string;
	content: string;
}

export interface WorkflowLibraryEntry {
	id: string;
	workflow: WorkflowDef;
}

export interface LibraryResolver {
	resolvePrompt(id: string): Promise<PromptLibraryEntry | null>;
	resolveTemplate(id: string): Promise<TemplateLibraryEntry | null>;
	resolveTool<Config = unknown, Input = unknown, Output = unknown>(
		id: string
	): Promise<ToolDef<Config, Input, Output> | null>;
	resolveWorkflow(id: string): Promise<WorkflowLibraryEntry | null>;
}

export const schemaContracts = {
	workflow: null as unknown as WorkflowDef,
	input: null as unknown as InputDecl,
	edge: null as unknown as Edge,
	nodeBase: null as unknown as NodeBase,
	node: null as unknown as NodeDef,
	agentNode: null as unknown as AgentNode,
	guardNode: null as unknown as GuardNode,
	humanNode: null as unknown as HumanNode,
	scriptNode: null as unknown as ScriptNode,
	runState: null as unknown as RunState,
	runStore: null as unknown as RunStore,
	artifactStore: null as unknown as ArtifactStore,
	clock: null as unknown as Clock,
	agentExecutor: null as unknown as AgentExecutor,
	agentRunSpec: null as unknown as AgentRunSpec,
	agentRunHandlers: null as unknown as AgentRunHandlers,
	agentRunOutcome: null as unknown as AgentRunOutcome,
	libraryResolver: null as unknown as LibraryResolver,
	scriptContext: null as unknown as ScriptContext,
	scriptResult: null as unknown as ScriptResult,
	scriptHandler: null as unknown as ScriptHandler,
	toolDef: null as unknown as ToolDef,
	toolContext: null as unknown as ToolContext,
	agentResult: null as unknown as AgentResult,
	humanResult: null as unknown as HumanResult
} as const;

