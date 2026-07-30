# Rig Console — Backend API Requirements

**For:** the Rig agent working in the Rig monorepo (`packages/server`, `packages/persistence`).
**From:** the Rig Console UI design (`Rig Console.dc.html`, this project).
**Baseline:** `uploads/frontend-agent-briefing.md` (2026-07-19 snapshot). Everything below is what the designed console needs that the REST BFF does not provide today. Follow existing conventions: Zod-typed Fastify routes in `packages/server/src/web/routes/`, wrapping repositories directly (not MCP tools), error shape `{ error, message }`, SSE as "something changed, go refetch" pings.

Already covered by existing routes (no work): specs list/detail, stage documents (incl. `component` param), approve/deny, `spec_changed` SSE.

---

## P1 — blocks the core console

### 1. Projects aggregate + picker
The console is project-scoped everywhere (sidebar picker, projects overview sorted by attention). Today `?project=` has no default and no way to enumerate projects.

**`GET /api/projects`** →
```ts
Array<{
  slug: string;
  specCounts: { total: number; byStage: Record<'requirements'|'design'|'tasks', Record<'not_started'|'in_review'|'approved', number>> };
  gatesWaiting: Array<{ specId: string; featureName: string; stage: string; component?: string }>; // in_review items
  trailCounts?: { active: number; settled: number; chartered: number }; // once trails REST exists
  lastWriteAt: string; // ISO, from audit_log
}>
```
UI sorts: projects with `gatesWaiting.length > 0` first ("Needs your review"), rest "Quiet". Emit a `project_changed` SSE variant (or reuse existing events — UI just refetches the aggregate).

Note: the planned workspace-binding redesign may change project identity. If that lands first, this endpoint should return workspace bindings instead of slugs — the UI contract (list + counts + attention) is the same.

### 2. Trails/waypoints REST layer (Wayfinder)
`packages/persistence/src/trail-repository.ts` has the full query surface; expose reads:

**`GET /api/trails?project=<slug>`** →
```ts
Array<{
  id: string; name: string;
  status: 'active' | 'settled' | 'chartered'; // derived: chartered = outcome_spec_id set; settled = all waypoints terminal; else active
  trailheadPrompt: string; destination: string;
  waypointCounts: Record<'sighted'|'claimed'|'marked'|'reached'|'bypassed', number>;
  grillingSessionId?: string; outcomeSpecId?: string;
  updatedAt: string;
}>
```

**`GET /api/trails/:trailId`** → the above plus:
```ts
{
  waypoints: Array<{
    id: string; title: string;
    state: 'sighted'|'claimed'|'marked'|'reached'|'bypassed';
    decision?: string;                      // for reached/marked
    claimedBy?: string; claimedAt?: string; // for claimed
    dependsOn: string[];                    // waypoint ids (add_waypoint_dependency)
  }>;
}
```
The dependency graph view needs `dependsOn`; the sidebar shows claim + TTL info. `trail_changed` / `waypoint_changed` SSE already fire — the web client will start consuming them; no server change needed there.

**`GET /api/specs/:specId` addition:** include `originTrailId?: string` (reverse of `trails.outcome_spec_id`) so spec detail can link back to its trail.

### 3. Grilling sessions — reads
**`GET /api/trails/:trailId/session`** (or `GET /api/sessions/:id`) →
```ts
{ id: string; startedAt: string; endedAt?: string;
  turns: Array<{ n: number; question: string; answer: string }>;
  trailId?: string; outcomeSpecId?: string }
```
Persisted transcripts exist in the `discovery` schema; this is a read-only render of them.

---

## P2 — review-loop quality

### 4. Persist and expose deny reason
Today `reason` on `POST …/deny` is accepted and dropped (no column). Needed:
- Column on the stage/component row: `last_denial_reason text`, `denied_at timestamptz` (cleared on next `finalize_stage`).
- Include in `GET /api/specs/:specId` per stage: `{ status, lastDenialReason?, deniedAt? }`.
- UI shows: `Denied — "<reason>" · <agent> redrafting…`.

### 5. Stage activity signal ("redrafting…")
After a deny the UI wants to show the drafting agent working. Cheapest honest version: per stage, `activeRun?: { runId: string; agent: string; startedAt: string }` on the spec payload, derived from the engine's runs table where the run targets this spec+stage. A `spec_changed` ping when a run starts/ends is enough for refresh.

### 6. Audit log read
**`GET /api/audit?project=<slug>&limit=50&before=<cursor>`** →
```ts
Array<{ at: string; actor: string; action: string; target: string }>
```
Straight read of `audit_log`, newest first, cursor-paginated. Optional `audit_changed` SSE variant; polling on navigation is acceptable for v1.

### 7. Health + counts
**`GET /api/health`** → `{ daemon: 'ok'; postgres: 'connected'|'error'; version: string; webPort: number }`. Sidebar shows daemon/postgres status and version. Nav counts (specs, trails, runs per project) come from the §1 aggregate — no separate endpoint.

---

## P3 — new surfaces (bigger builds; confirm scope before starting)

### 8. Workflow runs REST wrapper
The console has a Runs page (run id, workflow, current node, executor, status, started). Wrap the existing gRPC `RunsService` (`List`, `Get`, `Abort`) as:
- `GET /api/runs?project=&status=`
- `GET /api/runs/:runId`
- `POST /api/runs/:runId/abort` (write — needs actor attribution, see §10)
Mirror how `web/routes/*` wraps `SpecRepository`; do not call MCP tools.

### 9. Interactive grilling from the browser
The console designs a full in-browser discovery session: start session (choose executor claude|pi, project, seed prompt) → agent asks one question at a time → human answers → finalize → agent proposes trailhead + destination → human edits/approves → **chart trail** (create trail + link transcript in one transaction, i.e. the existing `complete_trail`-style semantics) → or end as a scratch session (transcript persisted, no trail).

This is the largest gap — today grilling only runs agent-side via MCP. Required, roughly:
- `POST /api/sessions` `{ project, kind: 'discovery'|'scratch', executor, model, seed, agentActor }` → `{ sessionId }`
- `GET /api/sessions?project=` (open + recent scratch)
- `POST /api/sessions/:id/answer` `{ text }` → next question arrives via SSE `session_changed` ping + refetch
- `POST /api/sessions/:id/finalize` → agent drafts trailhead/destination proposal
- `POST /api/sessions/:id/chart` `{ trailheadPrompt, destination }` → creates trail, links transcript, one transaction
- `POST /api/sessions/:id/end` (scratch: persist + close) / `DELETE` (discard)
- SSE: `session_changed { sessionId }`
Server drives the executor turn loop (reuse `packages/executors`); the browser never talks to an executor directly.

### 10. Actor attribution / auth for web writes
All web writes are the fixed literal `'web-ui'`, bypassing `known_actors`, with no auth on port 8788. The launcher UI selects an actor (e.g. `jordan@web-ui`). Minimum: accept an `actor` on write routes, validate against `known_actors`, write `audit_log` in-transaction like MCP tools do. Real user auth is a prerequisite before this surface leaves localhost — flagging, not designing it here.

---

## SSE summary (additions)
Existing: `spec_changed`, `trail_changed`, `waypoint_changed` (last two currently unconsumed — UI will consume them, no change).
New variants needed: `session_changed` (§9), optionally `run_changed` (§8), `audit_changed` (§6). Keep the "ping, never payload" contract.

## Suggested build order
1. §2 trails reads + §3 session transcript reads (repo code exists; pure exposure)
2. §1 projects aggregate (+ picker unblocks all project scoping)
3. §4 deny reason + §5 activity signal
4. §6 audit + §7 health
5. §8 runs wrapper
6. §9 interactive sessions (confirm scope first) · §10 actor/auth alongside any new writes
