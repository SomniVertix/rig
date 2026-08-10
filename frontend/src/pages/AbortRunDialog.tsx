import { Dialog, Button } from '../ds';
import { useAbortRun } from '../data/runs';

export interface AbortRunDialogProps {
	runId: string | null;
	onClose: () => void;
}

export function AbortRunDialog({ runId, onClose }: AbortRunDialogProps) {
	const abort = useAbortRun();

	return (
		<Dialog
			open={runId !== null}
			onClose={onClose}
			title="Abort run"
			maxWidth={440}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button
						variant="danger"
						disabled={abort.isPending}
						onClick={() => {
							if (runId) abort.mutate(runId, { onSuccess: onClose });
						}}
					>
						Abort run
					</Button>
				</>
			}
		>
			<p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-body)', marginBottom: 16 }}>
				This will terminate the running node immediately. The audit row is written in-transaction.
			</p>
			<div
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					fontFamily: 'var(--font-mono)',
					fontSize: 'var(--text-sm)',
					padding: '8px 12px',
					background: 'var(--bg-inset)',
					borderRadius: 'var(--radius-sm)'
				}}
			>
				<span style={{ color: 'var(--text-faint)' }}>ACTOR</span>
				<span>web-ui</span>
			</div>
		</Dialog>
	);
}
