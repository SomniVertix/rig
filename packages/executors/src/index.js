import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
function raceWithAbort(work, signal, timeoutMs) {
    return new Promise((resolve, reject) => {
        let timeoutHandle;
        const abortHandler = () => {
            cleanup();
            reject(signal.reason ?? new Error('Agent execution aborted'));
        };
        const cleanup = () => {
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
async function maybeInvokeCustomTools(spec, handlers) {
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
export class PiExecutor {
    constructor(sessionFactory) {
        Object.defineProperty(this, "sessionFactory", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: sessionFactory
        });
        Object.defineProperty(this, "kind", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'pi'
        });
        Object.defineProperty(this, "capabilities", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {
                supportsCustomTools: true,
                supportsStructuredOutput: true,
                supportsStreaming: true
            }
        });
    }
    async run(spec, handlers) {
        if (this.sessionFactory !== undefined) {
            return raceWithAbort(Promise.resolve(this.sessionFactory(spec, handlers)), spec.signal, spec.timeoutMs);
        }
        const outcome = await raceWithAbort((async () => {
            try {
                const dynamicImport = new Function('specifier', 'return import(specifier)');
                const mod = await dynamicImport('@earendil-works/pi-coding-agent');
                const createAgentSession = mod.createAgentSession;
                if (typeof createAgentSession !== 'function') {
                    throw new Error('Pi coding agent library does not export createAgentSession');
                }
                const session = await createAgentSession(spec, handlers);
                await maybeInvokeCustomTools(spec, handlers);
                return await Promise.resolve(session);
            }
            catch (error) {
                return { status: 'failed', error };
            }
        })(), spec.signal, spec.timeoutMs);
        return outcome;
    }
}
export class ClaudeExecutor {
    constructor(spawnCommand = spawn) {
        Object.defineProperty(this, "spawnCommand", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: spawnCommand
        });
        Object.defineProperty(this, "kind", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'claude'
        });
        Object.defineProperty(this, "capabilities", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {
                supportsCustomTools: false,
                supportsStructuredOutput: false,
                supportsStreaming: true
            }
        });
    }
    async run(spec, handlers) {
        return raceWithAbort(new Promise((resolve) => {
            const child = this.spawnCommand('claude', ['--json'], {
                cwd: spec.cwd,
                signal: spec.signal
            });
            let buffer = '';
            child.stdout?.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    if (line.trim().length === 0) {
                        continue;
                    }
                    try {
                        const message = JSON.parse(line);
                        if (typeof message.text === 'string') {
                            handlers.onText?.(message.text);
                        }
                        if (typeof message.thinking === 'string') {
                            handlers.onThinking?.(message.thinking);
                        }
                        if (message.emit_output !== undefined) {
                            handlers.onEmitOutput?.(message.emit_output);
                        }
                    }
                    catch (error) {
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
        }), spec.signal, spec.timeoutMs);
    }
}
export async function runExecutorSmokeDelay(milliseconds = 1) {
    await delay(milliseconds);
}
