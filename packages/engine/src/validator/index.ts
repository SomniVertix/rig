import { z } from 'zod';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)])
);

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

export type NodeDef = AgentNode | GuardNode | HumanNode | ScriptNode;

export interface WorkflowDef {
	id: string;
	name: string;
	version?: string;
	description?: string;
	entry: string;
	inputs: Array<{ name: string; description?: string; required: boolean }>;
	artifacts: string[];
	nodes: NodeDef[];
	edges: Edge[];
}

const EdgeSchema = z.object({
	from: z.string().min(1),
	to: z.string().min(1)
});

const NodeBaseSchema = z.object({
	id: z.string().min(1),
	reads: z.array(z.string().min(1)),
	writes: z.array(z.string().min(1)),
	onError: z.string().min(1).optional()
});

const AgentNodeSchema = NodeBaseSchema.extend({
	kind: z.literal('agent')
	,
	prompt: z.union([
		z.string().min(1),
		z.object({ ref: z.string().min(1), inputs: z.record(JsonValueSchema).optional() })
	]),
	executor: z.enum(['pi', 'claude']).optional(),
	model: z.string().min(1).optional(),
	thinkingLevel: z.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
	systemPrompt: z.string().nullable().optional(),
	template: z.string().min(1).optional(),
	skill: z.string().min(1).optional(),
	tools: z.array(z.string().min(1)).optional(),
	customTools: z.array(z.union([z.string().min(1), z.object({ ref: z.string().min(1), config: JsonValueSchema.optional() })])).optional(),
	timeout: z.string().min(1).optional(),
	capture: z
		.object({
			text: z.boolean().optional(),
			toolCalls: z.boolean().optional(),
			output: z
				.object({
					schema: JsonValueSchema,
					required: z.boolean()
				})
				.optional()
		})
		.optional()
});

const GuardNodeSchema = NodeBaseSchema.extend({
	kind: z.literal('guard'),
	cases: z.array(z.object({ when: z.string().min(1), goto: z.string().min(1) })),
	default: z.string().min(1).optional()
});

const HumanNodeSchema = NodeBaseSchema.extend({
	kind: z.literal('human'),
	prompt: z.string().min(1),
	allowedSignals: z.array(z.string().min(1)).min(1),
	payloadSchema: JsonValueSchema.optional(),
	timeout: z.object({ after: z.string().min(1), signal: z.string().min(1) }).optional()
});

const ScriptNodeSchema = NodeBaseSchema.extend({
	kind: z.literal('script'),
	handler: z.string().min(1),
	shell: z.string().min(1).optional(),
	config: JsonValueSchema.optional(),
	timeout: z.string().min(1).optional()
});

const NodeDefSchema = z.discriminatedUnion('kind', [AgentNodeSchema, GuardNodeSchema, HumanNodeSchema, ScriptNodeSchema]);

const WorkflowDefSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	version: z.string().min(1).optional(),
	description: z.string().optional(),
	entry: z.string().min(1),
	inputs: z.array(z.object({ name: z.string().min(1), description: z.string().optional(), required: z.boolean() })),
	artifacts: z.array(z.string().min(1)),
	nodes: z.array(NodeDefSchema),
	edges: z.array(EdgeSchema)
});

export interface ValidationIssue {
	rule: string;
	message: string;
	nodeId?: string;
	field?: string;
	edge?: { from: string; to?: string };
}

export interface ValidationResult {
	ok: boolean;
	warnings: ValidationIssue[];
	issues: ValidationIssue[];
	workflow?: WorkflowDef;
}

function issue(rule: string, message: string, extra: Omit<ValidationIssue, 'rule' | 'message'> = {}): ValidationIssue {
	return { rule, message, ...extra };
}

function isCatchAllExpression(expression: string): boolean {
	const normalized = expression.trim().toLowerCase();
	return normalized === 'true' || normalized === '{{ true }}';
}

function nodeById(workflow: WorkflowDef): Map<string, NodeDef> {
	return new Map(workflow.nodes.map((node) => [node.id, node]));
}

function outgoingEdges(workflow: WorkflowDef): Map<string, Edge[]> {
	const map = new Map<string, Edge[]>();
	for (const edge of workflow.edges) {
		const edges = map.get(edge.from) ?? [];
		edges.push(edge);
		map.set(edge.from, edges);
	}
	return map;
}

function combinedOutgoingEdges(workflow: WorkflowDef, edges: Map<string, Edge[]>): Map<string, Edge[]> {
	const map = new Map<string, Edge[]>();
	for (const [from, list] of edges) {
		map.set(from, [...list]);
	}
	for (const node of workflow.nodes) {
		if (node.kind !== 'guard') {
			continue;
		}
		const existing = map.get(node.id) ?? [];
		const targets = new Set(existing.map((edge) => edge.to));
		const combined = [...existing];
		for (const entry of node.cases) {
			if (!targets.has(entry.goto)) {
				combined.push({ from: node.id, to: entry.goto });
				targets.add(entry.goto);
			}
		}
		if (node.default !== undefined && !targets.has(node.default)) {
			combined.push({ from: node.id, to: node.default });
			targets.add(node.default);
		}
		map.set(node.id, combined);
	}
	return map;
}

function reachableNodeIds(workflow: WorkflowDef, nodes: Map<string, NodeDef>, edges: Map<string, Edge[]>): Set<string> {
	const reachable = new Set<string>();
	const queue = [workflow.entry];

	while (queue.length > 0) {
		const current = queue.shift();
		if (current === undefined || reachable.has(current) || !nodes.has(current)) {
			continue;
		}
		reachable.add(current);
		for (const edge of edges.get(current) ?? []) {
			queue.push(edge.to);
		}
	}

	return reachable;
}

function downstreamGuardCases(
	startNodeId: string,
	nodes: Map<string, NodeDef>,
	edges: Map<string, Edge[]>
): Set<string> {
	const cases = new Set<string>();
	const queue = [...(edges.get(startNodeId) ?? []).map((edge) => edge.to)];
	const visited = new Set<string>();

	while (queue.length > 0) {
		const nodeId = queue.shift();
		if (nodeId === undefined || visited.has(nodeId)) {
			continue;
		}
		visited.add(nodeId);
		const node = nodes.get(nodeId);
		if (node === undefined) {
			continue;
		}
		if (node.kind === 'guard') {
			for (const entry of node.cases) {
				cases.add(entry.when.trim());
			}
			if (node.default !== undefined) {
				cases.add('default');
			}
		}
		for (const edge of edges.get(nodeId) ?? []) {
			queue.push(edge.to);
		}
	}

	return cases;
}

function validateReads(workflow: WorkflowDef, nodes: Map<string, NodeDef>, edges: Map<string, Edge[]>): ValidationIssue[] {
	const inputs = new Set(workflow.inputs.map((input) => input.name));
	const issues: ValidationIssue[] = [];
	const queue: Array<{ nodeId: string; available: Set<string> }> = [
		{ nodeId: workflow.entry, available: new Set(inputs) }
	];
	const seen = new Map<string, Set<string>>();

	while (queue.length > 0) {
		const current = queue.shift();
		if (current === undefined) {
			continue;
		}
		const node = nodes.get(current.nodeId);
		if (node === undefined) {
			continue;
		}

		const previous = seen.get(node.id);
		if (previous !== undefined) {
			let changed = false;
			for (const value of current.available) {
				if (!previous.has(value)) {
					previous.add(value);
					changed = true;
				}
			}
			if (!changed) {
				continue;
			}
		} else {
			seen.set(node.id, new Set(current.available));
		}

		for (const read of node.reads) {
			if (!current.available.has(read)) {
				issues.push(issue('reads', `Node '${node.id}' reads '${read}' before it is available`, { nodeId: node.id, field: 'reads' }));
			}
		}

		const nextAvailable = new Set(current.available);
		for (const write of node.writes) {
			nextAvailable.add(write);
		}

		for (const edge of edges.get(node.id) ?? []) {
			queue.push({ nodeId: edge.to, available: new Set(nextAvailable) });
		}
	}

	return issues;
}

export function validateWorkflow(input: unknown): ValidationResult {
	const parsed = WorkflowDefSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			warnings: [],
			issues: parsed.error.issues.map((zodIssue) =>
				issue('structure', zodIssue.message, { field: zodIssue.path.join('.') || undefined })
			)
		};
	}

	const workflow = parsed.data;
	const nodes = nodeById(workflow);
	const edges = outgoingEdges(workflow);
	const combinedEdges = combinedOutgoingEdges(workflow, edges);
	const issues: ValidationIssue[] = [];
	const warnings: ValidationIssue[] = [];

	if (!nodes.has(workflow.entry)) {
		issues.push(issue('entry', `Entry node '${workflow.entry}' does not exist`, { field: 'entry' }));
	}

	for (const edge of workflow.edges) {
		if (!nodes.has(edge.from)) {
			issues.push(issue('edge', `Edge source '${edge.from}' does not exist`, { edge: { from: edge.from, to: edge.to } }));
		}
		if (!nodes.has(edge.to)) {
			issues.push(issue('edge', `Edge target '${edge.to}' does not exist`, { edge: { from: edge.from, to: edge.to } }));
		}
	}

	for (const node of workflow.nodes) {
		if (node.onError !== undefined && !nodes.has(node.onError)) {
			issues.push(issue('dangling-ref', `Node '${node.id}' onError references unknown node '${node.onError}'`, { nodeId: node.id, field: 'onError' }));
		}
		if (node.kind === 'guard') {
			for (const entry of node.cases) {
				if (!nodes.has(entry.goto)) {
					issues.push(issue('dangling-ref', `Guard '${node.id}' case '${entry.when}' targets unknown node '${entry.goto}'`, { nodeId: node.id, field: 'cases' }));
				}
			}
			if (node.default !== undefined && !nodes.has(node.default)) {
				issues.push(issue('dangling-ref', `Guard '${node.id}' default targets unknown node '${node.default}'`, { nodeId: node.id, field: 'default' }));
			}
		}
	}

	for (const node of workflow.nodes) {
		const outgoing = edges.get(node.id) ?? [];
		if (node.kind !== 'guard' && outgoing.length > 1) {
			issues.push(issue('outgoing', `Node '${node.id}' has more than one normal outgoing edge`, { nodeId: node.id, field: 'edges' }));
		}
		if (node.kind === 'guard' && node.default === undefined && !node.cases.some((entry) => isCatchAllExpression(entry.when))) {
			issues.push(issue('guard-default', `Guard '${node.id}' has no default or catch-all case`, { nodeId: node.id, field: 'default' }));
		}
	}

	const reachable = nodes.has(workflow.entry) ? reachableNodeIds(workflow, nodes, combinedEdges) : new Set<string>();
	for (const node of workflow.nodes) {
		if (!reachable.has(node.id)) {
			warnings.push(issue('unreachable', `Node '${node.id}' is unreachable from entry`, { nodeId: node.id }));
		}
	}

	if (reachable.size > 0 && !workflow.nodes.some((node) => reachable.has(node.id) && (combinedEdges.get(node.id) ?? []).length === 0)) {
		issues.push(issue('terminal', 'No terminal node is reachable from entry', { field: 'entry' }));
	}

	for (const node of workflow.nodes) {
		if (node.kind !== 'human') {
			continue;
		}
		const cases = downstreamGuardCases(node.id, nodes, combinedEdges);
		for (const signal of node.allowedSignals) {
			if (!cases.has(signal) && !cases.has('default')) {
				issues.push(issue('human-signal', `Signal '${signal}' from human node '${node.id}' is not covered downstream`, { nodeId: node.id, field: 'allowedSignals' }));
			}
		}
	}

	issues.push(...validateReads(workflow, nodes, combinedEdges));

	return { ok: issues.length === 0, warnings, issues, workflow: issues.length === 0 ? workflow : undefined };
}

export function assertValidWorkflow(input: unknown): WorkflowDef {
	const result = validateWorkflow(input);
	if (!result.ok || result.workflow === undefined) {
		throw new Error(result.issues.map((entry) => `${entry.rule}: ${entry.message}`).join('; ') || 'Workflow validation failed');
	}
	return result.workflow;
}

export { EdgeSchema, NodeDefSchema, WorkflowDefSchema };
