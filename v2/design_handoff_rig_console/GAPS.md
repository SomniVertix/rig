# Gaps between this handoff and the V2 backend

This handoff (`README.md`, `Rig Console.html`, `rig-api-requirements.md`, `_ds/`) was
written against the V1 stack: a Fastify/Zod REST BFF on port 8788, Postgres, and a
domain of specs/stages/trails/sessions/runs/audit with `known_actors` guardrails and
SSE pings. V2 (`v2/cmd/rig`, `v2/internal/graph`, `v2/internal/workspace`) is a
from-scratch Go + Neo4j rewrite that does not match those assumptions. Filed here so
the next design pass (or a redraft) starts from the current ground truth instead of
V1's.

## 1. Backend architecture in the doc is wrong for V2

`rig-api-requirements.md` frames everything as "Zod-typed Fastify routes... wrapping
repositories directly," a REST BFF on port 8788, Postgres-backed. None of that exists
or is planned in V2. V2 serves REST + MCP directly from one Go binary
(`v2/cmd/rig/main.go`) on port 8789 (`RIG_HTTP_ADDR`), with no separate BFF layer and
no SSE mechanism at all. `rig-api-requirements.md` needs a V2-native rewrite before
it's usable as an implementation contract again — that rewrite is a separate,
already-anticipated effort. Until then, this handoff's doc should stop citing V1 file
paths (`packages/server/src/web/routes/`) as ground truth.

## 2. Domain rename: trail → expedition

V2's Go rewrite renamed "trail" to "expedition" (`internal/graph/domain/expedition.go`)
— same concept, same waypoint lifecycle (`sighted → marked → claimed → reached |
bypassed`, with rehydration), different API nouns (`GET /expeditions`,
`expedition_changed` instead of `GET /api/trails`, `trail_changed`). Recommendation:
keep the business-approved "Trail"/"Wayfinder" *user-facing* copy as-is — no reason to
reopen approved language — and treat the rename as a data-layer translation detail
only. Flag this explicitly so future design work doesn't reintroduce "trail" as a
literal API term when writing against V2.

## 3. Several sections of the handoff still have no backend owner

**Update (2026-07-28, mid-build):** the spec pipeline landed in V2 since this doc was
first written — `GET /specs`, `GET /specs/{id}`, `GET /specs/{id}/next-stage`,
`GET /specs/{id}/render`, `POST /specs/{id}/finalize`, `POST /specs/{id}/approve`,
`POST /specs/{id}/deny` are now real, Neo4j-backed endpoints
(`internal/graph/api/router.go`, `internal/graph/store/neo4jstore/specs.go`), not
stubs. §2 (Specs list) and §3 (Spec detail + review gate) now have a real backend to
build against, same as §4/§5 (Wayfinder). This is a fast-moving backend — re-check
`openapi/graph.yaml` before assuming any section below is still unbuilt.

Still confirmed stub-only or entirely absent in V2 as of this update:

- Sessions / grilling — `start_session` returns `store.ErrNotImplemented`; no
  transcript storage or read path.
- Workflow runs — no runs/executor/scheduler surface exists in V2 at all.
- Audit log — no general audit table; only scattered per-field reason strings
  (`reopenReason`, `unbypassReason`).
- `known_actors` actor-attribution guardrails — no validation or enforcement in V2.

This means §1 (Projects), §6 (Session transcript), §7 (Live session), §8 (Audit log),
§9 (Runs), and §10 (Session launcher) of the handoff currently have nothing to
integrate against. The handoff should mark these sections "pending backend" so nobody
starts a real-API integration pass against them prematurely.

## 3b. `openapi/graph.yaml` has at least one confirmed drift from the real handler

Live-tested against `go run ./cmd/rig` (docker compose): `POST /waypoints/{id}/unbypass`
documents no request body in `openapi/graph.yaml`, but the service layer actually
requires a non-empty `reason` (500s with `"unbypass_waypoint requires a non-empty
reason"` otherwise) — matches the shared `reasonRequest` shape noted in a `dto.go`
comment (`reopen_expedition` / `unbypass_waypoint` / `unspur_waypoint` all take a
reason) that just never made it into the OpenAPI doc. Worth re-diffing
`openapi/graph.yaml` against `dto.go`/`handlers.go` directly rather than trusting the
YAML alone — this doc is evidently drifting from the real contract as V2 development
continues in parallel.

## 4. Project-identity / scoping model is unresolved, not just "planned"

`rig-api-requirements.md` §1 says a "planned workspace-binding redesign" might change
project identity — that phrasing is stale on two counts:

- V1's workspace-binding redesign already shipped: header-based `X-Rig-Project-Id` via
  a `rig-resolver` binary, replacing per-repo slug URLs.
- V2 has a third, different mechanism: `POST /resolve` (cwd → projectId), built for
  CLI/MCP clients — not meaningfully callable from a browser tab (there's no "cwd" in
  a console session), and there is no "list projects" endpoint in V2 at all.

Three different project-identity mechanisms now exist across the two trees, and none
of them is an obvious fit for a browser console's project picker. This needs an actual
decision fed back through the design/backend process, not something the UI should
guess at. (The current UI build is using a clearly-flagged provisional static project
list as a stopgap — see `v2/web/src/config/projects.ts` once it exists — pending a
real `/projects` endpoint.)
