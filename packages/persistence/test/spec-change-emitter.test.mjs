// Spec-change-events unit tests (Story 4 AC1, AC2):
// - subscribe receives emitted events
// - unsubscribe stops delivery
// - multiple subscribers all receive the same event

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SpecChangeEmitter } from '../dist/index.js';

describe('SpecChangeEmitter', () => {
	test('subscribe receives emitted spec_changed events', async () => {
		const emitter = new SpecChangeEmitter();
		const events = [];

		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		const testEvent = { type: 'spec_changed', specId: 'spec-123', stage: 'requirements' };
		emitter.emit(testEvent);

		assert.equal(events.length, 1);
		assert.deepEqual(events[0], testEvent);

		unsubscribe();
	});

	test('subscribe receives emitted trail_changed and waypoint_changed events', async () => {
		const emitter = new SpecChangeEmitter();
		const events = [];

		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		const trailEvent = { type: 'trail_changed', trailId: 'trail-456' };
		const waypointEvent = { type: 'waypoint_changed', trailId: 'trail-456', waypointId: 'waypoint-789' };
		emitter.emit(trailEvent);
		emitter.emit(waypointEvent);

		assert.equal(events.length, 2);
		assert.deepEqual(events[0], trailEvent);
		assert.deepEqual(events[1], waypointEvent);

		unsubscribe();
	});

	test('unsubscribe stops delivery of future events', async () => {
		const emitter = new SpecChangeEmitter();
		const events = [];

		const unsubscribe = emitter.subscribe((event) => {
			events.push(event);
		});

		emitter.emit({ type: 'spec_changed', specId: 'spec-1', stage: 'requirements' });
		assert.equal(events.length, 1);

		unsubscribe();

		emitter.emit({ type: 'spec_changed', specId: 'spec-2', stage: 'design' });
		assert.equal(events.length, 1, 'no new events after unsubscribe');
	});

	test('multiple subscribers all receive the same event', async () => {
		const emitter = new SpecChangeEmitter();
		const events1 = [];
		const events2 = [];
		const events3 = [];

		const unsub1 = emitter.subscribe((event) => {
			events1.push(event);
		});
		const unsub2 = emitter.subscribe((event) => {
			events2.push(event);
		});
		const unsub3 = emitter.subscribe((event) => {
			events3.push(event);
		});

		const testEvent = { type: 'spec_changed', specId: 'spec-789', stage: 'tasks', component: 'my-component' };
		emitter.emit(testEvent);

		assert.equal(events1.length, 1);
		assert.equal(events2.length, 1);
		assert.equal(events3.length, 1);
		assert.deepEqual(events1[0], testEvent);
		assert.deepEqual(events2[0], testEvent);
		assert.deepEqual(events3[0], testEvent);

		unsub1();
		unsub2();
		unsub3();
	});

	test('each subscriber can independently unsubscribe without affecting others', async () => {
		const emitter = new SpecChangeEmitter();
		const events1 = [];
		const events2 = [];
		const events3 = [];

		const unsub1 = emitter.subscribe((event) => {
			events1.push(event);
		});
		const unsub2 = emitter.subscribe((event) => {
			events2.push(event);
		});
		const unsub3 = emitter.subscribe((event) => {
			events3.push(event);
		});

		const event1 = { type: 'spec_changed', specId: 'spec-a', stage: 'requirements' };
		emitter.emit(event1);

		unsub2(); // unsubscribe subscriber 2

		const event2 = { type: 'spec_changed', specId: 'spec-b', stage: 'design' };
		emitter.emit(event2);

		assert.equal(events1.length, 2, 'subscriber 1 receives both events');
		assert.equal(events2.length, 1, 'subscriber 2 receives only first event');
		assert.equal(events3.length, 2, 'subscriber 3 receives both events');

		unsub1();
		unsub3();
	});

	test('subscriber can immediately resubscribe after unsubscribing', async () => {
		const emitter = new SpecChangeEmitter();
		const events = [];

		const unsub1 = emitter.subscribe((event) => {
			events.push(event);
		});

		emitter.emit({ type: 'spec_changed', specId: 'spec-1', stage: 'requirements' });
		assert.equal(events.length, 1);

		unsub1();
		emitter.emit({ type: 'spec_changed', specId: 'spec-2', stage: 'design' });
		assert.equal(events.length, 1, 'no events after first unsubscribe');

		const unsub2 = emitter.subscribe((event) => {
			events.push(event);
		});

		emitter.emit({ type: 'spec_changed', specId: 'spec-3', stage: 'tasks' });
		assert.equal(events.length, 2, 'receives event after resubscribe');

		unsub2();
	});

	test('multiple emissions in sequence reach all subscribers', async () => {
		const emitter = new SpecChangeEmitter();
		const events = [];

		emitter.subscribe((event) => {
			events.push(event);
		});

		emitter.emit({ type: 'spec_changed', specId: 'spec-1', stage: 'requirements' });
		emitter.emit({ type: 'spec_changed', specId: 'spec-2', stage: 'design' });
		emitter.emit({ type: 'trail_changed', trailId: 'trail-1' });
		emitter.emit({ type: 'spec_changed', specId: 'spec-3', stage: 'tasks', component: 'comp-1' });

		assert.equal(events.length, 4);
		assert.equal(events[0].type, 'spec_changed');
		assert.equal(events[0].specId, 'spec-1');
		assert.equal(events[1].specId, 'spec-2');
		assert.equal(events[2].type, 'trail_changed');
		assert.equal(events[3].component, 'comp-1');
	});
});
