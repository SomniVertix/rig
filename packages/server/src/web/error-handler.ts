import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

import { SpecRepositoryError } from '@rig/persistence';

/**
 * rest-bff-api (T3): maps `SpecRepositoryError.rule` (T5.1's persistence-layer error
 * shape, already reused by the MCP tool layer's `errorResult` in tool-helpers.ts) to an
 * HTTP status code, so REST route handlers can simply `throw` a `SpecRepositoryError`
 * instead of each individually catching and translating it (Requirements Story 2 AC3).
 *
 * Every rule not listed here -- and every rejection that isn't a `SpecRepositoryError`
 * at all -- falls through to 500, and its response body always reports `internal_error`
 * rather than leaking the underlying rule/stack (a caller can't distinguish "unmapped
 * rule" from "unexpected failure" from the response, by design).
 */
const RULE_STATUS_CODES: Record<string, number> = {
	not_found: 404,
	not_in_review: 409,
	component_required: 400
};

export interface ErrorResponseBody {
	error: string;
	message: string;
}

/**
 * Fastify error handler (registered via `app.setErrorHandler` in app.ts): reuses
 * `SpecRepositoryError`'s existing `{ rule, message }` shape as the response body's
 * `{ error, message }` shape rather than introducing a second error-serialization
 * convention alongside the MCP tool layer's `errorResult`.
 */
export function specRepositoryErrorHandler(error: FastifyError | Error, _request: FastifyRequest, reply: FastifyReply): void {
	if (error instanceof SpecRepositoryError) {
		const statusCode = RULE_STATUS_CODES[error.rule];
		if (statusCode !== undefined) {
			const body: ErrorResponseBody = { error: error.rule, message: error.message };
			reply.status(statusCode).send(body);
			return;
		}
	}

	// Fastify's own request validation (params/querystring/body failing their Zod
	// schema) throws before a route handler ever runs -- it's a malformed request, not
	// an unexpected server failure, so it maps to the caller's own `statusCode` (400)
	// rather than falling through to 500 alongside genuine internal errors.
	if ('validation' in error && Array.isArray(error.validation) && typeof error.statusCode === 'number') {
		const body: ErrorResponseBody = { error: 'invalid_request', message: error.message };
		reply.status(error.statusCode).send(body);
		return;
	}

	// Any other rule, or any non-`SpecRepositoryError` rejection: 500 with a generic
	// `internal_error` body -- no stack trace, and no raw error message shape, ever
	// leaks past this handler.
	const message = error instanceof Error ? error.message : String(error);
	const body: ErrorResponseBody = { error: 'internal_error', message };
	reply.status(500).send(body);
}
