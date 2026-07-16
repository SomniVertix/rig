import type { ServerComposition } from './composition/index.js';
import { buildComposition } from './composition/index.js';
import { loadServerConfig, type ServerConfig } from './config/index.js';

export interface ServeOptions {
	config?: ServerConfig;
	compositionOverrides?: Parameters<typeof buildComposition>[1];
}

export interface DaemonHandle {
	config: ServerConfig;
	composition: ServerComposition;
	close(): Promise<void>;
}

export async function startDaemon(options: ServeOptions = {}): Promise<DaemonHandle> {
	const config = options.config ?? (await loadServerConfig());
	const composition = await buildComposition(config, options.compositionOverrides);
	return {
		config,
		composition,
		async close() {
			await composition.close();
		}
	};
}

export async function serve(options: ServeOptions = {}): Promise<DaemonHandle> {
	return await startDaemon(options);
}