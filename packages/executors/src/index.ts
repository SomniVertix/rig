import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface AgentRunSpec {
	cwd: string;
	model?: string;
	thinkingLevel?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
	systemPrompt?: string | null;
	prompt: string;
	tools: string[];
	customTools: Array<string | { ref: string; config?: JsonValue }>;
	skill?: string;
	signal: AbortSignal;
	timeoutMs?: number;
	capture?: {
		text?: boolean;
		toolCalls?: boolean;
		output?: { schema: JsonValue; required: boolean };
	};
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

function raceWithAbort<T>(work: Promise<T>, signal: AbortSignal, timeoutMs?: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
		const abortHandler = (): void => {
			cleanup();
			reject(signal.reason ?? new Error('Agent execution aborted'));
		};
		const cleanup = (): void => {
			signal.removeEventListener('abort', abortHandler);
			if (timeoutHandle !== undefined) {
				clearTimeout(timeoutHandle);
			}
		};
		signal.addEventListener('abort', abortHandler, { once: true });
		if (timeoutMs !== undefined) {
			timeoutHandle = setTimeout(() => {
				cleanup();
				reject(new Error(`Agent execution timed out after ${timeoutMs}ms`));
			}, timeoutMs);
		}
		void work
			.then((result) => {
				cleanup();
				resolve(result);
			})
			.catch((error) => {
				cleanup();
				reject(error);
			});
	});
}

async function maybeInvokeCustomTools(spec: AgentRunSpec, handlers: AgentRunHandlers): Promise<void> {
	for (const tool of spec.customTools) {
		if (typeof tool === 'string') {
			continue;
		}
		if (handlers.onCustomToolCall !== undefined) {
			const result = await handlers.onCustomToolCall(tool.ref, tool.config);
			handlers.onToolStart?.(tool.ref, tool.config);
			handlers.onToolEnd?.(tool.ref, result);
		}
	}
}

export class PiExecutor implements AgentExecutor {
	readonly kind: 'pi' = 'pi';
	readonly capabilities: ExecutorCapabilities = {
		supportsCustomTools: true,
		supportsStructuredOutput: true,
		supportsStreaming: true
	};

	constructor(
		private readonly sessionFactory?: (
			spec: AgentRunSpec,
			handlers: AgentRunHandlers
		) => Promise<AgentRunOutcome> | AgentRunOutcome
	) {}

	async run(spec: AgentRunSpec, handlers: AgentRunHandlers): Promise<AgentRunOutcome> {
		if (this.sessionFactory !== undefined) {
			return raceWithAbort(Promise.resolve(this.sessionFactory(spec, handlers)), spec.signal, spec.timeoutMs);
		}

		const outcome = await raceWithAbort(
			(async () => {
				try {
					const dynamicImport = new Function('specifier', 'return import(specifier)') as (
						specifier: string
					) => Promise<Record<string, unknown>>;
					const mod = await dynamicImport('@earendil-works/pi-coding-agent');
					const createAgentSession = mod.createAgentSession;
					if (typeof createAgentSession !== 'function') {
						throw new Error('Pi coding agent library does not export createAgentSession');
					}
					const session = await (createAgentSession as (spec: AgentRunSpec, handlers: AgentRunHandlers) => Promise<AgentRunOutcome> | AgentRunOutcome)(spec, handlers);
					await maybeInvokeCustomTools(spec, handlers);
					return await Promise.resolve(session);
				} catch (error) {
					return { status: 'failed' as const, error };
				}
			})(),
			spec.signal,
			spec.timeoutMs
		);
		return outcome;
	}
}

export class ClaudeExecutor implements AgentExecutor {
	readonly kind: 'claude' = 'claude';
	readonly capabilities: ExecutorCapabilities = {
		supportsCustomTools: false,
		supportsStructuredOutput: false,
		supportsStreaming: true
	};

	constructor(private readonly spawnCommand = spawn) {}

	async run(spec: AgentRunSpec, handlers: AgentRunHandlers): Promise<AgentRunOutcome> {
		return raceWithAbort(
			new Promise<AgentRunOutcome>((resolve) => {
				const child = this.spawnCommand('claude', ['--json'], {
					cwd: spec.cwd,
					signal: spec.signal
				});
				let buffer = '';
				child.stdout?.on('data', (chunk: Buffer) => {
					buffer += chunk.toString('utf8');
					const lines = buffer.split(/\r?\n/);
					buffer = lines.pop() ?? '';
					for (const line of lines) {
						if (line.trim().length === 0) {
							continue;
						}
						try {
							const message = JSON.parse(line) as Record<string, unknown>;
							if (typeof message.text === 'string') {
								handlers.onText?.(message.text);
							}
							if (typeof message.thinking === 'string') {
								handlers.onThinking?.(message.thinking);
							}
							if (message.emit_output !== undefined) {
								handlers.onEmitOutput?.(message.emit_output);
							}
						} catch (error) {
							handlers.onText?.(line);
						}
					}
				});
				child.on('close', (code) => {
					resolve({ status: code === 0 ? 'ok' : 'failed' });
				});
				child.on('error', (error) => {
					resolve({ status: 'failed', error });
				});
			}),
			spec.signal,
			spec.timeoutMs
		);
	}
}

export async function runExecutorSmokeDelay(milliseconds = 1): Promise<void> {
	await delay(milliseconds);
}

