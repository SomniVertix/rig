import { useState, type ReactNode } from 'react';
import { Dialog, Button, Textarea, Select } from '../ds';
import { useWorkspaces } from '../data/workspaces';
import {
	SESSION_TYPES,
	EXECUTORS,
	MODEL_CONFIG_BY_EXECUTOR,
	LAUNCHER_AGENTS,
	DEFAULT_LAUNCHER_AGENT,
	type SessionType,
	type Executor
} from '../config/sessionLauncher';

export interface SessionLauncherDialogProps {
	open: boolean;
	onClose: () => void;
	defaultWorkspaceId?: string;
}

export function SessionLauncherDialog({ open, onClose, defaultWorkspaceId }: SessionLauncherDialogProps) {
	const { data: workspaces } = useWorkspaces();
	const [type, setType] = useState<SessionType>('discovery');
	const [executor, setExecutor] = useState<Executor>('claude');
	const [model, setModel] = useState(MODEL_CONFIG_BY_EXECUTOR.claude.default);
	const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId ?? '');
	const [seed, setSeed] = useState('');
	const [agent, setAgent] = useState(DEFAULT_LAUNCHER_AGENT);
	const selectedWorkspaceId = workspaceId || workspaces?.[0]?.id || '';

	const setExecutorAndResetModel = (next: Executor) => {
		setExecutor(next);
		setModel(MODEL_CONFIG_BY_EXECUTOR[next].default);
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			title="New session"
			maxWidth={540}
			footer={
				<>
					<Button variant="ghost" onClick={onClose}>
						Cancel
					</Button>
					<Button variant="primary" disabled title="Sessions have no V2 backend yet (see GAPS.md §3)">
						Start session
					</Button>
				</>
			}
		>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
				<Field label="Session type">
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
						{SESSION_TYPES.map((t) => (
							<SelectableCard key={t.value} selected={type === t.value} onClick={() => setType(t.value)} title={t.label} subtitle={t.note} />
						))}
					</div>
				</Field>

				<Field label="Executor">
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
						{EXECUTORS.map((e) => (
							<SelectableCard
								key={e.value}
								selected={executor === e.value}
								onClick={() => setExecutorAndResetModel(e.value)}
								title={e.label}
								subtitle={e.note}
							/>
						))}
					</div>
				</Field>

				<Field label="Model" hint={MODEL_CONFIG_BY_EXECUTOR[executor].hint}>
					<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
						{MODEL_CONFIG_BY_EXECUTOR[executor].options.map((m) => (
							<button
								key={m}
								type="button"
								className={['rl-filter-pill', model === m ? 'rl-filter-pill--active' : ''].join(' ')}
								onClick={() => setModel(m)}
							>
								{m}
							</button>
						))}
					</div>
				</Field>

				<Field label="Workspace">
					<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
						{(workspaces ?? []).map((w) => (
							<button
								key={w.id}
								type="button"
								className={['rl-filter-pill', selectedWorkspaceId === w.id ? 'rl-filter-pill--active' : ''].join(' ')}
								onClick={() => setWorkspaceId(w.id)}
							>
								{w.label}
							</button>
						))}
					</div>
				</Field>

				<Textarea
					label="Seed prompt"
					value={seed}
					onChange={(e) => setSeed(e.target.value)}
					placeholder="The loose idea — what should exist that does not?"
				/>

				<Select
					label="Agent"
					value={agent}
					onChange={(e) => setAgent(e.target.value)}
					options={LAUNCHER_AGENTS.map((a) => ({ value: a, label: a }))}
					hint="The agent assigned to run this session — its writes are attributed to it as a registered known_actor."
				/>
			</div>
		</Dialog>
	);
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
	return (
		<div>
			<div className="rl-eyebrow" style={{ marginBottom: 8 }}>
				{label}
			</div>
			{children}
			{hint ? <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>{hint}</div> : null}
		</div>
	);
}

function SelectableCard({ selected, onClick, title, subtitle }: { selected: boolean; onClick: () => void; title: string; subtitle: string }) {
	return (
		<div
			onClick={onClick}
			style={{
				padding: 12,
				borderRadius: 'var(--radius-sm)',
				border: `1px solid ${selected ? 'var(--accent)' : 'var(--border-default)'}`,
				background: selected ? 'var(--accent-soft)' : 'transparent',
				cursor: 'pointer'
			}}
		>
			<div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-strong)' }}>{title}</div>
			<div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{subtitle}</div>
		</div>
	);
}
