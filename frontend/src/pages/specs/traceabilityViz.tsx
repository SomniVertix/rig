import { Badge, Card, CardPad } from '../../ds';
import { parseTraceability, parseComponentNames } from '../../domain/traceability';

/** W2 fixture — the Cross-Workspace Handoff spec's REAL Design doc
 * traceability + components tables, copied verbatim from render_document
 * (specId fe8646c2-02c4-4f5f-ba4d-0b091911af30), not a mock. This is the
 * spec that motivated the ask: 8 requirement rows, 9 components, and
 * justification text long enough that the flat table is genuinely hard to
 * scan — exactly the case worth prototyping against. */
export const REAL_TRACEABILITY_MARKDOWN = `## Components

| Slug | Display Name |
|---|---|
| workspace-directory | Workspace Directory (list_workspaces) |
| handoff-core | Handoff Domain, Store and Lifecycle |
| handoff-mcp-tools | Handoff MCP Tool Surface |
| handoff-rest-api | Handoff REST API |
| handoff-skill | /handoff Trigger Skill |
| wayfinder-status-integration | Wayfinder Status and Expedition-Origin Integration |
| console-handoffs-panel | Console Handoffs Panel |
| handoff-conversation-core | HandoffConversation Turn Protocol |
| handoff-conversation-arbiter | Arbiter Orchestration and Human Arbitration |

## Requirement Traceability

| Requirement | Addressed By |
|---|---|
| Story 1: [Core Handoff] Define and Send a Handoff | \`handoff-core\` (domain.Handoff + HandoffAttachment, single-transaction SendHandoff, exactly-one targetWorkspaceId, optional origin back-link fields, no Update/Delete method at all = AC 6 immutability) + \`handoff-mcp-tools\` (send_handoff) + \`workspace-directory\` (list_workspaces, so a target can actually be named) |
| Story 2: [Core Handoff] Track a Handoff Through Its Lifecycle | \`handoff-core\` (HandoffStatus pending→read→actioned\\|dismissed; MarkHandoffRead's \`WHERE status='pending'\` guard = AC 2; CloseHandoff's \`WHERE status IN ['pending','read']\` guard = AC 6; service TrimSpace note guard = AC 5; ResolutionNote/ResolvedAt written in the same statement = AC 3/AC 4) |
| Story 3: [Core Handoff] Operate on Handoffs via MCP Tools | \`handoff-mcp-tools\` (all six tools registered in a dedicated internal/graph/mcpserver/handoffs.go; get_handoff's \`transitionedToRead\` = AC 4; nothing in any tool's input schema references a waypointId, and the tools live outside registerWaypointTools = AC 1/AC 6) |
| Story 4: [Core Handoff] Trigger a Handoff from Any Session | \`handoff-skill\` (.meta/skills/handoff/SKILL.md: draft from context step 3, silent origin auto-fill step 4, full transcript in the body step 3, exactly one confirm-and-edit step 5, no start_session/expedition precondition anywhere = AC 5, explicit decline path that never calls send_handoff = AC 6) + \`workspace-directory\` (name → workspaceId resolution) |
| Story 5: [Core Handoff] See Pending Handoffs in Wayfinder | \`wayfinder-status-integration\` (get_workspace_status.handoffs both-directions rows + the wayfinder SKILL.md Status table = AC 1; create_expedition's originHandoffId param = AC 2; the single-statement CreateExpeditionFromHandoff Cypher write = AC 3; LineageParentHandoff + the (:Handoff)-[:ORIGINATED]->(:Expedition) edge = AC 4) + \`console-handoffs-panel\` and \`handoff-rest-api\` (the same both-directions table in the web console) |
| Story 6: [Handoff Conversation] Kick Off an Automatic Handoff Conversation | \`handoff-conversation-arbiter\` (the human's own session drives the loop and start_handoff_conversation takes arbiterSessionId rather than spawning an arbiter = AC 1; two directory-bound spawns via the harness's generic primitive = AC 2; the 10 s stat + resolve_workspace_id reachability probe that refuses to start = AC 3; the three-capability harness contract with a no-native-cwd fallback = AC 4) + \`workspace-directory\` (rootPath per side) |
| Story 7: [Handoff Conversation] Structured Turn-by-Turn Exchange | \`handoff-conversation-core\` (unique constraint on HandoffConversation.handoffId = AC 1; ordered HandoffTurn children with a (conversationId, turnNumber) unique constraint = AC 2; turnNumber/speaker/content/verdict/createdAt on every turn = AC 3; service-derived agreement check closing to closed_agreed = AC 4; DefaultHandoffTurnCap 15 deriving status escalated with reason turn_cap = AC 5) |
| Story 8: [Handoff Conversation] Arbitrate and Close with Confirmation | \`handoff-conversation-arbiter\` (turns land in the human's own transcript with no extra tooling = AC 1; one escalate + promptHuman path shared by tie_break, turn_cap, stalled_subagent and workspace_unreachable = AC 2; draft_handoff_resolution then explicit confirmation = AC 3; the decline branch that calls neither action_handoff nor dismiss_handoff = AC 4) + \`handoff-conversation-core\` (escalated status/escalationReason and the drafted* fields recorded without ever touching Handoff.status) |
`;

/** W2 decision (wayfinder specs-ui-review-surfaces): grouped-by-requirement
 * cards — one card per story, a badge row of which components address it,
 * each with its justification as its own line instead of one run-on
 * paragraph. A coverage matrix and a component-first drill-down were also
 * prototyped and rejected as too noisy relative to this. W3 wires this into
 * SpecDetailPage.tsx's Design tab, replacing the flat markdown table. */
export function TraceabilityCardsPrototype({ markdown }: { markdown: string }) {
	const rows = parseTraceability(markdown);
	const names = parseComponentNames(markdown);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
			{rows.map((row, i) => (
				<Card key={i}>
					<CardPad>
						<div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', marginBottom: 8, color: 'var(--text-strong)' }}>
							{row.requirement}
						</div>
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
							{row.addressedBy.map((a) => (
								<Badge key={a.componentSlug} tone="accent">
									{names[a.componentSlug] ?? a.componentSlug}
								</Badge>
							))}
						</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							{row.addressedBy.map((a) => (
								<div key={a.componentSlug} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-body)' }}>
									<code style={{ fontSize: 'var(--text-xs)' }}>{a.componentSlug}</code> — {a.justification}
								</div>
							))}
						</div>
					</CardPad>
				</Card>
			))}
		</div>
	);
}
