# graph service

The expeditions/waypoints graph, rewritten in Go against Neo4j. Ported from
v1's `discovery` Postgres schema (`../../.meta/spec/db/schema.sql`, PART 2,
where this concept was called "trails") — an **expedition** is one effort to
turn a loose idea into a destination; a **waypoint** is one question driven
to a decision through `sighted -> marked -> claimed -> reached | bypassed`.
Waypoints link to each other via dependency edges ("from" blocks "to"), and a
waypoint's resolution can spur a brand-new child expedition (lineage).

## Layout

```
domain/         Expedition, Waypoint, WaypointAsset, ExpeditionTerm, Session, ExpeditionLineage
store/          Store port (interface) + param/error types
store/neo4jstore/  Neo4j implementation (Cypher)
service/        business rules above the store (slug validation, ...)
api/            net/http handlers + router + JSON DTOs (REST)
mcpserver/      MCP tools wrapping service, served over streamable HTTP at /mcp when mounted by cmd/rig
config/         env-var configuration (Neo4j connection only; listen address is cmd/rig's concern)
```

`../../openapi/graph.yaml` is the REST contract `api` implements. `mcpserver`
wraps `service` directly (no HTTP round-trip to the REST API this same process
also serves) and exposes the mcp__rig__* tool catalog documented in
`../../.meta/skills/wayfinder/SKILL.md`, using that doc's "expedition"/"waypoint"
vocabulary, matching the Go domain types underneath.

## Graph model

```
(:Expedition {id, workspaceId, slug, title, briefingPrompt, destination, notes,
              status, outcomeKind, outcomeSpecId, outcomeSummary, sessionId,
              createdAt, updatedAt})
(:Waypoint {id, expeditionId, waypointNumber, title, question, approach,
            status, claimedBy, claimedAt, resolution, resolutionGist,
            rationale, bypassReason, previousStatus, reachedIn, reachedAt,
            spurredToExpeditionId, createdAt, updatedAt})
(:WaypointHistoryEntry {id, waypointId, ordinal, sourceStatus, resolution,
                         resolutionGist, rationale, reachedIn, reachedAt,
                         bypassReason, reason, supersededAt, createdAt})
(:WaypointFlag {id, targetWaypointId, sourceWaypointId, note, raisedAt,
                 resolved, resolvedAt, resolvedReason})
(:WaypointAsset {id, waypointId, ordinal, kind, title, contentMarkdown,
                  repoPath, commitSha, createdAt})
(:ExpeditionTerm {id, expeditionId, term, definition, createdAt, updatedAt})

(:Expedition)-[:HAS_WAYPOINT]->(:Waypoint)
(:Waypoint)-[:BLOCKS]->(:Waypoint)      -- from_waypoint blocks to_waypoint
(:Waypoint)-[:SPURRED]->(:Expedition)   -- spur_waypoint lineage edge
(:Session)-[:CHARTERED]->(:Expedition)  -- session-chartered lineage edge
(:Waypoint)-[:HAD_STATE]->(:WaypointHistoryEntry)  -- rehydrate_waypoint snapshot
(:WaypointFlag)-[:FLAGS]->(:Waypoint)              -- flag_waypoint target (required)
(:Waypoint)-[:RAISED]->(:WaypointFlag)             -- flag_waypoint source (optional)
(:Waypoint)-[:HAS_ASSET]->(:WaypointAsset)         -- add_waypoint_asset
(:Expedition)-[:HAS_TERM]->(:ExpeditionTerm)       -- add_expedition_term
```

## What's implemented vs. deferred

Implemented with real Cypher: expedition CRUD (create/get/list/update/
complete/abandon/reopen), waypoint CRUD, the atomic claim/release/reach/
bypass/unbypass lifecycle, the canonical frontier query, dependency edges
(including listing them), and spur/unspur lineage — this is the graph-shaped
core. `SpurWaypoint` is one Cypher transaction that both creates the child
expedition *and* reaches the origin waypoint (status, resolution,
resolutionGist, rationale, reachedIn all set), legal only from
marked/claimed/rehydrating, same as `ReachWaypoint` — a waypoint that spurs
an expedition doesn't sit in a non-terminal status forever blocking its
dependents.

Also implemented: `RehydrateWaypoint`/`ListWaypointHistory` (redo a reached
or bypassed waypoint's decision without ever deleting the prior one — an
append-only `WaypointHistoryEntry` snapshot per redo) and
`FlagWaypoint`/`ResolveWaypointFlag`/`ListWaypointFlags`/
`ListUnresolvedFlagsForExpedition` (a non-mutating, cross-expedition marker
that a waypoint's decision may need reconsidering, independent of the
target's own status or its expedition's active/complete/abandoned state).
Exposed over MCP as `rehydrate_waypoint`, `flag_waypoint`, and
`resolve_waypoint_flag` — see the wayfinder skill's "Redoing a decision:
rehydrate" and "Cross-expedition flags" sections for the orchestration this
enables.

Also implemented: waypoint assets (`AddWaypointAsset`/`ListWaypointAssets` —
what resolving a waypoint produced, a document stored whole or a reference
to code committed on main, unguarded by the waypoint's status) and
expedition terms (`AddExpeditionTerm`/`UpdateExpeditionTerm`/
`ListExpeditionTerms` — a per-expedition glossary, rejecting a
case-insensitive duplicate term). Exposed over MCP as `add_waypoint_asset`
(assets surface via `get_waypoint`'s detail view) and `add_expedition_term`/
`update_expedition_term` (terms surface via `get_expedition`'s `terms`
bucket) — no standalone `list_*` tools for either, matching the "zoom as
needed" pattern the rest of this package already uses.

`mcpserver` adds `render_walk_order`: a server-side topological
sort of an expedition's marked/rehydrating waypoints (blockers before
dependents, frontier first, stable by waypoint number), rendered directly in
the wayfinder skill's fixed handoff-command shape. It exists so an agent
doesn't have to hand-sort waypoints and hand-format that block itself — the
same data also answers `get_expedition`'s `edges` field via
`ListWaypointDependencies`.

Deferred (`store.ErrNotImplemented`, surfaced as HTTP 501 over REST, and as
a clear tool error over MCP): session bookkeeping. This is satellite/audit
data v1 kept in the same schema but isn't graph-shaped itself; add it once
it's needed for more than the sessionId string callers already thread
through claimedBy/reachedIn by hand.

Also implemented: fog-of-war. `AddWaypoint` accepts `sighted: true` to
create a waypoint as fog (`domain.WaypointSighted`) instead of `marked` —
mutually exclusive with an inline resolution, since a fog patch isn't sharp
enough to resolve in the same breath it's sensed. `UpdateWaypoint` accepts
`mark: true` to graduate a sighted waypoint to `marked` in the same call as
sharpening its title/question; guarded, so it errors if the waypoint isn't
currently sighted.

The spec pipeline (specs, requirements/design/tasks stages,
`complete_expedition`'s `outcomeKind: "spec"` branch, `list_specs`, `get_spec`,
and the full requirements/design/tasks tool catalog) is now a real,
Neo4j-backed implementation — see `spec-pipeline-graph.md` at the repo root
for the full design record. `get_workspace_status` still doesn't aggregate
real spec rows into its response (`SpecsNote` is a static string, not a live
`ListSpecs` call) — that's the one remaining gap, tracked separately from the
pipeline itself being real.

## Running

This package no longer runs as its own process — it's a library mounted by
`cmd/rig` (see the top-level `README.md`) alongside `internal/binding`,
sharing one port and one MCP server. Its own env vars are just its slice of
`cmd/rig`'s configuration: `GRAPH_NEO4J_URI`, `GRAPH_NEO4J_USERNAME`,
`GRAPH_NEO4J_PASSWORD` (required), `GRAPH_NEO4J_DATABASE`.

A waypoint claim never expires automatically — this deliberately diverges
from v1's TTL-based reclaim (`RIG_CLAIM_TTL`), which made in-progress work
reclaimable out from under you after a fixed window. The only way to unclaim
a waypoint now is `ReleaseWaypoint`.

## Not yet done

- Actor/audit guardrails (v1's `known_actors` + `audit_log`, enforced on
  every write tool).
- Expedition lineage cycle/consistency checks beyond the single-parent-edge
  shape.
- Wiring against generated OpenAPI server code rather than hand-written
  handlers — `openapi/graph.yaml` is hand-maintained today and must be kept
  in sync with `api` by hand.
- Real test coverage. `mcpserver` has one smoke test (tool
  registration/schema-inference doesn't panic) — everything else, REST
  included, is still untested.
- REST DTOs (`api/dto.go`) lag the MCP wire shapes: rehydrate history,
  flags, assets, terms, and the reopen/unbypass/unspur reason fields below
  are all readable over MCP but not yet exposed in `expeditionDTO`/
  `waypointDTO`. `reopen_expedition`/`unbypass_waypoint`/`unspur_waypoint`'s
  `reason` argument is now persisted (`reopenReason` on the expedition,
  `unbypassReason`/`unspurReason` on the waypoint — each the single most
  recent value, not a log), same as `rehydrate_waypoint`'s history snapshot
  and `resolve_waypoint_flag`'s `resolvedReason`; there is still no general
  audit log, just per-field "last reason" properties.
