import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { Pool } from 'pg';

import type { SpecChangeEmitter } from '@rig/persistence';

import { specRepositoryErrorHandler } from './error-handler.js';
import { registerEventsRoute } from './routes/events.js';
import { registerReadRoutes } from './routes/reads.js';
import { registerWriteRoutes } from './routes/writes.js';

export interface BuildAppOptions {
	/**
	 * Absolute path to the built SPA's static assets (`packages/web/dist`). Defaults to
	 * the real `packages/web/dist` directory (see `defaultStaticRoot` below); callers
	 * (e.g. tests exercising a fixture build) can override it here instead.
	 */
	staticRoot?: string;
	/**
	 * sse-endpoint (Story 4 AC1, AC2): forwarded straight through to `buildWebApp`, which
	 * registers `GET /api/events` off it. Optional so callers that don't need live
	 * invalidation (most tests) can omit it and get every other route with no SSE stream.
	 */
	events?: SpecChangeEmitter;
}

const API_PREFIX = '/api';
const DOCS_PREFIX = '/docs';

export interface BuildWebAppOptions {
	/**
	 * Backs every REST route registered on the returned instance, including
	 * `:projectSlug` -> `project_id` resolution via `ensureProject` (mirroring the MCP
	 * transport's per-session project binding in `mcp/session.ts`).
	 */
	pool: Pool;
	/**
	 * Spec-change fan-out (spec-change-events); optional so callers that don't need live
	 * invalidation (most tests) can omit it. Decorated onto the returned instance so the
	 * sse-endpoint component can pull it back off the same app it registers its raw
	 * streaming route onto, without a second, parallel way of wiring the emitter in.
	 */
	events?: SpecChangeEmitter;
}

/**
 * rest-bff-api (Story 5 AC2, AC3, AC4): the bare Fastify app skeleton `buildApp` below
 * is layered on top of -- registers `fastify-type-provider-zod`'s validator/serializer
 * compilers (so any route later registered via `.withTypeProvider<ZodTypeProvider>()`
 * validates/serializes against its Zod schema) and `@fastify/swagger` +
 * `@fastify/swagger-ui` (mounted at `/docs`, fed by those same Zod schemas via
 * `jsonSchemaTransform`) so the generated OpenAPI document stays live and browsable as
 * routes are added by other tasks. Returns the raw, live `FastifyInstance` -- not a
 * start/stop handle -- so both `buildApp` (which layers routes, the error handler, and
 * static SPA serving on top) and the sse-endpoint component can register directly onto
 * it.
 *
 * sse-endpoint (Story 4 AC1, AC2, AC3): when `options.events` is supplied, also
 * registers `GET /api/events` (`registerEventsRoute`) right here, before returning --
 * i.e. before `buildApp` ever registers the `@fastify/static` plugin or its
 * `index.html` history-fallback `setNotFoundHandler`, so the SSE stream always takes
 * precedence over the SPA static/fallback handling. No `preHandler`/`onRequest` auth
 * hook is attached; the stream is unauthenticated like the rest of the REST BFF today.
 */
export function buildWebApp(options: BuildWebAppOptions): FastifyInstance {
	const { pool, events } = options;

	const app = Fastify();
	app.setValidatorCompiler(validatorCompiler);
	app.setSerializerCompiler(serializerCompiler);

	app.decorate('pool', pool);
	app.decorate('events', events);

	if (events !== undefined) {
		registerEventsRoute(app, events);
	}

	void app.register(fastifySwagger, {
		openapi: {
			info: {
				title: 'Rig Spec Pipeline API',
				version: '0.1.0'
			}
		},
		transform: jsonSchemaTransform
	});

	void app.register(fastifySwaggerUi, {
		routePrefix: DOCS_PREFIX
	});

	return app;
}

/**
 * Walks up from `startDir` looking for `pnpm-workspace.yaml`, the monorepo root's
 * marker file, and returns that directory. Falls back to `process.cwd()` if no marker
 * is found (e.g. an unusual install layout) rather than throwing, so `buildApp()` still
 * works as long as the caller supplies its own `staticRoot`.
 */
function findWorkspaceRoot(startDir: string): string {
	let dir = startDir;
	for (;;) {
		if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
			return dir;
		}
		const parent = dirname(dir);
		if (parent === dir) {
			return process.cwd();
		}
		dir = parent;
	}
}

/**
 * Locates `packages/web/dist` relative to the monorepo root rather than
 * `process.cwd()` -- `tsc`'s `rootDir: ".."` for this package means the compiled
 * `app.js` doesn't sit at a fixed depth under `packages/server`, and the `test` script
 * (`packages/server/package.json`) runs with `cwd` set to `packages/server`, not the
 * repo root, so a `cwd`-relative path wouldn't resolve consistently between `pnpm -r
 * build` output and a plain `node --test` invocation.
 */
function defaultStaticRoot(): string {
	const here = dirname(fileURLToPath(import.meta.url));
	return join(findWorkspaceRoot(here), 'packages', 'web', 'dist');
}

function isExcludedFromHistoryFallback(pathname: string): boolean {
	return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`) || pathname === DOCS_PREFIX || pathname.startsWith(`${DOCS_PREFIX}/`);
}

function sendJsonNotFound(request: FastifyRequest, reply: FastifyReply): void {
	reply.status(404).send({ error: 'not_found', message: `Route ${request.method}:${request.url} not found` });
}

/**
 * rest-bff-api (Story 2, T3): the Fastify app instance backing the REST BFF -- built
 * once per process/test so route registration and the shared error handler share a
 * single instance. Every route handler can `throw` a `SpecRepositoryError` (or let a
 * raw error bubble up) and rely on this app's `setErrorHandler` registration to
 * translate it into the right HTTP response instead of each route individually
 * catching and mapping it.
 *
 * The Zod validator/serializer compilers (T4) are wired in once, by `buildWebApp`
 * (Story 5 AC2-AC4) above, so every route registered via
 * `.withTypeProvider<ZodTypeProvider>()` -- reads.ts and writes.ts -- validates its
 * request against, and serializes its response through, its declared Zod schema
 * without each route file repeating this setup. The same `buildWebApp` call also
 * registers `@fastify/swagger`/`@fastify/swagger-ui`, so this app's OpenAPI document
 * is browsable at `/docs`.
 *
 * rest-bff-api (Story 8 AC3): also serves the built SPA (`packages/web/dist`)
 * statically and falls back to `index.html` for any unmatched GET request outside
 * `/api` and `/docs`, so direct navigation to a client-routed URL (e.g. GET
 * /specs/:specId) still resolves. Requests under `/api` or `/docs` that don't match a
 * registered route fall through to a plain JSON 404 instead of the SPA shell -- the
 * `@fastify/static` wildcard route already calls `setNotFoundHandler` when a request
 * matches its prefix ('/') but no file exists on disk, so this one handler covers both
 * "no route at all" (e.g. an unregistered /api/* path) and "no static file" (e.g.
 * /specs/some-id) cases.
 */
export function buildApp(pool: Pool, options: BuildAppOptions = {}): FastifyInstance {
	const app = buildWebApp({ pool, events: options.events });
	app.setErrorHandler(specRepositoryErrorHandler);
	registerReadRoutes(app, pool);
	registerWriteRoutes(app, pool);

	const staticRoot = options.staticRoot ?? defaultStaticRoot();
	void app.register(fastifyStatic, { root: staticRoot });

	app.setNotFoundHandler((request, reply) => {
		const pathname = request.url.split('?')[0] ?? request.url;
		if (isExcludedFromHistoryFallback(pathname) || request.method !== 'GET') {
			sendJsonNotFound(request, reply);
			return;
		}
		reply.sendFile('index.html', staticRoot);
	});

	return app;
}
