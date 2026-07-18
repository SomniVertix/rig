import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import * as ts from 'typescript';
import { ZodError } from 'zod';

import { executorKindSchema, logLevelSchema, serverConfigSchema, type ServerConfig, type ServerConfigSource } from './schema.js';

const DEFAULT_CONFIG_FILE = 'rig.config.ts';

export class ConfigError extends Error {
	constructor(
		public readonly key: string,
		message: string
	) {
		super(message);
		this.name = 'ConfigError';
	}
}

function parseInteger(value: string | undefined, key: string): number | undefined {
	if (value === undefined || value.trim().length === 0) {
		return undefined;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new ConfigError(key, `Invalid ${key}: expected a positive integer`);
	}
	return parsed;
}

function parseStringList(value: string | undefined): string[] | undefined {
	if (value === undefined || value.trim().length === 0) {
		return undefined;
	}
	return value
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

async function loadTsModule(filePath: string): Promise<Record<string, unknown>> {
	const source = await readFile(filePath, 'utf8');
	const transpiled = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.ESNext,
			target: ts.ScriptTarget.ES2020,
			esModuleInterop: true
		},
		fileName: filePath
	}).outputText;
	const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(transpiled)}`;
	const module = (await import(moduleUrl)) as Record<string, unknown>;
	return module;
}

async function loadConfigFile(filePath: string): Promise<Record<string, unknown>> {
	try {
		if (filePath.endsWith('.json')) {
			return JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
		}
		if (filePath.endsWith('.ts')) {
			const module = await loadTsModule(filePath);
			return (module.default as Record<string, unknown> | undefined) ?? (module.config as Record<string, unknown> | undefined) ?? module;
		}
		const module = (await import(pathToFileURL(filePath).href)) as Record<string, unknown>;
		return (module.default as Record<string, unknown> | undefined) ?? (module.config as Record<string, unknown> | undefined) ?? module;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return {};
		}
		throw error;
	}
}

function normalizeConfig(raw: Record<string, unknown>, source: ServerConfigSource): ServerConfig {
	const workspaceRoot = source.workspaceRoot ?? process.env.RIG_WORKSPACE_ROOT ?? (typeof raw.workspaceRoot === 'string' ? raw.workspaceRoot : undefined) ?? process.cwd();
	const databaseUrl = source.env?.DATABASE_URL ?? process.env.DATABASE_URL ?? (typeof raw.databaseUrl === 'string' ? raw.databaseUrl : undefined);
	if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
		throw new ConfigError('DATABASE_URL', 'DATABASE_URL is required');
	}

	const candidate = {
		workspaceRoot,
		databaseUrl,
		concurrencyCap:
			parseInteger(source.env?.RIG_CONCURRENCY_CAP ?? process.env.RIG_CONCURRENCY_CAP, 'concurrencyCap') ??
			(typeof raw.concurrencyCap === 'number' ? raw.concurrencyCap : undefined) ??
			4,
		// discovery-schema claim recovery: hours before a waypoint claim goes stale
		// and becomes reclaimable in the same atomic claim UPDATE (no separate steal
		// step). Not stored in the database -- claimed_at is the only stored fact.
		claimTtlHours:
			parseInteger(source.env?.RIG_CLAIM_TTL ?? process.env.RIG_CLAIM_TTL, 'claimTtlHours') ??
			(typeof raw.claimTtlHours === 'number' ? raw.claimTtlHours : undefined) ??
			24,
		defaultTimeoutMs:
			parseInteger(source.env?.RIG_DEFAULT_TIMEOUT_MS ?? process.env.RIG_DEFAULT_TIMEOUT_MS, 'defaultTimeoutMs') ??
			(typeof raw.defaultTimeoutMs === 'number' ? raw.defaultTimeoutMs : undefined) ??
			60_000,
		librarySearchPaths:
			parseStringList(source.env?.RIG_LIBRARY_SEARCH_PATHS ?? process.env.RIG_LIBRARY_SEARCH_PATHS) ??
			(Array.isArray(raw.librarySearchPaths) ? raw.librarySearchPaths.filter((entry): entry is string => typeof entry === 'string') : undefined) ??
			[],
		logLevel:
			logLevelSchema.safeParse(source.env?.RIG_LOG_LEVEL ?? process.env.RIG_LOG_LEVEL).success &&
			typeof (source.env?.RIG_LOG_LEVEL ?? process.env.RIG_LOG_LEVEL) === 'string'
				? (source.env?.RIG_LOG_LEVEL ?? process.env.RIG_LOG_LEVEL)
				: typeof raw.logLevel === 'string'
					? raw.logLevel
					: 'info',
		defaultExecutor:
			executorKindSchema.safeParse(source.env?.RIG_DEFAULT_EXECUTOR ?? process.env.RIG_DEFAULT_EXECUTOR).success &&
			typeof (source.env?.RIG_DEFAULT_EXECUTOR ?? process.env.RIG_DEFAULT_EXECUTOR) === 'string'
				? (source.env?.RIG_DEFAULT_EXECUTOR as ServerConfig['defaultExecutor'])
				: typeof raw.defaultExecutor === 'string'
					? raw.defaultExecutor
					: 'pi',
		defaultModel:
			typeof (source.env?.RIG_DEFAULT_MODEL ?? process.env.RIG_DEFAULT_MODEL) === 'string'
				? (source.env?.RIG_DEFAULT_MODEL ?? process.env.RIG_DEFAULT_MODEL)
				: typeof raw.defaultModel === 'string'
					? raw.defaultModel
					: undefined,
		maxNodeExecutions:
			parseInteger(source.env?.RIG_MAX_NODE_EXECUTIONS ?? process.env.RIG_MAX_NODE_EXECUTIONS, 'maxNodeExecutions') ??
			(typeof raw.maxNodeExecutions === 'number' ? raw.maxNodeExecutions : undefined) ??
			1000,
		mirrorRoot:
			typeof (source.env?.RIG_MIRROR_ROOT ?? process.env.RIG_MIRROR_ROOT) === 'string'
				? (source.env?.RIG_MIRROR_ROOT ?? process.env.RIG_MIRROR_ROOT)
				: typeof raw.mirrorRoot === 'string'
					? raw.mirrorRoot
					: undefined,
		actorsDir:
			typeof (source.env?.RIG_ACTORS_DIR ?? process.env.RIG_ACTORS_DIR) === 'string'
				? (source.env?.RIG_ACTORS_DIR ?? process.env.RIG_ACTORS_DIR)
				: typeof raw.actorsDir === 'string'
					? raw.actorsDir
					: undefined,
		configPath: source.configPath ?? (typeof raw.configPath === 'string' ? raw.configPath : undefined),
		mcpBearerToken:
			typeof (source.env?.RIG_MCP_BEARER_TOKEN ?? process.env.RIG_MCP_BEARER_TOKEN) === 'string'
				? (source.env?.RIG_MCP_BEARER_TOKEN ?? process.env.RIG_MCP_BEARER_TOKEN)
				: typeof raw.mcpBearerToken === 'string'
					? raw.mcpBearerToken
					: undefined,
		mcpHost:
			typeof (source.env?.RIG_MCP_HOST ?? process.env.RIG_MCP_HOST) === 'string'
				? (source.env?.RIG_MCP_HOST ?? process.env.RIG_MCP_HOST)
				: typeof raw.mcpHost === 'string'
					? raw.mcpHost
					: '127.0.0.1',
		mcpPort:
			parseInteger(source.env?.RIG_MCP_PORT ?? process.env.RIG_MCP_PORT, 'mcpPort') ??
			(typeof raw.mcpPort === 'number' ? raw.mcpPort : undefined) ??
			8787,
		webHost:
			typeof (source.env?.RIG_WEB_HOST ?? process.env.RIG_WEB_HOST) === 'string'
				? (source.env?.RIG_WEB_HOST ?? process.env.RIG_WEB_HOST)
				: typeof raw.webHost === 'string'
					? raw.webHost
					: '0.0.0.0',
		webPort:
			parseInteger(source.env?.RIG_WEB_PORT ?? process.env.RIG_WEB_PORT, 'webPort') ??
			(typeof raw.webPort === 'number' ? raw.webPort : undefined)
	};

	try {
		return serverConfigSchema.parse(candidate);
	} catch (error) {
		if (error instanceof ZodError) {
			const first = error.issues[0];
			const key = first?.path[0] === undefined ? 'config' : String(first.path[0]);
			throw new ConfigError(key, first?.message ?? 'Invalid server config');
		}
		throw error;
	}
}

export async function loadServerConfig(source: ServerConfigSource = {}): Promise<ServerConfig> {
	const env = source.env ?? process.env;
	const workspaceRoot = source.workspaceRoot ?? env.RIG_WORKSPACE_ROOT ?? process.cwd();
	const configPath = source.configPath ?? env.RIG_CONFIG ?? join(workspaceRoot, DEFAULT_CONFIG_FILE);
	const rawConfig = await loadConfigFile(resolve(configPath));
	return normalizeConfig(rawConfig, { ...source, env, workspaceRoot, configPath: resolve(configPath) });
}

export function assertConfigValue(key: string, value: unknown): void {
	if (value === undefined || value === null || value === '') {
		throw new ConfigError(key, `${key} is required`);
	}
}