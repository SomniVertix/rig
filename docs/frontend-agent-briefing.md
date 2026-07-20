# Rig Platform — Briefing for Frontend Work

**Audience:** an agent picking up UI/frontend work on `packages/web` (or a
replacement for it) with no prior context on this repo.

**Written:** 2026-07-19. Verify against current source before relying on
specifics — this is a snapshot, not a spec.

---

## 1. What Rig is

Rig is an AI workflow engine + spec-driven development pipeline. It runs as
one long-lived Node daemon (MCP tool server + REST API + static SPA host),
backed by Postgres, and walks a feature from idea to shipped code through a
human-gated pipeline:

```
idea → [trail: discovery] → requirements → design → tasks → implementation
```

AI agents (via `mcp__rig__*` MCP tools) do all the *authoring*. Humans only
**approve or deny** each stage. The web frontend you're working on is that
human-facing review console — today it is deliberately **read-mostly**: its
only write capability is approve/deny.

Two systems share this repo:
1. A generic **YAML workflow engine** (nodes: `agent`/`human`/`guard`/`script`)
   — reusable state-machine infrastructure.
2. The concrete **spec pipeline** built on top of it — this is what the
   current frontend renders, and almost certainly what you'll be extending.

There is a *third*, mostly-orthogonal admin surface (proto/gRPC — workflows,
prompts, runs, artifacts) described in §7. It is not wired into the REST BFF
or the SPA today.

---

## 2. Core domain model

### 2.1 Specs and stages

A **spec** = one feature. It is not a file — it's rows in the `spec_pipeline`
Postgres schema, rendered to markdown on demand via `SpecRepository.renderDocument`.
It moves through three stages, each independently `not_started` →
`in_review` → `approved`:

| Stage | Produced by (agent) | Content |
|---|---|---|
| `requirements` | `requirements-compiler` | User stories, EARS acceptance criteria, non-goals, open questions, glossary |
| `design` | `design-drafter` | Architecture, components, data model, traceability to requirements, risks |
| `tasks` | `tasks-drafter` | Per-component ordered tasks, parallel batches, Definition of Done |

A 4th, informal "stage" (implementation) follows tasks approval, driven by
`spec-implementation-orchestrator` — it's not part of the `spec_stages`
state machine and has no document/approval of its own; task checkboxes are
the progress signal.

Design and Tasks stages are **componentized** — a spec can have multiple
design/tasks documents, one per "component" (see `component` query params
throughout the API). Requirements is not componentized.

Approve/deny is **human-only and not exposed via any MCP tool** — an AI
agent cannot self-approve its own draft. This is *why the web UI exists*.

### 2.2 Trails and waypoints (the `discovery` schema — no UI yet)

Stage 0 ("discovery," i.e. turning a loose idea into a chartered destination)
lives in a separate Postgres schema, `discovery`, accessed through its own
MCP tool set (`create_trail`, `add_waypoint`, `reach_waypoint`, etc. — see
the deferred `mcp__rig__*` tools available in this session for the full
list).

- A **trail** is one effort to turn an idea into a destination (a
  `trailhead_prompt` → a `destination` statement).
- A **waypoint** is one question driven to a decision, through the lifecycle
  `sighted → marked → claimed → reached | bypassed` (both terminal states
  unblock dependent waypoints — see `add_waypoint_dependency`).
- `complete_trail` with `outcomeKind: "spec"` creates a spec and links it
  (`discovery.trails.outcome_spec_id`) in one transaction — at most one
  trail per spec. `requirements-compiler` reads the linked trail's reached
  waypoints as its decisions transcript.
- Stuck waypoint claims recover via `release_waypoint`, psql, or lapse after
  `RIG_CLAIM_TTL` hours (default 24).

**This is the single biggest gap in the current frontend**: nothing in the
SPA renders the `discovery` schema. `trail_changed`/`waypoint_changed` SSE
events already fire on the shared event feed (see §5.3) but have zero UI
consumers. If you're being asked to build out "the next surface," a
trails/waypoints view is the most likely candidate — read
`packages/persistence/src/trail-repository.ts` (1069 lines — the full CRUD
+ query surface you'd need a REST layer over) and
`docs/wayfinder-trails-recreation-2026-07-19.md` for real example trail data
shapes before starting.

### 2.3 Guardrails & audit

Every MCP write tool requires an `actor` argument, checked against a
`known_actors` Postgres table (synced at boot from a curated actors
directory). Every mutation writes one `audit_log` row in the same
transaction. **The REST BFF write routes (`approve`/`deny`) bypass all of
this** — see §6 "Known gap" below.

---

## 3. Monorepo package map

pnpm workspace, package names `@rig/*`. Only skim packages you don't touch:

| Package | Role | Relevant to frontend work? |
|---|---|---|
| `schema` | Shared Zod contracts for the generic engine | No |
| `proto` | Protobuf defs for the generic engine's admin API | Only if you touch §7 |
| `engine` | Generic YAML workflow interpreter | No |
| `executors` | Claude/Pi agent-turn execution backends | No |
| `library` | Bundled agent prompts / spec templates / workflow YAML | No |
| `persistence` | **`SpecRepository`** (all spec/stage CRUD + `discovery` trail/waypoint CRUD, `renderDocument`) + `SpecChangeEmitter` (the pub/sub behind SSE) | **Yes — read this to know what data exists to expose** |
| `server` | The daemon: MCP tools, **REST BFF (`web/routes/*`)**, config, scheduler, proto-RPC admin service | **Yes — `packages/server/src/web/` is the API you call** |
| `web` | **The React SPA you're working on** | **Yes** |
| `test-support` | Shared test fixtures | Only for writing tests |

---

## 4. Current frontend (`packages/web`)

Stack: React 19 + `react-router-dom` v7 (`createBrowserRouter`) + TanStack
Query v5 + `react-markdown` (with `rehype-sanitize` — documents are
agent-authored markdown, sanitized before render since they're rendered as
real DOM). Built with Vite; `vite.config.ts` proxies `/api` and `/docs` to
the daemon (`RIG_WEB_PORT`, default 8788) in dev.

**Files** (all of it — this is a v1, small):
```
packages/web/src/
  App.tsx              — router root; opens the ONE app-level SSE subscription
  main.tsx             — entry point
  api/client.ts         — typed fetch wrappers for every REST endpoint + query-key factory
  api/events.ts         — SSE subscriber; maps SpecChangeEvent -> query keys to invalidate
  routes/SpecsList.tsx  — "/" — table of specs with per-stage status badges
  routes/SpecDetail.tsx — "/specs/:specId" — per-stage rendered doc + approve/deny
```

**Data-fetch pattern to follow** if you add screens: TanStack Query with
query keys `['specs']`, `['spec', specId]`, `['spec-doc', specId, stage]`
(built via `queryKeys` in `api/client.ts`). One `EventSource` is opened once
in `App.tsx` (never remounted across navigation); its `onmessage` handler
(`api/events.ts`'s `getInvalidationKeysForEvent`) maps each SSE event to the
query keys to invalidate. **Mutations do not locally update the cache** —
`approveStage`/`denyStage` just POST and rely on the resulting SSE
`spec_changed` ping (self-triggered by the write) to refresh state. Follow
this pattern rather than optimistic updates unless you have a reason not
to.

**Known limitation**: `GET /api/specs` requires a `project` query param
with **no default** — `SpecsList.tsx` currently reads it from the page's own
URL (`?project=`). There's no project picker UI. Project scoping is an
explicitly-unresolved open question in the original design (see also §7's
workspace-binding redesign in progress, which will eventually change how
projects are identified entirely).

---

## 5. REST API — the BFF you'll actually call

Base implementation: `packages/server/src/web/`. Registered on one Fastify
instance (`app.ts`): `buildWebApp` (SSE + swagger) → `buildApp` (adds
read/write routes, error handler, static SPA hosting with history-fallback).

- **Live OpenAPI/Swagger UI at `GET /docs`** (fed by the same Zod schemas
  below via `fastify-type-provider-zod` — this is your best up-to-date
  source of truth; the routes below reflect current source but the running
  `/docs` is generated, not hand-maintained).
- All routes are namespaced under `/api`.
- Error shape (every non-2xx): `{ "error": "<rule>", "message": "<text>" }`
  — thrown as `SpecRepositoryError`, mapped by `error-handler.ts`. The `web`
  client wraps this in `ApiError { status, rule, message }`.
- No authentication anywhere on this surface (see §6).

### 5.1 Reads (`web/routes/reads.ts`)

**`GET /api/specs?project=<slug>`**
Required query param `project` (spec's project slug, resolved via
`ensureProject`). Returns:
```ts
Array<{
  id: string;
  slug: string;
  featureName: string;
  currentStage: 'requirements' | 'design' | 'tasks';
  stages: {
    requirements: 'not_started' | 'in_review' | 'approved';
    design: 'not_started' | 'in_review' | 'approved';
    tasks: 'not_started' | 'in_review' | 'approved';
  };
}>
```

**`GET /api/specs/:specId`**
Same shape as one array element above, for a single spec. 404 (`not_found`)
if the spec doesn't exist. No project param needed — `specId` is globally
unique.

**`GET /api/specs/:specId/stages/:stage/document?component=<slug>`**
`stage` ∈ `requirements | design | tasks`. `component` is optional (only
meaningful for `design`/`tasks`, which are componentized — omit it for
`requirements`, or to get the "default"/aggregate document). Returns:
```ts
{ markdown: string }
```
Rendered server-side by `SpecRepository.renderDocument` from live Postgres
rows — always current, never stale content baked at draft time.

### 5.2 Writes (`web/routes/writes.ts`)

**`POST /api/specs/:specId/stages/:stage/approve`**
**`POST /api/specs/:specId/stages/:stage/deny`**
Body (all optional, `{}` is valid):
```ts
{ component?: string; reason?: string }
```
- `component` required only when `stage === 'tasks'` (component-scoped
  approval) — omitting it when required surfaces as a `400` from
  `SpecRepository`'s own validation, not a schema-level rejection.
- `reason` is accepted for shape-symmetry with a hypothetical future UI but
  **is never persisted anywhere** — there's no column for it. Don't build a
  "denial reason" feature expecting it to show up later without a backend
  change first.
- Response:
```ts
// approve: { stage, componentSlug?, status: 'approved' }
// deny:    { stage, componentSlug?, status: 'not_started' }
```
- Every write here is attributed to the **fixed literal actor `'web-ui'`**
  — never a real signed-in user, never checked against `known_actors`. See
  §6.

### 5.3 Live updates (`web/routes/events.ts`)

**`GET /api/events`** — Server-Sent Events, unauthenticated, raw (not
Zod-typed, not in the swagger doc — it's a `reply.hijack()`'d raw stream).

- Wire format: default/unnamed SSE frames, `data: <json>\n\n`, read via
  `EventSource#onmessage` (no `event:` field to switch on).
- `: ping\n\n` comment-frame heartbeat every 15s (invisible to `onmessage`,
  purely to stop idle-timeout proxies dropping the connection).
- Every `SpecChangeEvent` on the server's shared `SpecChangeEmitter`
  (`packages/persistence/src/spec-change-emitter.ts`) is forwarded verbatim
  to every connected client — it is a **"something changed, go refetch"**
  signal, never a payload carrying the new state.
- Event shapes currently emitted (check `spec-change-emitter.ts` for the
  authoritative union): `{ type: 'spec_changed', specId, stage, component? }`
  plus (fired, unconsumed) `trail_changed` / `waypoint_changed` variants for
  the `discovery` schema.
- Client behavior on reconnect: the browser's native `EventSource`
  auto-reconnects on transport error. `packages/web/src/api/events.ts`
  tracks whether a drop happened since the last successful `open`, and if
  so, invalidates **every** query (not just the last known event) on
  reconnect, since events may have been missed while disconnected.

---

## 6. Known gaps to be aware of before building on this

1. **No auth anywhere on the REST BFF.** Approve/deny — the only place a
   stage becomes `approved` — is reachable by anyone who can reach port
   8788, attributes to a fixed `'web-ui'` actor, and bypasses the
   `known_actors` guardrail every MCP write tool enforces. This is only
   acceptable today because the web port is bound to `127.0.0.1` on the
   host in `docker-compose.yml`. If you're asked to add real user auth,
   this is the surface that needs it most.
2. **Trails/waypoints have no UI** (§2.2). This is the most likely "build
   the next screen" ask.
3. **Project scoping is unresolved** (§4) — there's no picker, no default,
   and a workspace-binding redesign is planned that will change how a
   project's identity is derived at all (see
   `docs/wayfinder-trails-recreation-2026-07-19.md`, Trail B — not built
   yet as of this writing, but if it lands, `?project=<slug>` may stop
   being the right mental model).
4. **`reason` on deny is a no-op server-side** — don't wire up UI that
   implies it's saved without checking `SpecRepository.denyStage` first.

---

## 7. APIs that exist but the frontend does NOT use today

Two other API surfaces exist in this codebase. Neither is wired into
`packages/web` — mention them only because "document the API endpoints"
should cover what's *available*, not just what's consumed today.

**MCP tool catalog** (`mcp__rig__*`, `packages/server/src/mcp/tools/*`) —
the interface AI agents use to author specs/trails. Full current tool list
is visible to you right now as deferred tools (`mcp__rig__create_spec`,
`mcp__rig__add_waypoint`, `mcp__rig__finalize_stage`, etc. — dozens, see the
system reminder listing). This is *not* an HTTP API; it's the MCP protocol
over the daemon's port 8787 (bearer-token authed). Not something a browser
frontend calls directly.

**Proto/gRPC admin API** (`packages/proto/proto/rig.proto`, implemented in
`packages/server/src/rpc/index.ts`) — a separate admin surface for the
*generic* workflow engine (not the spec pipeline):
- `WorkflowsService`: `List`, `Get`, `Validate`, `Create`, `Update`,
  `SnapshotDiff`
- `PromptsService`: `List`, `Get`, `Validate`
- `RunsService`: `Start`, `Get`, `List`, `Abort`, `Delete`, `Signal`,
  `Events` (server-streaming)
- `ArtifactsService`: `Read`, `Metadata`

This manages YAML workflow definitions and their runs — distinct from spec
approval. There is currently no REST/BFF wrapper or SPA screen for it. If a
future ask is "let humans manage workflow runs from the browser," this is
the backend surface to wrap, mirroring how `web/routes/{reads,writes}.ts`
wrap `SpecRepository` today rather than calling MCP tools directly.

---

## 8. Running it locally

```
docker-compose.yml  — postgres (16) + server (MCP :8787, web :8788, bound to 127.0.0.1)
```
- No migrations runner: `spec-templates/spec/db/schema.sql` is a single
  idempotent DDL file applied on every boot.
- `pnpm --filter @rig/web dev` — Vite dev server, proxies `/api` and
  `/docs` to `http://localhost:$RIG_WEB_PORT` (default 8788), so run the
  daemon (docker-compose or `pnpm --filter @rig/server` build+start) first.
- `pnpm --filter @rig/web test` — Vitest (jsdom) for the SPA.
- `pnpm --filter @rig/server test` — includes `test/e2e/web-api.test.mjs`
  and `test/e2e/sse.test.mjs`, the closest thing to a contract test for
  what you're calling from the frontend.

---

## 9. Where to look first, by task

| If you need to... | Read |
|---|---|
| Know the exact current wire shape of an endpoint | `/docs` (live swagger) on the running daemon, or `packages/server/src/web/routes/{reads,writes,events}.ts` |
| Know what's queryable that isn't exposed via REST yet | `packages/persistence/src/spec-repository.ts` (specs) / `trail-repository.ts` (trails/waypoints) |
| Match existing frontend conventions | `packages/web/src/routes/SpecDetail.tsx` — most fully-featured existing screen (query, mutation, SSE-driven refresh, status display) |
| Understand a domain term (waypoint, trail, stage, component) | `FUNCTIONALITY.md` (repo root) — the canonical short platform overview this briefing expands on |
| See a worked example of trail/waypoint data | `docs/wayfinder-trails-recreation-2026-07-19.md` |
