import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { SpecChangeEmitter } from '@relentless/persistence';

/**
 * sse-endpoint (Story 4 AC1): every ~15s, in the absence of any other traffic, this
 * comment-frame heartbeat is written to each open connection so idle-timeout proxies
 * and load balancers between the browser and this process don't treat the otherwise
 * silent connection as dead and drop it. A comment frame (the `:` prefix) is invisible
 * to `EventSource#onmessage` per the SSE spec, so it never reaches
 * `getInvalidationKeysForEvent` as a bogus event.
 */
const HEARTBEAT_INTERVAL_MS = 15_000;

/**
 * sse-endpoint (Story 4 AC1, AC2): `GET /api/events`, a plain server-sent-events stream
 * forwarding every `SpecChangeEvent` emitted on the shared `SpecChangeEmitter` verbatim to
 * every connected client. Deliberately registered as a raw route directly on the shared
 * app instance -- no `schema`, no `.withTypeProvider<ZodTypeProvider>()` -- so it never
 * enters the Zod validator/serializer path and is skipped by the swagger/OpenAPI doc
 * generation (both key off a route's `schema`, which this route never sets).
 *
 * Every frame is the untyped default SSE event (no `event:` field): the wire format is
 * always `data: <json>\n\n`, so browser clients read it via `EventSource#onmessage` rather
 * than a named-event listener. This is a scoped ping, not a payload -- the frame is the
 * `SpecChangeEvent` discriminated union itself (`{ type, specId, stage, component? }` or
 * `{ type, sessionId }`), never a full record; clients refetch the relevant resource via
 * the REST BFF after receiving one.
 *
 * Two concerns specific to a long-lived HTTP connection are handled per connection
 * (Design §Data Model "SSE wire format (sse-endpoint) (api)"):
 *  - Heartbeat: a `: ping\n\n` comment frame is written every `HEARTBEAT_INTERVAL_MS`
 *    (~15s) to prevent idle-timeout drops.
 *  - Cleanup: when the client disconnects, `request.raw` emits `close`. The handler
 *    clears the heartbeat timer and calls the `unsubscribe` function returned by
 *    `specEvents.subscribe(...)`, so neither the timer nor the listener outlives the
 *    connection -- without this, every dropped client would leak a listener on the
 *    shared emitter plus a timer that keeps firing (and writing to a closed socket)
 *    for the remaining lifetime of the process.
 */
export function registerEventsRoute(app: FastifyInstance, specEvents: SpecChangeEmitter): void {
  app.get('/api/events', (request: FastifyRequest, reply: FastifyReply) => {
    // Fastify must not attempt to serialize/send a reply itself -- this handler owns
    // the raw `ServerResponse` for the lifetime of the connection.
    reply.hijack();

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const heartbeat = setInterval(() => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(': ping\n\n');
      }
    }, HEARTBEAT_INTERVAL_MS);

    const unsubscribe = specEvents.subscribe((event) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    });

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
