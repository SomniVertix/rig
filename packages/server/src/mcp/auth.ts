import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const BEARER_PATTERN = /^Bearer (.+)$/;

function constantTimeEquals(candidate: string, expected: string): boolean {
	const candidateBuffer = Buffer.from(candidate, 'utf8');
	const expectedBuffer = Buffer.from(expected, 'utf8');
	// timingSafeEqual requires equal-length buffers; a length mismatch is not a
	// secret worth protecting via constant-time comparison, so short-circuit.
	if (candidateBuffer.length !== expectedBuffer.length) {
		return false;
	}
	return timingSafeEqual(candidateBuffer, expectedBuffer);
}

/**
 * Bearer-token pre-handler (Story 5.3, 5.6, 5.7). Validates the single, static,
 * per-daemon `Authorization: Bearer <token>` header against the configured
 * `mcpBearerToken` before any tool call is dispatched. Auth is intentionally not
 * project-scoped (Story 5.6 -- a valid token grants access to every project
 * endpoint), and there is no in-API mechanism to expire/rotate/revoke it
 * (Story 5.7); rotation is strictly an out-of-band config/redeploy operation.
 */
export function isAuthorizedRequest(req: IncomingMessage, expectedToken: string): boolean {
	const header = req.headers.authorization;
	if (typeof header !== 'string') {
		return false;
	}
	const match = BEARER_PATTERN.exec(header);
	const token = match?.[1];
	if (token === undefined) {
		return false;
	}
	return constantTimeEquals(token, expectedToken);
}
