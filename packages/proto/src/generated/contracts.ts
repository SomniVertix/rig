export interface ValidationIssue {
  rule: string;
  nodeId: string;
  field: string;
  message: string;
}

export interface WorkflowDocument {
  id: string;
  yaml: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  version?: string;
  description?: string;
}

export interface WorkflowListRequest {}

export interface WorkflowListResponse {
  workflows: WorkflowSummary[];
}

export interface WorkflowGetRequest {
  id: string;
}

export interface WorkflowGetResponse {
  workflow: WorkflowDocument;
}

export interface WorkflowValidateRequest {
  yaml: string;
}

export interface WorkflowValidateResponse {
  valid: boolean;
  warnings: string[];
  issues: ValidationIssue[];
}

export interface WorkflowCreateRequest {
  workflow: WorkflowDocument;
}

export interface WorkflowCreateResponse {
  workflow: WorkflowSummary;
}

export interface WorkflowUpdateRequest {
  workflow: WorkflowDocument;
}

export interface WorkflowUpdateResponse {
  workflow: WorkflowSummary;
}

export interface WorkflowSnapshotDiffRequest {
  id: string;
  snapshotHash: string;
}

export interface WorkflowSnapshotDiffResponse {
  diff: string;
}

export interface PromptSummary {
  id: string;
  description?: string;
}

export interface PromptListRequest {}

export interface PromptListResponse {
  prompts: PromptSummary[];
}

export interface PromptGetRequest {
  id: string;
}

export interface PromptGetResponse {
  id: string;
  body: string;
  description?: string;
}

export interface PromptValidateRequest {
  id: string;
  body: string;
}

export interface PromptValidateResponse {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface RunInputBinding {
  path?: string;
  contents?: string;
}

export interface RunSummary {
  id: string;
  workflowId: string;
  status: string;
  currentNodeId: string;
  startedAt: string;
  endedAt?: string;
  endedAtNode?: string;
}

export interface RunsStartRequest {
  workflowId: string;
  inputs: Record<string, RunInputBinding>;
}

export interface RunsStartResponse {
  run: RunSummary;
}

export interface RunsGetRequest {
  runId: string;
}

export interface RunsGetResponse {
  run: RunSummary;
}

export interface RunsListRequest {}

export interface RunsListResponse {
  runs: RunSummary[];
}

export interface RunsAbortRequest {
  runId: string;
}

export interface RunsAbortResponse {
  run: RunSummary;
}

export interface RunsDeleteRequest {
  runId: string;
}

export interface RunsDeleteResponse {}

export interface RunsSignalRequest {
  runId: string;
  signal: string;
  payloadJson?: string;
}

export interface RunsSignalResponse {
  signal: string;
  payloadJson?: string;
}

export interface RunsEventsRequest {
  runId: string;
  sinceOffset: bigint | number;
}

export interface RunEventBase {
  seq: bigint | number;
  kind: string;
}

export interface NodeEnterEvent extends RunEventBase {
  kind: 'node_enter';
  nodeId: string;
}

export interface NodeExitEvent extends RunEventBase {
  kind: 'node_exit';
  nodeId: string;
  status: 'ok' | 'failed';
}

export interface AgentTextDeltaEvent extends RunEventBase {
  kind: 'agent_text_delta';
  nodeId: string;
  text: string;
}

export interface ToolExecutionStartEvent extends RunEventBase {
  kind: 'tool_execution_start';
  nodeId: string;
  toolName: string;
}

export interface ToolExecutionEndEvent extends RunEventBase {
  kind: 'tool_execution_end';
  nodeId: string;
  toolName: string;
}

export interface EmitOutputEvent extends RunEventBase {
  kind: 'emit_output';
  nodeId: string;
  payloadJson?: string;
}

export interface HumanPendingEvent extends RunEventBase {
  kind: 'human_pending';
  nodeId: string;
}

export interface SignalReceivedEvent extends RunEventBase {
  kind: 'signal_received';
  nodeId: string;
  signal: string;
}

export interface RunEndedEvent extends RunEventBase {
  kind: 'run_ended';
  nodeId: string;
  status: 'succeeded' | 'failed' | 'aborted';
}

export interface ErrorEvent extends RunEventBase {
  kind: 'error';
  nodeId?: string;
  error: string;
}

export type RunEvent =
  | NodeEnterEvent
  | NodeExitEvent
  | AgentTextDeltaEvent
  | ToolExecutionStartEvent
  | ToolExecutionEndEvent
  | EmitOutputEvent
  | HumanPendingEvent
  | SignalReceivedEvent
  | RunEndedEvent
  | ErrorEvent;

export interface ArtifactReadRequest {
  runId: string;
  name: string;
}

export interface ArtifactReadResponse {
  contents: string;
}

export interface ArtifactMetadataRequest {
  runId: string;
  name: string;
}

export interface ArtifactMetadataResponse {
  path: string;
  contentHash: string;
  version: bigint | number;
  authoringNode: string;
  ts: string;
}

export interface RpcMethodDescriptor {
  name: string;
  kind: 'unary' | 'server_streaming';
  inputType: string;
  outputType: string;
}

export interface ServiceDescriptor {
  typeName: string;
  methods: Record<string, RpcMethodDescriptor>;
}

export const WorkflowsService = {
  typeName: 'rig.api.WorkflowsService',
  methods: {
    list: { name: 'List', kind: 'unary', inputType: 'WorkflowListRequest', outputType: 'WorkflowListResponse' },
    get: { name: 'Get', kind: 'unary', inputType: 'WorkflowGetRequest', outputType: 'WorkflowGetResponse' },
    validate: { name: 'Validate', kind: 'unary', inputType: 'WorkflowValidateRequest', outputType: 'WorkflowValidateResponse' },
    create: { name: 'Create', kind: 'unary', inputType: 'WorkflowCreateRequest', outputType: 'WorkflowCreateResponse' },
    update: { name: 'Update', kind: 'unary', inputType: 'WorkflowUpdateRequest', outputType: 'WorkflowUpdateResponse' },
    snapshotDiff: { name: 'SnapshotDiff', kind: 'unary', inputType: 'WorkflowSnapshotDiffRequest', outputType: 'WorkflowSnapshotDiffResponse' }
  }
} as const satisfies ServiceDescriptor;

export const PromptsService = {
  typeName: 'rig.api.PromptsService',
  methods: {
    list: { name: 'List', kind: 'unary', inputType: 'PromptListRequest', outputType: 'PromptListResponse' },
    get: { name: 'Get', kind: 'unary', inputType: 'PromptGetRequest', outputType: 'PromptGetResponse' },
    validate: { name: 'Validate', kind: 'unary', inputType: 'PromptValidateRequest', outputType: 'PromptValidateResponse' }
  }
} as const satisfies ServiceDescriptor;

export const RunsService = {
  typeName: 'rig.api.RunsService',
  methods: {
    start: { name: 'Start', kind: 'unary', inputType: 'RunsStartRequest', outputType: 'RunsStartResponse' },
    get: { name: 'Get', kind: 'unary', inputType: 'RunsGetRequest', outputType: 'RunsGetResponse' },
    list: { name: 'List', kind: 'unary', inputType: 'RunsListRequest', outputType: 'RunsListResponse' },
    abort: { name: 'Abort', kind: 'unary', inputType: 'RunsAbortRequest', outputType: 'RunsAbortResponse' },
    delete: { name: 'Delete', kind: 'unary', inputType: 'RunsDeleteRequest', outputType: 'RunsDeleteResponse' },
    signal: { name: 'Signal', kind: 'unary', inputType: 'RunsSignalRequest', outputType: 'RunsSignalResponse' },
    events: { name: 'Events', kind: 'server_streaming', inputType: 'RunsEventsRequest', outputType: 'RunEvent' }
  }
} as const satisfies ServiceDescriptor;

export const ArtifactsService = {
  typeName: 'rig.api.ArtifactsService',
  methods: {
    read: { name: 'Read', kind: 'unary', inputType: 'ArtifactReadRequest', outputType: 'ArtifactReadResponse' },
    metadata: { name: 'Metadata', kind: 'unary', inputType: 'ArtifactMetadataRequest', outputType: 'ArtifactMetadataResponse' }
  }
} as const satisfies ServiceDescriptor;

export const services = {
  workflows: WorkflowsService,
  prompts: PromptsService,
  runs: RunsService,
  artifacts: ArtifactsService
} as const;