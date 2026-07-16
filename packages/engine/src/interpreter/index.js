import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { evaluateGuardExpression, renderTemplate } from '../template/index.js';
import { validateWorkflow } from '../validator/index.js';
const execFileAsync = promisify(execFile);
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}
function nowIso(clock) {
    return (clock ?? { now: () => new Date() }).now().toISOString();
}
function parseDurationMs(value) {
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
            return amount * 60000;
        case 'h':
            return amount * 3600000;
        default:
            return undefined;
    }
}
function workflowNodeMap(workflow) {
    return new Map(workflow.nodes.map((node) => [node.id, node]));
}
function outgoingEdgesMap(workflow) {
    const map = new Map();
    for (const edge of workflow.edges) {
        const edges = map.get(edge.from) ?? [];
        edges.push(edge);
        map.set(edge.from, edges);
    }
    return map;
}
function nodePreview(node) {
    return { id: node.id, kind: node.kind };
}
function cloneContext(context) {
    return cloneJson(context ?? {});
}
function mergeContext(context, patch, key) {
    if (patch === undefined) {
        return context;
    }
    const next = cloneJson(context);
    next[key] = cloneJson(patch);
    return next;
}
function toJsonValue(value) {
    return cloneJson(value);
}
function buildNodeSnapshots(history) {
    const snapshots = {};
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
function buildTemplateContext(runState, node, deps, nodes, prev) {
    const artifactStore = deps.artifactStore;
    const allowedReads = new Set(node.reads);
    const allowedWrites = new Set(node.writes);
    const artifacts = {
        async read(name) {
            if (!allowedReads.has(name) && !allowedWrites.has(name)) {
                throw new Error(`Artifact '${name}' is not declared on node '${node.id}'`);
            }
            if (artifactStore === undefined) {
                throw new Error(`Artifact store is unavailable for '${name}'`);
            }
            return await artifactStore.read(runState.id, name);
        },
        async exists(name) {
            if (!allowedReads.has(name) && !allowedWrites.has(name)) {
                return false;
            }
            if (artifactStore === undefined) {
                return false;
            }
            return await artifactStore.exists(runState.id, name);
        },
        async write(name, contents) {
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
async function recordEvent(deps, runState, localHistory, type, payload) {
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
async function persistRunState(deps, runState) {
    if (deps.runStore !== undefined) {
        await deps.runStore.save(runState);
    }
}
async function maybeAutoResolveHuman(runState, node, deps, options) {
    if (options.submission !== undefined) {
        const resolved = deps.runStore === undefined ? { signal: options.submission.signal, output: options.submission.payload } : await deps.runStore.takePendingHuman(runState.id, options.submission);
        return { resolved, submission: options.submission };
    }
    const pending = runState.pendingHuman;
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
async function loadPromptText(node, deps, runState, nodes) {
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
    const promptContext = {
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
async function renderAgentPrompt(node, deps, runState, nodes, prev) {
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
async function runAgentNode(node, runState, deps, nodes, prev) {
    if (deps.executor === undefined) {
        throw new Error(`Agent executor is unavailable for node '${node.id}'`);
    }
    const prompt = await renderAgentPrompt(node, deps, runState, nodes, prev);
    const timeoutMs = parseDurationMs(node.timeout);
    const controller = new AbortController();
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(new Error(`Agent node '${node.id}' timed out`)), timeoutMs);
    let emittedOutput = false;
    try {
        const handlers = {
            onEmitOutput(output) {
                emittedOutput = true;
                nodes[node.id] = { ...(nodes[node.id] ?? {}), output, status: 'ok' };
            }
        };
        const spec = {
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
        const outcome = {
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
                await deps.artifactStore.write(runState.id, writes[0], executorOutcome.text);
            }
            else if (isPlainObject(executorOutcome.data)) {
                for (const [artifactName, contents] of Object.entries(executorOutcome.data)) {
                    if (typeof contents !== 'string' || !writes.includes(artifactName)) {
                        continue;
                    }
                    await deps.artifactStore.write(runState.id, artifactName, contents);
                }
            }
        }
        return { outcome, emittedOutput };
    }
    finally {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
    }
}
async function executeScriptNode(node, runState, deps, nodes, prev) {
    const scriptContext = {
        node: { id: node.id, config: node.config },
        run: { id: runState.id, workflow: runState.workflowId, startedAt: runState.startedAt },
        context: cloneContext(runState.context),
        prev,
        artifacts: buildTemplateContext(runState, node, deps, nodes, prev).artifacts,
        log: {
            info() { },
            warn() { },
            error() { }
        },
        shell: async (command, options) => {
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
function buildFailureResult(runState, nodeId, reason) {
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
function buildSuccessResult(runState, nodeId) {
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
async function routeFailure(runState, node, deps, reason, nodes) {
    runState.context = mergeContext(runState.context, { nodeId: node.id, reason }, '_lastError');
    nodes[node.id] = { ...(nodes[node.id] ?? {}), status: 'failed' };
    await recordEvent(deps, runState, runState.history ?? [], 'error', { nodeId: node.id, reason });
    if ((node.onError ?? '').length > 0) {
        runState.currentNodeId = node.onError;
        await persistRunState(deps, runState);
        return { kind: 'advance', runState, nextNodeId: node.onError, reason };
    }
    const result = buildFailureResult(runState, node.id, reason);
    await persistRunState(deps, result.runState);
    return result;
}
async function interpretInternal(workflow, initialRunState, deps, options = {}) {
    const validation = validateWorkflow(workflow);
    if (!validation.ok || validation.workflow === undefined) {
        throw new Error(validation.issues.map((issue) => `${issue.rule}: ${issue.message}`).join('; '));
    }
    const workflowDef = validation.workflow;
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
    let prev;
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
        executions += 1;
        runState.totalNodeExecutions = executions;
        await recordEvent(deps, runState, localHistory, 'node_enter', { nodeId: node.id, kind: node.kind, status: 'running' });
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
                let selected;
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
export async function interpret(workflow, runState, deps = {}, options = {}) {
    return await interpretInternal(workflow, runState, deps, options);
}
export async function resumeHuman(workflow, runState, submission, deps = {}) {
    return await interpretInternal(workflow, runState, deps, { submission });
}
export function createInterpreter(deps = {}) {
    return {
        interpret: async (workflow, runState, options = {}) => await interpretInternal(workflow, runState, deps, options),
        resumeHuman: async (workflow, runState, submission) => await interpretInternal(workflow, runState, deps, { submission })
    };
}
