import { useState } from 'react';
import { MousePointerClick } from 'lucide-react';
import { Icon, Button, Dialog, Textarea } from '../../ds';
import type { Waypoint } from '../../data/trails/types';
import { WaypointStateDot, WAYPOINT_STATE_LABEL } from './shared';
import {
	useClaimWaypoint,
	useReleaseWaypoint,
	useReachWaypoint,
	useBypassWaypoint,
	useUnbypassWaypoint
} from '../../data/trails';

// No actor/auth system exists in V2 yet (see GAPS.md §3) — all console writes
// are attributed to this fixed literal, matching the pattern the design
// already establishes for the Abort run dialog's read-only actor row.
const WEB_UI_ACTOR = 'web-ui';

export interface WaypointInspectorProps {
	trailId: string;
	waypoint?: Waypoint;
}

export function WaypointInspector({ trailId, waypoint }: WaypointInspectorProps) {
	const claim = useClaimWaypoint(trailId);
	const release = useReleaseWaypoint(trailId);
	const reach = useReachWaypoint(trailId);
	const bypass = useBypassWaypoint(trailId);
	const unbypass = useUnbypassWaypoint(trailId);

	const [reachOpen, setReachOpen] = useState(false);
	const [bypassOpen, setBypassOpen] = useState(false);
	const [unbypassOpen, setUnbypassOpen] = useState(false);
	const [resolution, setResolution] = useState('');
	const [resolutionGist, setResolutionGist] = useState('');
	const [bypassReason, setBypassReason] = useState('');
	const [unbypassReason, setUnbypassReason] = useState('');

	if (!waypoint) {
		return (
			<div className="rl-card rl-card__pad" style={{ textAlign: 'center', color: 'var(--text-faint)' }}>
				<Icon icon={MousePointerClick} size={22} />
				<p style={{ marginTop: 8 }}>Select a waypoint…</p>
			</div>
		);
	}

	return (
		<div className="rl-card rl-card__pad">
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
				<WaypointStateDot state={waypoint.state} />
				<span className="rl-eyebrow">{WAYPOINT_STATE_LABEL[waypoint.state]}</span>
			</div>
			<div className="rl-card__title">{waypoint.title}</div>

			{waypoint.decision ? (
				<p style={{ marginTop: 10, fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>{waypoint.decision}</p>
			) : null}

			{waypoint.state === 'claimed' ? (
				<div
					style={{
						marginTop: 12,
						padding: 10,
						borderRadius: 'var(--radius-sm)',
						background: 'var(--status-review-bg)',
						color: 'var(--status-review-fg)',
						fontSize: 'var(--text-xs)'
					}}
				>
					<div>
						claimed by {waypoint.claimedBy} · {waypoint.claimedAt}
					</div>
					<div style={{ marginTop: 4, opacity: 0.85 }}>
						Stuck? Recovers via release_waypoint or lapses after 24h.
					</div>
				</div>
			) : null}

			{waypoint.state === 'bypassed' && waypoint.bypassReason ? (
				<p style={{ marginTop: 10, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Bypassed — {waypoint.bypassReason}</p>
			) : null}

			{waypoint.dependsOn.length > 0 ? (
				<p style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
					depends on {waypoint.dependsOn.length} waypoint{waypoint.dependsOn.length > 1 ? 's' : ''}
				</p>
			) : null}

			<div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
				{waypoint.state === 'marked' ? (
					<Button
						variant="primary"
						size="sm"
						onClick={() => claim.mutate({ waypointId: waypoint.id, claimedBy: WEB_UI_ACTOR })}
						disabled={claim.isPending}
					>
						Claim
					</Button>
				) : null}
				{waypoint.state === 'claimed' ? (
					<>
						<Button variant="primary" size="sm" onClick={() => setReachOpen(true)}>
							Reach
						</Button>
						<Button variant="secondary" size="sm" onClick={() => release.mutate(waypoint.id)} disabled={release.isPending}>
							Release
						</Button>
					</>
				) : null}
				{waypoint.state === 'marked' || waypoint.state === 'sighted' ? (
					<Button variant="ghost" size="sm" onClick={() => setBypassOpen(true)}>
						Bypass
					</Button>
				) : null}
				{waypoint.state === 'bypassed' ? (
					<Button variant="secondary" size="sm" onClick={() => setUnbypassOpen(true)}>
						Unbypass
					</Button>
				) : null}
			</div>

			{claim.isError || release.isError || reach.isError || bypass.isError || unbypass.isError ? (
				<p style={{ marginTop: 10, fontSize: 'var(--text-xs)', color: 'var(--rose-500)' }}>
					{[claim, release, reach, bypass, unbypass].map((m) => (m.error as Error)?.message).find(Boolean)}
				</p>
			) : null}

			<Dialog
				open={reachOpen}
				onClose={() => setReachOpen(false)}
				title="Reach waypoint"
				footer={
					<>
						<Button variant="ghost" onClick={() => setReachOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="primary"
							disabled={!resolution.trim() || !resolutionGist.trim() || reach.isPending}
							onClick={() => {
								reach.mutate(
									{ waypointId: waypoint.id, resolution, resolutionGist },
									{
										onSuccess: () => {
											setReachOpen(false);
											setResolution('');
											setResolutionGist('');
										}
									}
								);
							}}
						>
							Reach
						</Button>
					</>
				}
			>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					<Textarea label="Resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="The full decision." />
					<Textarea
						label="Resolution gist"
						value={resolutionGist}
						onChange={(e) => setResolutionGist(e.target.value)}
						placeholder="Short summary shown in lists/graphs."
					/>
				</div>
			</Dialog>

			<Dialog
				open={bypassOpen}
				onClose={() => setBypassOpen(false)}
				title="Bypass waypoint"
				footer={
					<>
						<Button variant="ghost" onClick={() => setBypassOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="danger"
							disabled={!bypassReason.trim() || bypass.isPending}
							onClick={() => {
								bypass.mutate(
									{ waypointId: waypoint.id, reason: bypassReason },
									{ onSuccess: () => { setBypassOpen(false); setBypassReason(''); } }
								);
							}}
						>
							Bypass
						</Button>
					</>
				}
			>
				<Textarea label="Reason" value={bypassReason} onChange={(e) => setBypassReason(e.target.value)} placeholder="Why this waypoint is being routed around." />
			</Dialog>

			<Dialog
				open={unbypassOpen}
				onClose={() => setUnbypassOpen(false)}
				title="Unbypass waypoint"
				footer={
					<>
						<Button variant="ghost" onClick={() => setUnbypassOpen(false)}>
							Cancel
						</Button>
						<Button
							variant="primary"
							disabled={!unbypassReason.trim() || unbypass.isPending}
							onClick={() => {
								unbypass.mutate(
									{ waypointId: waypoint.id, reason: unbypassReason },
									{ onSuccess: () => { setUnbypassOpen(false); setUnbypassReason(''); } }
								);
							}}
						>
							Unbypass
						</Button>
					</>
				}
			>
				<Textarea
					label="Reason"
					value={unbypassReason}
					onChange={(e) => setUnbypassReason(e.target.value)}
					placeholder="Why this waypoint is back in scope."
				/>
			</Dialog>
		</div>
	);
}
