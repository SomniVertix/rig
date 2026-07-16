import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
export const JsonValueSchema = z.lazy(() => z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)]));
export const JsonSchemaSchema = JsonValueSchema;
export const InputDeclSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    required: z.boolean()
});
export const EdgeSchema = z.object({
    from: z.string().min(1),
    to: z.string().min(1)
});
export const NodeBaseSchema = z.object({
    id: z.string().min(1),
    reads: z.array(z.string().min(1)),
    writes: z.array(z.string().min(1)),
    onError: z.string().min(1).optional()
});
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
export const GuardNodeSchema = NodeBaseSchema.extend({
    kind: z.literal('guard'),
    cases: z.array(z.object({
        when: z.string().min(1),
        goto: z.string().min(1)
    })),
    default: z.string().min(1).optional()
});
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
export const ScriptNodeSchema = NodeBaseSchema.extend({
    kind: z.literal('script'),
    handler: z.string().min(1),
    shell: z.string().min(1).optional(),
    config: JsonValueSchema.optional(),
    timeout: z.string().min(1).optional()
});
export const NodeDefSchema = z.discriminatedUnion('kind', [
    AgentNodeSchema,
    GuardNodeSchema,
    HumanNodeSchema,
    ScriptNodeSchema
]);
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
export const workflowJsonSchema = zodToJsonSchema(WorkflowDefSchema, {
    name: 'WorkflowDef'
});
export const schemaContracts = {
    workflow: null,
    input: null,
    edge: null,
    nodeBase: null,
    node: null,
    agentNode: null,
    guardNode: null,
    humanNode: null,
    scriptNode: null,
    runState: null,
    runStore: null,
    artifactStore: null,
    clock: null,
    agentExecutor: null,
    agentRunSpec: null,
    agentRunHandlers: null,
    agentRunOutcome: null,
    libraryResolver: null,
    scriptContext: null,
    scriptResult: null,
    scriptHandler: null,
    toolDef: null,
    toolContext: null,
    agentResult: null,
    humanResult: null
};
