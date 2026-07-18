import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import {
	getInvalidationKeysForEvent,
	subscribeToSpecEvents,
	type SpecChangeEvent,
	type SpecEventSource
} from '../src/api/events';

describe('events.ts', () => {
	describe('getInvalidationKeysForEvent', () => {
		it('returns correct keys for spec_changed event', () => {
			const event: SpecChangeEvent = {
				type: 'spec_changed',
				specId: 'spec-123',
				stage: 'requirements'
			};

			const keys = getInvalidationKeysForEvent(event);

			expect(keys).toEqual([
				['specs'],
				['spec', 'spec-123'],
				['spec-doc', 'spec-123', 'requirements']
			]);
		});

		it('returns correct keys for spec_changed event with component', () => {
			const event: SpecChangeEvent = {
				type: 'spec_changed',
				specId: 'spec-456',
				stage: 'design',
				component: 'web-spa'
			};

			const keys = getInvalidationKeysForEvent(event);

			expect(keys).toEqual([
				['specs'],
				['spec', 'spec-456'],
				['spec-doc', 'spec-456', 'design']
			]);
		});

		it('returns no keys for a frame the dashboard has no view for (e.g. trail_changed)', () => {
			// The discovery domain's trail/waypoint events flow over the same SSE stream,
			// but the dashboard has no trails surface in v1 -- nothing to invalidate.
			const event = { type: 'trail_changed', trailId: 'trail-789' } as unknown as SpecChangeEvent;

			const keys = getInvalidationKeysForEvent(event);

			expect(keys).toEqual([]);
		});

		it('includes all three keys for spec_changed to ensure cache invalidation', () => {
			const event: SpecChangeEvent = {
				type: 'spec_changed',
				specId: 'my-spec',
				stage: 'tasks'
			};

			const keys = getInvalidationKeysForEvent(event);

			// Verify the exact query keys that must be invalidated
			expect(keys).toHaveLength(3);
			expect(keys[0]).toEqual(['specs']);
			expect(keys[1]).toEqual(['spec', 'my-spec']);
			expect(keys[2]).toEqual(['spec-doc', 'my-spec', 'tasks']);
		});

	});

	describe('subscribeToSpecEvents', () => {
		let mockQueryClient: QueryClient;
		let mockEventSource: SpecEventSource;
		let invalidateQueriesSpy: ReturnType<typeof vi.fn>;

		beforeEach(() => {
			// Create a mock QueryClient
			invalidateQueriesSpy = vi.fn();

			mockQueryClient = {
				invalidateQueries: invalidateQueriesSpy
			} as unknown as QueryClient;

			// Create a mock EventSource
			mockEventSource = {
				onopen: null,
				onerror: null,
				onmessage: null,
				close: vi.fn()
			};
		});

		it('invalidates correct keys when spec_changed event is received', () => {
			const unsubscribe = subscribeToSpecEvents(mockQueryClient, {
				url: '/api/events',
				createEventSource: () => mockEventSource
			});

			// Trigger onopen to initialize connection
			mockEventSource.onopen?.();

			// Simulate receiving a spec_changed event
			const event = new MessageEvent('message', {
				data: JSON.stringify({
					type: 'spec_changed',
					specId: 'spec-xyz',
					stage: 'requirements'
				})
			});

			mockEventSource.onmessage?.(event as MessageEvent<string>);

			// Verify that invalidateQueries was called with the correct keys
			expect(invalidateQueriesSpy).toHaveBeenCalledWith({
				queryKey: ['specs']
			});
			expect(invalidateQueriesSpy).toHaveBeenCalledWith({
				queryKey: ['spec', 'spec-xyz']
			});
			expect(invalidateQueriesSpy).toHaveBeenCalledWith({
				queryKey: ['spec-doc', 'spec-xyz', 'requirements']
			});

			unsubscribe();
		});

		it('invalidates nothing for a frame the dashboard has no view for', () => {
			const unsubscribe = subscribeToSpecEvents(mockQueryClient, {
				url: '/api/events',
				createEventSource: () => mockEventSource
			});

			// Trigger onopen to initialize connection
			mockEventSource.onopen?.();

			invalidateQueriesSpy.mockClear();

			// Simulate receiving a discovery-domain event (no trails surface in v1)
			const event = new MessageEvent('message', {
				data: JSON.stringify({
					type: 'waypoint_changed',
					trailId: 'trail-123',
					waypointId: 'waypoint-456'
				})
			});

			mockEventSource.onmessage?.(event as MessageEvent<string>);

			expect(invalidateQueriesSpy).not.toHaveBeenCalled();

			unsubscribe();
		});

		it('ignores malformed JSON in event messages', () => {
			const unsubscribe = subscribeToSpecEvents(mockQueryClient, {
				url: '/api/events',
				createEventSource: () => mockEventSource
			});

			// Trigger onopen to initialize connection
			mockEventSource.onopen?.();

			// Clear any calls from onopen
			invalidateQueriesSpy.mockClear();

			// Send malformed JSON
			const malformedEvent = new MessageEvent('message', {
				data: 'not valid json{'
			});

			mockEventSource.onmessage?.(malformedEvent as MessageEvent<string>);

			// invalidateQueries should not have been called for malformed data
			expect(invalidateQueriesSpy).not.toHaveBeenCalled();

			unsubscribe();
		});

		it('closes the event source when unsubscribe is called', () => {
			const unsubscribe = subscribeToSpecEvents(mockQueryClient, {
				url: '/api/events',
				createEventSource: () => mockEventSource
			});

			expect(mockEventSource.close).not.toHaveBeenCalled();

			unsubscribe();

			expect(mockEventSource.close).toHaveBeenCalled();
		});

		it('invalidates all queries on reconnect if dropped since last open', () => {
			const unsubscribe = subscribeToSpecEvents(mockQueryClient, {
				url: '/api/events',
				createEventSource: () => mockEventSource
			});

			// First connection
			mockEventSource.onopen?.();

			invalidateQueriesSpy.mockClear();

			// Simulate error/drop
			mockEventSource.onerror?.();

			// Reconnect
			mockEventSource.onopen?.();

			// Should have called invalidateQueries without queryKey to invalidate all
			// Look for the call without queryKey parameter
			const callWithoutQueryKey = invalidateQueriesSpy.mock.calls.some(
				(call) => call.length === 0 || (call[0] && typeof call[0] === 'object' && !('queryKey' in call[0]))
			);
			expect(callWithoutQueryKey).toBe(true);

			unsubscribe();
		});
	});
});
