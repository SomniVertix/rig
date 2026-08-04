import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TrailGraphView } from './TrailGraphView';
import type { Waypoint } from '../../../data/trails/types';

const waypoints: Waypoint[] = [
	{ id: 'a1', title: 'Pick the queue backend', state: 'reached', dependsOn: [] },
	{ id: 'b1', title: 'Define retry policy', state: 'marked', dependsOn: ['a1'] }
];

describe('TrailGraphView', () => {
	it('renders a node per waypoint without crashing', async () => {
		render(<TrailGraphView waypoints={waypoints} direction="lr" onSelect={() => {}} />);

		expect(await screen.findByText('Pick the queue backend')).toBeInTheDocument();
		expect(screen.getByText('Define retry policy')).toBeInTheDocument();
	});

	it('reports the clicked node id via onSelect, and reflects selectedId as the selected node', async () => {
		const onSelect = vi.fn();
		const { rerender } = render(
			<TrailGraphView waypoints={waypoints} direction="lr" selectedId={undefined} onSelect={onSelect} />
		);

		const node = await screen.findByText('Define retry policy');
		fireEvent.click(node);
		expect(onSelect).toHaveBeenCalledWith('b1');

		// TrailDetailPage owns selectedId — simulate it round-tripping back in,
		// which is the same controlled-selection contract W3 settled.
		rerender(<TrailGraphView waypoints={waypoints} direction="lr" selectedId="b1" onSelect={onSelect} />);
		await waitFor(() => {
			expect(node.closest('.react-flow__node')).toHaveClass('selected');
		});
	});
});
