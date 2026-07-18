import { pathToFileURL } from 'node:url';

import { startDaemon } from './main.js';
import { loadServerConfig } from './config/index.js';
import { createServerScheduler } from './scheduler/index.js';

export async function runCli(argv = process.argv.slice(2)): Promise<number> {
	const command = argv[0] ?? 'serve';
	if (command !== 'serve') {
		console.error(`Unknown command: ${command}`);
		return 1;
	}

	const configIndex = argv.indexOf('--config');
	const configPath = configIndex >= 0 ? argv[configIndex + 1] : undefined;
	const config = await loadServerConfig(configPath === undefined ? {} : { configPath });
	const daemon = await startDaemon({ config });
	const scheduler = createServerScheduler(daemon.composition);
	await scheduler.start();
	console.log(`rig server started with ${daemon.config.defaultExecutor} executor`);

	let shuttingDown = false;
	const shutdown = async (signal: string): Promise<void> => {
		if (shuttingDown) {
			return;
		}
		shuttingDown = true;
		console.log(`received ${signal}, shutting down`);
		await scheduler.stop();
		await daemon.close();
		process.exit(0);
	};
	process.on('SIGTERM', () => void shutdown('SIGTERM'));
	process.on('SIGINT', () => void shutdown('SIGINT'));

	return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	void runCli().then((exitCode) => {
		if (exitCode !== 0) {
			process.exitCode = exitCode;
		}
	});
}