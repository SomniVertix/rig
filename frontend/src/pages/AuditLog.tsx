import type { ReactNode, CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { usePageTitle } from '../app/state/AppStateContext';
import { useAudit } from '../data/audit';
import { errorMessage } from '../api/client';

export function AuditLog() {
	usePageTitle('Audit log');
	// :workspace is always present — this route only ever mounts under /:workspace.
	const { workspace } = useParams() as { workspace: string };
	const { data: rows, isLoading, isError, error } = useAudit(workspace);

	return (
		<div>
			<h1 style={{ marginBottom: 8 }}>Audit log</h1>
			<p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-faint)', marginBottom: 20 }}>
				every mutation · one row · same transaction
			</p>

			{isError ? (
				<p style={{ color: 'var(--rose-500)' }}>Failed to load audit log: {errorMessage(error)}</p>
			) : isLoading ? (
				<p style={{ color: 'var(--text-muted)' }}>Loading…</p>
			) : (
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: '70px minmax(130px,170px) minmax(110px,140px) minmax(160px,1fr)',
						border: '1px solid var(--border-default)',
						borderRadius: 'var(--radius-md)',
						overflow: 'hidden',
						fontFamily: 'var(--font-mono)',
						fontSize: 'var(--text-sm)'
					}}
				>
					{['Time', 'Actor', 'Action', 'Target'].map((h) => (
						<div
							key={h}
							style={{
								padding: '8px 12px',
								fontSize: 10.5,
								letterSpacing: 'var(--tracking-caps)',
								textTransform: 'uppercase',
								color: 'var(--text-faint)',
								background: 'var(--bg-surface-2)',
								borderBottom: '1px solid var(--border-default)'
							}}
						>
							{h}
						</div>
					))}
					{rows?.map((row) => (
						<div style={{ display: 'contents' }} key={`${row.ts}-${row.actor}-${row.action}-${row.target}`}>
							<Cell>{row.ts}</Cell>
							<Cell style={{ color: row.actor === 'web-ui' ? 'var(--text-brand)' : 'var(--text-muted)' }}>{row.actor}</Cell>
							<Cell>{row.action}</Cell>
							<Cell>{row.target}</Cell>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function Cell({ children, style }: { children: ReactNode; style?: CSSProperties }) {
	return (
		<div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-body)', ...style }}>
			{children}
		</div>
	);
}
