import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * `SpecChangeEvent` (spec-change-events): mirrors the discriminated union emitted by the
 * server's `SpecChangeEmitter` (`packages/persistence/src/spec-change-emitter.ts`) and
 * streamed to the browser as SSE frames on `/api/events`. Kept as a local type rather than
 * importing the persistence package's runtime module, since this file only needs the shape
 * of the wire payload, not the Node-only emitter implementation.
 */
export type SpecChangeEvent = { type: 'spec_changed'; specId: string; stage: string; component?: string };

/**
 * Maps a `SpecChangeEvent` to the React Query keys that must be invalidated in response
 * (Story 4 AC3; Design invalidation mapping table). Invalidation only -- callers must
 * refetch via the existing GET endpoints rather than trusting data embedded in the event,
 * since the SSE frame is a "something changed" signal, not a source of truth. Frames the
 * dashboard has no view for (e.g. the discovery domain's `trail_changed` /
 * `waypoint_changed` -- there is no trails surface in v1) invalidate nothing.
 */
export function getInvalidationKeysForEvent(event: SpecChangeEvent): QueryKey[] {
	switch (event.type) {
		case 'spec_changed':
			return [['specs'], ['spec', event.specId], ['spec-doc', event.specId, event.stage]];
		default:
			return [];
	}
}

/**
 * Minimal shape of the browser `EventSource` API that this module depends on, so tests can
 * supply a fake without needing a real SSE connection (jsdom has no native `EventSource`).
 */
export interface SpecEventSource {
	onopen: (() => void) | null;
	onerror: (() => void) | null;
	onmessage: ((event: MessageEvent<string>) => void) | null;
	close(): void;
}

export interface SubscribeToSpecEventsOptions {
	/** SSE endpoint to connect to. Defaults to `/api/events`. */
	url?: string;
	/** Factory for the underlying event source, overridable in tests. */
	createEventSource?: (url: string) => SpecEventSource;
}

const DEFAULT_URL = '/api/events';

function defaultCreateEventSource(url: string): SpecEventSource {
	return new EventSource(url) as unknown as SpecEventSource;
}

/**
 * App-level SSE subscriber (Story 1 AC2; Story 2 AC4; Story 3 AC4; Story 4 AC3). Opens a
 * single `EventSource` against `/api/events`, parses each frame as a `SpecChangeEvent`, and
 * invalidates the corresponding React Query cache entries so views refetch fresh data via
 * their existing GET requests.
 *
 * Per the design's SSE reconnect/error behavior: the browser's native `EventSource`
 * auto-reconnects after a transport error. If `onopen` fires again after such a drop, the
 * client may have missed events while disconnected, so every query is invalidated to force
 * a full resync rather than trusting the narrower per-event mapping.
 *
 * Returns an unsubscribe function that closes the connection.
 */
export function subscribeToSpecEvents(
	queryClient: QueryClient,
	options: SubscribeToSpecEventsOptions = {}
): () => void {
	const url = options.url ?? DEFAULT_URL;
	const createEventSource = options.createEventSource ?? defaultCreateEventSource;

	const source = createEventSource(url);
	let hasConnectedOnce = false;
	let droppedSinceLastOpen = false;

	source.onopen = () => {
		if (hasConnectedOnce && droppedSinceLastOpen) {
			void queryClient.invalidateQueries();
		}
		hasConnectedOnce = true;
		droppedSinceLastOpen = false;
	};

	source.onerror = () => {
		droppedSinceLastOpen = true;
	};

	source.onmessage = (event: MessageEvent<string>) => {
		let parsed: SpecChangeEvent;
		try {
			parsed = JSON.parse(event.data) as SpecChangeEvent;
		} catch {
			// Malformed frame -- ignore rather than crash the subscriber.
			return;
		}

		for (const queryKey of getInvalidationKeysForEvent(parsed)) {
			void queryClient.invalidateQueries({ queryKey });
		}
	};

	return () => {
		source.close();
	};
}
