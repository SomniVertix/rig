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
  typeName: 'relentless.api.WorkflowsService',
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
  typeName: 'relentless.api.PromptsService',
  methods: {
    list: { name: 'List', kind: 'unary', inputType: 'PromptListRequest', outputType: 'PromptListResponse' },
    get: { name: 'Get', kind: 'unary', inputType: 'PromptGetRequest', outputType: 'PromptGetResponse' },
    validate: { name: 'Validate', kind: 'unary', inputType: 'PromptValidateRequest', outputType: 'PromptValidateResponse' }
  }
} as const satisfies ServiceDescriptor;

export const RunsService = {
  typeName: 'relentless.api.RunsService',
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
  typeName: 'relentless.api.ArtifactsService',
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
} as const;export interface ValidationIssue {
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
  typeName: 'relentless.api.WorkflowsService',
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
  typeName: 'relentless.api.PromptsService',
  methods: {
    list: { name: 'List', kind: 'unary', inputType: 'PromptListRequest', outputType: 'PromptListResponse' },
    get: { name: 'Get', kind: 'unary', inputType: 'PromptGetRequest', outputType: 'PromptGetResponse' },
    validate: { name: 'Validate', kind: 'unary', inputType: 'PromptValidateRequest', outputType: 'PromptValidateResponse' }
  }
} as const satisfies ServiceDescriptor;

export const RunsService = {
  typeName: 'relentless.api.RunsService',
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
  typeName: 'relentless.api.ArtifactsService',
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
  typeName: 'relentless.api.WorkflowsService',
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
  typeName: 'relentless.api.PromptsService',
  methods: {
    list: { name: 'List', kind: 'unary', inputType: 'PromptListRequest', outputType: 'PromptListResponse' },
    get: { name: 'Get', kind: 'unary', inputType: 'PromptGetRequest', outputType: 'PromptGetResponse' },
    validate: { name: 'Validate', kind: 'unary', inputType: 'PromptValidateRequest', outputType: 'PromptValidateResponse' }
  }
} as const satisfies ServiceDescriptor;

export const RunsService = {
  typeName: 'relentless.api.RunsService',
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
  typeName: 'relentless.api.ArtifactsService',
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

message WorkflowGetRequest {
  string id = 1;
}

message WorkflowGetResponse {
  WorkflowDocument workflow = 1;
}

message WorkflowValidateRequest {
  string yaml = 1;
}

message WorkflowValidateResponse {
  bool valid = 1;
  repeated string warnings = 2;
  repeated ValidationIssue issues = 3;
}

message WorkflowCreateRequest {
  WorkflowDocument workflow = 1;
}

message WorkflowCreateResponse {
  WorkflowSummary workflow = 1;
}

message WorkflowUpdateRequest {
  WorkflowDocument workflow = 1;
}

message WorkflowUpdateResponse {
  WorkflowSummary workflow = 1;
}

message WorkflowSnapshotDiffRequest {
  string id = 1;
  string snapshot_hash = 2;
}

message WorkflowSnapshotDiffResponse {
  string diff = 1;
}

message PromptSummary {
  string id = 1;
  string description = 2;
}

message PromptListRequest {}

message PromptListResponse {
  repeated PromptSummary prompts = 1;
}

message PromptGetRequest {
  string id = 1;
}

message PromptGetResponse {
  string id = 1;
  string body = 2;
  string description = 3;
}

message PromptValidateRequest {
  string id = 1;
  string body = 2;
}

message PromptValidateResponse {
  bool valid = 1;
  repeated ValidationIssue issues = 2;
}

message RunInputBinding {
  string path = 1;
  string contents = 2;
}

message RunSummary {
  string id = 1;
  string workflow_id = 2;
  string status = 3;
  string current_node_id = 4;
  string started_at = 5;
  string ended_at = 6;
  string ended_at_node = 7;
}

message RunsStartRequest {
  string workflow_id = 1;
  map<string, RunInputBinding> inputs = 2;
}

message RunsStartResponse {
  RunSummary run = 1;
}

message RunsGetRequest {
  string run_id = 1;
}

message RunsGetResponse {
  RunSummary run = 1;
}

message RunsListRequest {}

message RunsListResponse {
  repeated RunSummary runs = 1;
}

message RunsAbortRequest {
  string run_id = 1;
}

message RunsAbortResponse {
  RunSummary run = 1;
}

message RunsDeleteRequest {
  string run_id = 1;
}

message RunsDeleteResponse {}

message RunsSignalRequest {
  string run_id = 1;
  string signal = 2;
  string payload_json = 3;
}

message RunsSignalResponse {
  string signal = 1;
  string payload_json = 2;
}

message RunsEventsRequest {
  string run_id = 1;
  uint64 since_offset = 2;
}

message RunEvent {
  uint64 seq = 1;
  string kind = 2;
  string node_id = 3;
  string signal = 4;
  string text = 5;
  string tool_name = 6;
  string payload_json = 7;
  string message = 8;
  string error = 9;
}

message ArtifactReadRequest {
  string run_id = 1;
  string name = 2;
}

message ArtifactReadResponse {
  string contents = 1;
}

message ArtifactMetadataRequest {
  string run_id = 1;
  string name = 2;
}

message ArtifactMetadataResponse {
  string path = 1;
  string content_hash = 2;
  uint64 version = 3;
  string authoring_node = 4;
  string ts = 5;
}

service WorkflowsService {
  rpc List(WorkflowListRequest) returns (WorkflowListResponse);
  rpc Get(WorkflowGetRequest) returns (WorkflowGetResponse);
  rpc Validate(WorkflowValidateRequest) returns (WorkflowValidateResponse);
  rpc Create(WorkflowCreateRequest) returns (WorkflowCreateResponse);
  rpc Update(WorkflowUpdateRequest) returns (WorkflowUpdateResponse);
  rpc SnapshotDiff(WorkflowSnapshotDiffRequest) returns (WorkflowSnapshotDiffResponse);
}

service PromptsService {
  rpc List(PromptListRequest) returns (PromptListResponse);
  rpc Get(PromptGetRequest) returns (PromptGetResponse);
  rpc Validate(PromptValidateRequest) returns (PromptValidateResponse);
}

service RunsService {
  rpc Start(RunsStartRequest) returns (RunsStartResponse);
  rpc Get(RunsGetRequest) returns (RunsGetResponse);
  rpc List(RunsListRequest) returns (RunsListResponse);
  rpc Abort(RunsAbortRequest) returns (RunsAbortResponse);
  rpc Delete(RunsDeleteRequest) returns (RunsDeleteResponse);
  rpc Signal(RunsSignalRequest) returns (RunsSignalResponse);
  rpc Events(RunsEventsRequest) returns (stream RunEvent);
}

service ArtifactsService {
  rpc Read(ArtifactReadRequest) returns (ArtifactReadResponse);
  rpc Metadata(ArtifactMetadataRequest) returns (ArtifactMetadataResponse);
}
`;

const generatedSource = String.raw`export interface ValidationIssue {
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
  typeName: 'relentless.api.WorkflowsService',
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
  typeName: 'relentless.api.PromptsService',
  methods: {
    list: { name: 'List', kind: 'unary', inputType: 'PromptListRequest', outputType: 'PromptListResponse' },
    get: { name: 'Get', kind: 'unary', inputType: 'PromptGetRequest', outputType: 'PromptGetResponse' },
    validate: { name: 'Validate', kind: 'unary', inputType: 'PromptValidateRequest', outputType: 'PromptValidateResponse' }
  }
} as const satisfies ServiceDescriptor;

export const RunsService = {
  typeName: 'relentless.api.RunsService',
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
  typeName: 'relentless.api.ArtifactsService',
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
`;

function writeIfChanged(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) {
    return;
  }
  fs.writeFileSync(filePath, contents);
}

writeIfChanged(protoPath, protoSource);
writeIfChanged(generatedPath, generatedSource);