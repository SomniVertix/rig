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
};
export const PromptsService = {
    typeName: 'relentless.api.PromptsService',
    methods: {
        list: { name: 'List', kind: 'unary', inputType: 'PromptListRequest', outputType: 'PromptListResponse' },
        get: { name: 'Get', kind: 'unary', inputType: 'PromptGetRequest', outputType: 'PromptGetResponse' },
        validate: { name: 'Validate', kind: 'unary', inputType: 'PromptValidateRequest', outputType: 'PromptValidateResponse' }
    }
};
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
};
export const ArtifactsService = {
    typeName: 'relentless.api.ArtifactsService',
    methods: {
        read: { name: 'Read', kind: 'unary', inputType: 'ArtifactReadRequest', outputType: 'ArtifactReadResponse' },
        metadata: { name: 'Metadata', kind: 'unary', inputType: 'ArtifactMetadataRequest', outputType: 'ArtifactMetadataResponse' }
    }
};
export const services = {
    workflows: WorkflowsService,
    prompts: PromptsService,
    runs: RunsService,
    artifacts: ArtifactsService
};
