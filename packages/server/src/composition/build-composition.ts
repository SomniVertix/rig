import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ClaudeExecutor, PiExecutor, type AgentExecutor } from '@relentless/executors';
import { createInterpreter, type Interpreter } from '@relentless/engine';
import { createPostgresLibraryResolver, seedBundledLibrary, type LibraryResolver } from '@relentless/library';
import { createPersistenceBundle, SpecChangeEmitter, type PersistenceBundle } from '@relentless/persistence';
import type { ArtifactStore, Clock, RunStore } from '@relentless/schema';

import type { ServerConfig } from '../config/index.js';
import { startMcpTransport, type McpTransportHandle } from '../mcp/index.js';
import { syncKnownActorsFromActorsDirectory } from '../mcp/guardrails/index.js';
import { startWebTransport, type WebTransportHandle } from '../web/transport.js';

export interface CompositionOverrides {
	runStore?: RunStore;
	artifactStore?: ArtifactStore;
	libraryResolver?: LibraryResolver;
	executor?: AgentExecutor;
	clock?: Clock;
}

export interface ServerComposition {
	config: ServerConfig;
	libraryResolver: LibraryResolver;
	executor: AgentExecutor;
	engine: Interpreter;
	runStore: RunStore;
	artifactStore: ArtifactStore;
	clock: Clock;
	pool: PersistenceBundle['pool'];
	// spec-change-events: always constructed regardless of `config.mcpBearerToken`
	// -- cheap, in-process, so MCP-only compositions still work unchanged. Only
	// the SSE consumer/web listener that reads from it is config-gated.
	specEvents: SpecChangeEmitter;
	// mcp-transport (Story 5): present only when `config.mcpBearerToken` is
	// configured. The daemon stays a single process either way -- this is the
	// existing gRPC/proto transport's sibling inside the same `startDaemon`
	// process, not a second entry point/binary (Story 5.2).
	mcpTransport?: McpTransportHandle;
	// web-transport (Story 7 AC2, AC3): present only when `config.webPort` is
	// configured, matching the mcp-transport's own config-gated pattern above --
	// the REST BFF listener stays a sibling inside the same `startDaemon`
	// process (Story 6 AC1), never a second entry point/binary, and is simply
	// not started for compositions that leave `webPort` unset.
	webTransport?: WebTransportHandle;
	close(): Promise<void>;
}

function wrapDefaultModel(executor: AgentExecutor, defaultModel: string | undefined): AgentExecutor {
	return {
		kind: executor.kind,
		capabilities: executor.capabilities,
		async run(spec, handlers) {
			if (defaultModel !== undefined && (spec.model === undefined || spec.model.trim().length === 0)) {
				return await executor.run({ ...spec, model: defaultModel }, handlers);
			}
			return await executor.run(spec, handlers);
		}
	};
}

async function ensureDatabaseReady(bundle: PersistenceBundle, workspaceRoot: string): Promise<void> {
	// Boot lifecycle (Story 13): apply the single canonical idempotent DDL
	// script as one file instead of iterating a migrations directory. There is
	// no separate migrations runner/directory (Story 13.1, 13.2).
	const schemaPath = join(workspaceRoot, 'spec-templates', 'spec', 'db', 'schema.sql');
	const schemaSql = await readFile(schemaPath, 'utf8');
	await bundle.pool.query(schemaSql);
	await bundle.pool.query('select 1');
}

export async function buildComposition(config: ServerConfig, overrides: CompositionOverrides = {}): Promise<ServerComposition> {
	const bundle = createPersistenceBundle({
		connectionString: config.databaseUrl,
		mirrorRoot: config.mirrorRoot,
		workspaceRoot: config.workspaceRoot
	});
	await ensureDatabaseReady(bundle, config.workspaceRoot);

	// library-store (Story 13.3-13.5): seed-if-absent pass for bundled
	// prompts/agents/workflows, run on every boot so a fresh database ends up
	// with the bundled defaults while an existing (bundled or user-modified) row
	// is never overwritten.
	await seedBundledLibrary(bundle.pool, {
		globalRoot: join(config.workspaceRoot, 'packages', 'library', 'bundled', 'global')
	});

	// guardrails (T6.4): boot-time known-actors registry sync, scanning
	// <actorsDir>/<name> for a curated set of actors and upserting each into
	// known_actors so every write tool's actor-attribution check (T6.2) has a
	// current registry to validate against. This is deliberately NOT a scan of
	// the general Claude Code skills directory -- agents and skills are separate
	// concepts, and an unrelated skill (e.g. a personal formatting helper) must
	// never become a valid actor just because it's installed. See
	// actor-registry.ts's doc comment for the full rationale. Run on every boot,
	// same as the library seed pass above -- re-running only refreshes
	// `updated_at`, it never removes an actor no longer present on disk. Defaults
	// to a project-local `.claude/relentless-actors` under workspaceRoot when
	// config.actorsDir is unset (local/non-Docker dev); Docker overrides via
	// RELENTLESS_ACTORS_DIR to point at the bind-mounted curated actors
	// directory (see docker-compose.yml).
	await syncKnownActorsFromActorsDirectory(bundle.pool, config.actorsDir ?? join(config.workspaceRoot, '.claude', 'relentless-actors'));

	// library-store (Story 1.2, 2.1, 3.1): prompts and workflows resolve from
	// Postgres via `@relentless/persistence`'s library-store, replacing the
	// file-based `.relentless/{agents,prompts,workflows}` path for normal
	// operation. Templates/tools stay file-based, delegated to a
	// `FileSystemLibraryResolver` internally -- out of scope for DB-backing.
	// This composition is not yet project-bound (project-scoped MCP sessions
	// construct their own resolver instance later), so `projectId` defaults to
	// null -- bundled-only resolution, never a per-project copy (Story 4.5).
	const libraryResolver =
		overrides.libraryResolver ??
		createPostgresLibraryResolver({
			pool: bundle.pool,
			projectId: null,
			fileSystemOptions: {
				projectRoot: config.workspaceRoot,
				globalRoot: join(config.workspaceRoot, 'packages', 'library', 'bundled', 'global'),
				additionalSearchRoots: config.librarySearchPaths
			}
		});

	const executor = wrapDefaultModel(
		overrides.executor ?? (config.defaultExecutor === 'claude' ? new ClaudeExecutor() : new PiExecutor()),
		config.defaultModel
	);

	const runStore = overrides.runStore ?? bundle.runStore;
	const artifactStore = overrides.artifactStore ?? bundle.artifactStore;
	const clock = overrides.clock ?? bundle.clock;

	// spec-change-events (Story 4): always constructed -- cheap, in-process --
	// so MCP-only compositions (no `config.mcpBearerToken`) still work
	// unchanged. Only the SSE consumer/web listener that reads from it is
	// config-gated, not the emitter itself.
	const specEvents = new SpecChangeEmitter();

	// mcp-transport (Story 5.2): wired in alongside the rest of the composition
	// so `startDaemon` brings it up in the same process as the existing
	// gRPC/proto transport, which this wiring leaves untouched. Only started
	// when a bearer token is configured; without one the MCP endpoint is simply
	// not started for this composition (e.g. existing tests/local dev that
	// build a composition without configuring MCP at all).
	const mcpTransport =
		config.mcpBearerToken === undefined
			? undefined
			: await startMcpTransport({
					pool: bundle.pool,
					host: config.mcpHost,
					port: config.mcpPort,
					bearerToken: config.mcpBearerToken,
					events: specEvents,
					claimTtlHours: config.claimTtlHours
				});

	// web-transport (Story 7 AC2, AC3): started alongside the mcp-transport
	// above, in the same `buildComposition` call/process (Story 6 AC1), only
	// when `config.webPort` is configured -- without one the REST BFF listener
	// is simply not started for this composition (e.g. existing tests/local dev
	// that build a composition without configuring the web listener at all),
	// mirroring the mcp-transport's own `config.mcpBearerToken` gate.
	const webTransport =
		config.webPort === undefined
			? undefined
			: await startWebTransport({
					pool: bundle.pool,
					events: specEvents,
					host: config.webHost ?? '0.0.0.0',
					port: config.webPort
				});

	const engine = createInterpreter({
		runStore,
		artifactStore,
		libraryResolver,
		executor,
		clock,
		maxNodeExecutions: config.maxNodeExecutions,
		scriptHandlers: {
			noop: async () => ({ status: 'ok' })
		}
	});

	return {
		config,
		runStore,
		artifactStore,
		clock,
		pool: bundle.pool,
		libraryResolver,
		executor,
		engine,
		specEvents,
		mcpTransport,
		webTransport,
		async close() {
			const maybeClose = runStore as { close?: () => Promise<void> };
			if (typeof maybeClose.close === 'function') {
				await maybeClose.close();
			}
			if (mcpTransport !== undefined) {
				await mcpTransport.close();
			}
			if (webTransport !== undefined) {
				await webTransport.close();
			}
			await bundle.pool.end();
		}
	};
}
