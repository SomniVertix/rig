import { useState } from 'react';
import { Square } from 'lucide-react';
import { Badge, IconButton, StatusBadge } from '../ds';
import { usePageTitle } from '../app/state/AppStateContext';
import { useRuns } from '../data/runs';
import type { RunExecutor } from '../data/runs/types';
import { AbortRunDialog } from './AbortRunDialog';
import './runs.css';

export function Runs() {
	usePageTitle('Runs');
	const { data: runs, isLoading } = useRuns();
	const [abortTarget, setAbortTarget] = useState<string | null>(null);

	return (
		<div>
			<h1 style={{ marginBottom: 20 }}>Runs</h1>

			{isLoading ? (
				<p style={{ color: 'var(--text-muted)' }}>Loading…</p>
			) : (
				<div className="rl-runs-table">
					<div className="rl-runs-table__header">
						{['Run', 'Workflow', 'Node', 'Executor', 'Status', 'Started', ''].map((h) => (
							<div key={h}>{h}</div>
						))}
					</div>
					{runs?.map((run) => (
						<div className="rl-runs-table__row" key={run.id}>
							<div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-brand)', fontSize: 'var(--text-xs)' }}>
								{run.id.replace('run_', '')}
							</div>
							<div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{run.workflow}</div>
							<div className="rl-runs-table__node-cell">
								<span>{run.node}</span>
								{run.status === 'running' ? <div className="rl-runs-table__indeterminate" /> : null}
							</div>
							<div>
								<ExecutorBadge executor={run.executor} />
							</div>
							<div>
								<StatusBadge status={run.status} />
							</div>
							<div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{run.started}</div>
							<div>
								{run.status === 'running' ? (
									<IconButton icon={Square} size="sm" aria-label="Abort run" title="Abort run" onClick={() => setAbortTarget(run.id)} />
								) : null}
							</div>
						</div>
					))}
				</div>
			)}

			<AbortRunDialog runId={abortTarget} onClose={() => setAbortTarget(null)} />
		</div>
	);
}

function ExecutorBadge({ executor }: { executor: RunExecutor }) {
	if (executor === '—') return <span style={{ color: 'var(--text-faint)' }}>—</span>;
	return <Badge tone={executor === 'claude' ? 'accent' : 'neutral'}>{executor}</Badge>;
}
