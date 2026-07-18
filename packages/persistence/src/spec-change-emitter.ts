import { EventEmitter } from 'node:events';

/**
 * `SpecChangeEvent` (spec-change-events): the discriminated union of change notifications
 * that flow out of the persistence layer whenever a spec's stage documents or a
 * discovery trail/waypoint mutate (Story 4 AC1, AC2; see
 * spec-templates/spec/db/schema.sql PART 2 for the trails domain). Consumers (e.g. the
 * MCP UI resource subscriptions) branch on `type` to decide which cached view to
 * invalidate/refetch.
 */
export type SpecChangeEvent =
	| { type: 'spec_changed'; specId: string; stage: string; component?: string }
	| { type: 'trail_changed'; trailId: string }
	| { type: 'waypoint_changed'; trailId: string; waypointId: string };

export type SpecChangeListener = (event: SpecChangeEvent) => void;

/**
 * A thin, typed wrapper over Node's `EventEmitter` used to fan out `SpecChangeEvent`s to
 * any number of subscribers. Intentionally minimal: `emit` synchronously invokes every
 * currently-subscribed listener, and `subscribe` returns an unsubscribe function so
 * callers don't need to hold onto the listener reference themselves.
 */
export class SpecChangeEmitter {
	private static readonly EVENT_NAME = 'spec-change';

	private readonly emitter = new EventEmitter();

	constructor() {
		// Spec change fan-out can have many concurrent subscribers (e.g. one per open
		// MCP UI session); avoid Node's default max-listener warning.
		this.emitter.setMaxListeners(0);
	}

	emit(event: SpecChangeEvent): void {
		this.emitter.emit(SpecChangeEmitter.EVENT_NAME, event);
	}

	subscribe(listener: SpecChangeListener): () => void {
		this.emitter.on(SpecChangeEmitter.EVENT_NAME, listener);
		return () => {
			this.emitter.off(SpecChangeEmitter.EVENT_NAME, listener);
		};
	}
}
