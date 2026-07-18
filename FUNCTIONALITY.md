# Relentless — Functionality Breakdown

## What it is

**Relentless** is an AI workflow engine + spec-driven development pipeline. It runs as a long-lived server (MCP tool server + REST/web dashboard) backed by Postgres, and orchestrates AI agents (Claude Code or an alternate "Pi" backend) through a structured, human-gated feature-development lifecycle: **idea → requirements → design → tasks → implementation**.

Two things live in the same repo:
1. A **generic YAML workflow engine** (nodes, guards, human-in-the-loop steps) — the reusable "AI Workflow Engine with user-defined state machines."
2. A **concrete spec pipeline** built on top of it — the actual product surface most agents interact with via `mcp__relentless__*` tools.

---

## Core concepts

### 1. The Spec Pipeline
A "spec" (feature) is **not a file** — it's rows in Postgres (`spec_pipeline` schema), rendered to markdown on demand. Three sequential stages, each producible by a different agent with zero shared context:

| Stage | Produces | Agent | Model |
|---|---|---|---|
| 0. Discovery | A trail: waypoints driven to decisions (`discovery` schema); `complete_trail` creates + links the spec | `grilling` / `wayfinder` skills (via trail tools) | — |
| 1. Requirements | User stories, EARS acceptance criteria, non-goals, open questions, glossary | `requirements-compiler` | Sonnet |
| 2. Design | Architecture, components, data model, traceability to requirements, risks | `design-drafter` | Opus |
| 3. Tasks | Per-component ordered task lists, parallel batches, Definition of Done | `tasks-drafter` | Sonnet |
| 4. Implementation | Code changes, checked off task-by-task | `spec-implementation-orchestrator` → dispatches `code-implementer` / `test-writer` / `code-reviewer` | Haiku (orchestrator) |

Each stage ends with `finalize_stage` (submits to `in_review`); **approve/deny is human-only** and not exposed via any MCP tool — the human reviews rendered markdown and flips the status externally (via the web UI). Denials come back as a short freeform reason for the drafting agent to incorporate on redraft.

### 2. Trails (`discovery` schema)
Stage 0's storage. The old grilling tables (`grilling_sessions`/`decisions`/`decision_terms`), their MCP tools, and the `/grilling` dashboard view are **removed**, along with the wayfinder skill's local file store (`.relentless/tickets/`) — both skills now write into the `discovery` Postgres schema through one shared tool set. A **trail** is one effort to turn a loose idea into a destination; a **waypoint** is one question driven to a decision through the lifecycle `sighted → marked → claimed → reached | bypassed` (both terminal states unblock dependents). Tools: trail lifecycle (`create_trail`, `get_trail`, `get_trail_by_spec`, `list_trails`, `update_trail`, `complete_trail`, `abandon_trail`), waypoint lifecycle (`add_waypoint`, `update_waypoint`, `claim_waypoint`, `release_waypoint`, `reach_waypoint`, `bypass_waypoint`, `get_frontier`), plus `add_waypoint_dependency` / `remove_waypoint_dependency`, `add_waypoint_asset` / `list_waypoint_assets`, and `add_trail_term` / `update_trail_term`. `complete_trail` with outcome `spec` creates the spec and sets `discovery.trails.outcome_spec_id` in one transaction (at most one trail per spec); `requirements-compiler` reads that linked trail's reached waypoints as its decisions transcript. Stuck claims recover via `release_waypoint`, or lapse after `RELENTLESS_CLAIM_TTL` (hours, default 24).

### 3. Guardrails & Audit
Every write tool requires an `actor` argument, validated against a `known_actors` Postgres table. That table is synced at boot by scanning a mounted, curated actors directory (`<dir>/<name>`, resolving through to a `SKILL.md`) — deliberately not the general Claude Code skills directory, since agents and skills are separate concepts and an unrelated installed skill has no business attributing a relentless write. Every mutation writes one `audit_log` row in the same transaction.

### 4. Generic Workflow Engine
A separate, more general layer: YAML workflow definitions (`packages/library/bundled/workflows/relentless-default.yaml`) describe nodes of kind `agent` / `human` / `guard` / `script`, wired with `reads`/`writes`/`goto` transitions and approve/deny-style signals. The bundled `relentless-default` workflow literally encodes the spec pipeline this way (compile → review → gate, repeated three times) — the concrete pipeline is one instance of the generic engine. A polling scheduler (`packages/server/src/scheduler`) claims runnable runs and drives the interpreter node-by-node in the background, independent of the interactive MCP tool-call flow.

A separate, proto-defined admin API (`packages/proto/proto/relentless.proto`, implemented in `packages/server/src/rpc/index.ts`) exposes `WorkflowsService` / `PromptsService` / `RunsService` / `ArtifactsService` for managing these generic workflows/runs — distinct from the spec-pipeline MCP tool catalog.

### 5. Dual Executors
Agent steps run through a pluggable `AgentExecutor` interface — either `ClaudeExecutor` (Claude Code) or `PiExecutor` (wraps `@earendil-works/pi-coding-agent`), selected via `RELENTLESS_DEFAULT_EXECUTOR`.

---

## Package-by-package

| Package | Role |
|---|---|
| **`schema`** | Shared Zod contracts (`WorkflowDef`/`NodeDef`, `Clock`, `RunStore`, `ArtifactStore`) used across the engine/persistence/server. |
| **`proto`** | Protobuf definitions for the generic engine's gRPC-flavored admin API (workflows/prompts/runs/artifacts). |
| **`engine`** | The generic interpreter: template/guard-expression evaluation, workflow validation (`validateWorkflow` — checks reachability, guard defaults, human-signal coverage, reads-before-writes), and the step interpreter (`interpret`/`resumeHuman`) that executes one node at a time and records run history. |
| **`executors`** | Runs an agent turn against a backend (`ClaudeExecutor` spawns the `claude` CLI; `PiExecutor` wraps the Pi coding agent), abstracting prompts, tools, streaming, structured-output capture, timeouts/abort. |
| **`library`** | Resolves and seeds bundled content: agent prompt definitions, spec templates, and workflow YAMLs, from Postgres or bundled defaults (`seedBundledLibrary` upserts on boot, never overwriting a user-modified row). |
| **`persistence`** | Postgres-backed `SpecRepository` (all spec/requirements/design/tasks CRUD plus the `discovery` trail/waypoint CRUD, including `finalizeStage` with cross-component cycle detection and `renderDocument`) + `SpecChangeEmitter` (in-process pub/sub powering the SSE feed). |
| **`server`** | The daemon: MCP tool server (`mcp/tools/*`), REST "BFF" web API (`web/routes`), config loading, actor-registry guardrails, the run scheduler, the proto-RPC admin service, and process composition (`build-composition.ts` wires everything into one `startDaemon` process). |
| **`web`** | React SPA dashboard: spec list, spec detail (rendered markdown per stage, approve/deny buttons). Uses TanStack Query + a live SSE subscription to auto-refresh on `spec_changed` events (`grilling_session_changed` is gone; `trail_changed`/`waypoint_changed` fire on the feed but have no UI consumer in v1). |
| **`test-support`** | Shared test scaffolding/fixtures for the other packages' test suites. |

---

## Web Dashboard

- `/specs` — list of specs with per-stage status.
- `/specs/:specId` — rendered requirements/design/tasks markdown (sanitized via `rehype-sanitize`), with Approve/Deny buttons on whichever stage is `in_review`.
- Approve/Deny actions POST to write endpoints and rely on a self-triggered SSE ping to refresh state (no local cache mutation).
- **No trails surface in v1**: the old `/grilling/:sessionId` route is removed and nothing renders the `discovery` schema. `trail_changed`/`waypoint_changed` SSE events exist but no page consumes them; recovering a stuck waypoint claim means the `release_waypoint` MCP tool, psql, or waiting out the claim TTL.
- **This console is read-mostly**: its only write capability is approve/deny. Requirements/design/tasks authoring is exclusively done by AI agents via MCP tools.

---

## Deployment (`docker-compose.yml`)

- **`postgres`** — Postgres 16, holds all spec/workflow/audit state (healthcheck gates server startup).
- **`server`** — built from the root multi-stage `Dockerfile` (`pnpm install --frozen-lockfile` + `pnpm -r build`), runs `node packages/server/dist/server/src/cli.js serve`, exposing:
  - MCP transport on `8787` (bearer-token authed)
  - Web REST/dashboard on `8788` (bound to `127.0.0.1` on the host)
  - Mounts a host `~/.claude/skills` directory read-only at `/skills` for known-actor sync.
- No separate migrations runner: `spec-templates/spec/db/schema.sql` is a single idempotent DDL file applied on every boot — the full clean-database bootstrap (`spec_pipeline` + `discovery` + the `public` run-engine tables, with the legacy grilling tables never existing), cut over 2026-07-17 from a wiped database.
- Key env vars: `DATABASE_URL`, `RELENTLESS_DEFAULT_EXECUTOR` (`pi`/`claude`), `RELENTLESS_MCP_BEARER_TOKEN`, `RELENTLESS_ACTORS_DIR` (points at the curated actors directory, not the general skills directory — see docker-compose.yml), `RELENTLESS_DEFAULT_MODEL`, `RELENTLESS_CONCURRENCY_CAP`, `RELENTLESS_LOG_LEVEL`, `RELENTLESS_CLAIM_TTL` (hours before a stale waypoint claim becomes reclaimable, default 24).

---

## Agent roles (deployed as Claude Code skills)

| Agent | Stage | Reads | Writes | Notes |
|---|---|---|---|---|
| `requirements-compiler` | 1 | spec's linked trail (`get_trail_by_spec`) | requirements | Mechanical EARS reformatting; never creates specs |
| `design-drafter` | 2 | requirements + codebase | design | Highest-stakes, Opus |
| `tasks-drafter` | 3 | design | tasks | Linear decomposition + parallel batching |
| `spec-implementation-orchestrator` | 4 | tasks | task/DoD checkbox state | Purely mechanical dispatch |
| `code-implementer` | — | task spec | code | Dispatched per task |
| `test-writer` | — | task spec | tests | Dispatched per task |
| `code-reviewer` | — | implementation | findings only (no code edits) | Opt-in per task |

All are manual-only (no auto-trigger) and each re-fetches spec state cold via `get_spec`/`get_next_stage` rather than trusting prior context. Every drafting agent (`requirements-compiler`/`design-drafter`/`tasks-drafter`) drafts best-effort and records gaps as `Assumptions/Open Questions` or `Flags` rather than halting to ask the human — subagents return a single final message and can't hold a back-and-forth.

---

## Known discrepancies / things to be aware of

(The previously listed stale-bundled-prompts and README-denies-grilling-tools discrepancies are fixed — the bundled agent prompts now match `spec-templates/agents/*.md`, and `spec-templates/spec/README.md` describes the trails/discovery story. See `KNOWN-ISSUES.md` for the tracked list.)

1. **Approve/deny endpoint has no auth.** `POST /api/specs/:specId/stages/:stage/{approve,deny}` (the only place a stage can actually become `approved`) is unauthenticated and always attributes the write to a fixed literal actor `'web-ui'` — it bypasses the `known_actors` check every MCP write tool enforces. Acceptable only while the web dashboard stays bound to `127.0.0.1`; with the doc discrepancies fixed, this now stands alone as the known auth gap.

2. **Trails have no web-dashboard surface in v1.** Nothing in the SPA renders the `discovery` schema, and the `trail_changed`/`waypoint_changed` SSE events have no UI consumer. Human recovery of a stuck waypoint claim is the `release_waypoint` MCP tool from any session, psql as the override of last resort, or waiting out `RELENTLESS_CLAIM_TTL`.
