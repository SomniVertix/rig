import { setTimeout as delay } from 'node:timers/promises';

import type { RunState } from '@relentless/schema';

import type { ServerComposition } from '../composition/index.js';

export interface SchedulerOptions {
	pollIntervalMs?: number;
}

export class ServerScheduler {
	private running = false;
	private workers: Promise<void>[] = [];

	constructor(
		private readonly composition: ServerComposition,
		private readonly options: SchedulerOptions = {}
	) {}

	async recoverInterrupted(): Promise<void> {
		const interrupted = await this.composition.runStore.listInterrupted();
		for (const run of interrupted) {
			await this.composition.runStore.save({ ...run, status: 'interrupted' });
		}
	}

	async start(): Promise<void> {
		if (this.running) {
			return;
		}
		this.running = true;
		await this.recoverInterrupted();
		const workerCount = Math.max(1, this.composition.config.concurrencyCap);
		this.workers = Array.from({ length: workerCount }, async () => await this.workerLoop());
	}

	async stop(): Promise<void> {
		this.running = false;
		await Promise.all(this.workers);
		this.workers = [];
	}

	async runOnce(): Promise<boolean> {
		const claimed = await this.composition.runStore.claimRunnable(1);
		if (claimed === null) {
			return false;
		}
		await this.executeRun(claimed);
		return true;
	}

	private async workerLoop(): Promise<void> {
		while (this.running) {
			const claimed = await this.composition.runStore.claimRunnable(1);
			if (claimed === null) {
				await delay(this.options.pollIntervalMs ?? 100);
				continue;
			}
			await this.executeRun(claimed);
		}
	}

	private async executeRun(runState: RunState): Promise<void> {
		const workflowEntry = await this.composition.libraryResolver.resolveWorkflow(runState.workflowId);
		if (workflowEntry === null) {
			await this.composition.runStore.save({
				...runState,
				status: 'failed',
				endedAt: new Date().toISOString(),
				endedAtNode: runState.currentNodeId
			});
			return;
		}

		let currentState = runState;
		let action = await this.composition.engine.interpret(workflowEntry.workflow, currentState);
		while (action.kind === 'advance') {
			currentState = action.runState;
			action = await this.composition.engine.interpret(workflowEntry.workflow, currentState);
		}
		await this.composition.runStore.save(action.runState);
	}
}

export function createServerScheduler(composition: ServerComposition, options: SchedulerOptions = {}): ServerScheduler {
	return new ServerScheduler(composition, options);
}