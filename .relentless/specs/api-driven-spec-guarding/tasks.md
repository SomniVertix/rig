<!--
  tasks.md — API-Driven Spec Guarding
  Drafted autonomously by the tasks stage from an APPROVED design.md. No human interview
  happened at this stage — see spec-templates/spec/README.md. This document itself is
  authored using the CURRENT, existing tasks.template.md format (single unified
  Order + Parallel Execution Schema + Task List file) even though the feature it describes
  will, once built, replace this very authoring format with a per-component scheme (Story 15,
  16). Do not confuse the format of this document with the feature it implements.
-->

# Tasks: API-Driven Spec Guarding

## Order

- [x] 1. T1: db-schema — evolve canonical DDL, seeding triggers, idempotent boot
- [x] 1.1 T1.1: Projects table + project_id scoping + `ensureProject` helper
- [x] 1.2 T1.2: `design_components` table
- [x] 1.3 T1.3: `tasks_docs` per-component evolution + `seed_component_tasks_docs` trigger
- [x] 1.4 T1.4: `task_dependency_edges` table + same-component rejection trigger
- [x] 1.5 T1.5: Move `definition_of_done_items` to spec scope
- [x] 1.6 T1.6: `prompts` + `prompt_snapshots` tables
- [x] 1.7 T1.7: `workflows`/`workflow_snapshots` into canonical DDL + `project_id`/`origin`
- [x] 1.8 T1.8: `known_actors` + `audit_log` tables
- [x] 1.9 T1.9: Consolidate migrations into one idempotent script; remove migrations runner
- [x] 2. T2: template-shape-updates — design.template.md and tasks.template.md changes
- [x] 2.1 T2.1: Add `## Components` section to `design.template.md`
- [x] 2.2 T2.2: Split `tasks.template.md` into per-component template + top-level index template
- [x] 3. T3: library-store — DB-backed workflow/prompt library with versioning
- [x] 3.1 T3.1: Prompt store with shadowing resolution + snapshot-on-update versioning
- [x] 3.2 T3.2: Workflow store writing to `workflows`/`workflow_snapshots` with scoping/origin
- [x] 3.3 T3.3: Boot seed-if-absent pass for bundled prompts/agents/workflows
- [x] 3.4 T3.4: Wire DB-backed `LibraryResolver` into `buildComposition`
- [x] 4. T4: mcp-transport — HTTP/SSE MCP server, auth, project-scoped session binding
- [x] 4.1 T4.1: Add MCP SDK dependency; pin transport class
- [x] 4.2 T4.2: HTTP/SSE listener + `/mcp/:projectSlug` endpoint shape
- [x] 4.3 T4.3: Bearer-token auth pre-handler + config additions
- [x] 4.4 T4.4: Project-slug → project_id session binding via `ensureProject`
- [x] 4.5 T4.5: Wire MCP module into `buildComposition`/`startDaemon`; stub tool registry
- [x] 5. T5: spec-doc-tools — fine-grained spec-pipeline tool catalog
- [x] 5.1 T5.1: `SpecRepository` query layer in `@relentless/persistence`
- [x] 5.2 T5.2: Spec lifecycle tools (`create_spec`, `get_spec`, `list_specs`)
- [x] 5.3 T5.3: Requirements child tools
- [x] 5.4 T5.4: Design child tools (incl. `design_component`)
- [x] 5.5 T5.5: Tasks child tools (component-scoped, incl. `task_dependency_edge`)
- [x] 5.6 T5.6: `finalize_stage(stage, component?)`
- [x] 5.7 T5.7: `get_next_stage(spec)`
- [x] 5.8 T5.8: `render_document(spec, stage, component?)`
- [x] 5.9 T5.9: Shared append-only ordinal helper for all add tools
- [x] 5.10 T5.10: Unit tests for `finalize_stage`/`get_next_stage` rule enforcement
- [x] 6. T6: guardrails — semantic validation, attribution, audit, cycle/order enforcement
- [x] 6.1 T6.1: EARS/empty-content/quality-adjective validation module
- [x] 6.2 T6.2: Actor/attribution requirement + known-actors validation
- [x] 6.3 T6.3: Append-only `audit_log` insertion in every write transaction
- [x] 6.4 T6.4: Boot-time known-actors registry sync
- [x] 6.5 T6.5: Parent/child checkbox rule (`update_task_item`)
- [x] 6.6 T6.6: Approve/deny exclusion enforcement
- [x] 6.7 T6.7: Unit tests for guardrails validation rules
- [x] 7. T7: integration — full tool catalog wiring, retirement of file-based reads, e2e
- [x] 7.1 T7.1: Register full tool catalog on mcp-transport; retire file-based rpc paths
- [x] 7.2 T7.2: End-to-end MCP test suite
- [x] 7.3 T7.3: Performance/capacity smoke check
- [x] 8. T8: independent review pass
- [x] 8.1 T8.1: Review every component against its Traceability + Acceptance check
- [x] 8.2 T8.2: Verify spec-wide Definition of Done is satisfiable end-to-end

## Parallel Execution Schema

<!--
  Batches mirror the design's own component build-order illustration (Data Model §13):
  db-schema blocks everything; library-store and the mcp-transport chain are
  independent-ish afterward; spec-doc-tools and guardrails are a strict sequential
  chain off mcp-transport; integration is the convergence point for all five components.
  Each batch entry below is a whole task ID (its subtasks run in Order sequence within
  that slot) unless a task's subtasks are themselves mutually concurrent.
-->

- **P1 (parallel):** 1, 2
- **P2 (parallel):** 3, 4
- **P3 (parallel):** 5
- **P4 (parallel):** 6
- **P5 (parallel):** 7
- **P6 (parallel):** 8

## Task List

### [x] 1. T1: db-schema — evolve canonical DDL, seeding triggers, idempotent boot

- **Execution #:** 1
- **Description:** Evolve `spec_pipeline` DDL in `spec-templates/spec/db/schema.sql` to add the component model, projects, prompts/version-history, audit/known-actors, and cross-component dependency edges; replace the `packages/persistence/migrations/` runner with a single idempotent script application. This is the `db-schema` component declared in design.md and blocks every other component.
- **Traceability:** Stories 1, 3, 4, 7.2–7.4, 11, 13, 15, 16 -> design §Data Model / Interfaces §1–§8, §Architecture (Boot lifecycle)
- **Files/areas touched:** `spec-templates/spec/db/schema.sql`, `packages/persistence/migrations/001_init.sql`, `packages/persistence/src/index.ts`, `packages/server/src/composition/build-composition.ts`
- **Suggested agent:** `code-implementer`
- **Acceptance check:** Running the evolved `schema.sql` twice in a row against the same empty database succeeds both times with no errors (idempotency, Story 13.1); every new/altered statement uses `CREATE ... IF NOT EXISTS` / guarded `ALTER`/`DROP CONSTRAINT IF EXISTS`, never a bare unguarded DDL statement.
- **Subtasks (run in listed order):**
  - [x] 1.1 T1.1: Projects table + project_id scoping + `ensureProject` helper
    - **Description:** Add `spec_pipeline.projects` (slug UNIQUE + kebab-case CHECK). Add `project_id UUID REFERENCES projects(id)` to `specs`, `prompts`, `workflows`. Move `specs.slug` uniqueness from global `UNIQUE(slug)` to `UNIQUE(project_id, slug)`. Add an `ensureProject(slug)` application helper (`INSERT ... ON CONFLICT (slug) DO NOTHING RETURNING id` then `SELECT`) in `@relentless/persistence`.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Two projects can each own a spec with the identical slug (Story 4.1); calling `ensureProject('new-slug')` twice returns the same project id both times without erroring (Story 4.2); bundled rows keep `project_id IS NULL` (Story 4.3, 4.5).
  - [x] 1.2 T1.2: `design_components` table
    - **Description:** Add `spec_pipeline.design_components` (design_id FK, slug, display_name, ordinal) with `UNIQUE(design_id, slug)`, `UNIQUE(design_id, ordinal)`, and the kebab-case CHECK reused from `specs`.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Inserting two components with the same slug under one design_id, or a non-kebab-case slug, is rejected by a DB constraint (Story 15.3); `display_name` accepts arbitrary free text (Story 15.4).
  - [x] 1.3 T1.3: `tasks_docs` per-component evolution + `seed_component_tasks_docs` trigger
    - **Description:** Drop the old `UNIQUE(spec_id)` on `tasks_docs` via guarded `ALTER TABLE ... DROP CONSTRAINT IF EXISTS`; add `design_component_id`, `component_slug`, `component_name`, `status spec_pipeline.stage_status` columns with `UNIQUE(spec_id, component_slug)` and `UNIQUE(design_component_id)`. Add the `seed_component_tasks_docs()` function + `spec_stages_seed_component_tasks` AFTER UPDATE trigger exactly as specified in design §Data Model 3. This trigger only ever inserts (`ON CONFLICT DO NOTHING`) — it never deletes a `tasks_docs` row. The delete-if-empty/reject-if-drafted redraft-reconciliation logic is deliberately kept out of this trigger and lives entirely in T5.6's `finalize_stage('design')` application code, so there is exactly one place or ordering resolves.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Transitioning a design's `spec_stages` row to `stage_name='design', status='in_review'` auto-inserts exactly one `tasks_docs` row per declared `design_components` row, each `status='not_started'` (Story 15.5); re-triggering the same transition a second time inserts no duplicates (`ON CONFLICT (design_component_id) DO NOTHING`, Story 15.6).
  - [x] 1.4 T1.4: `task_dependency_edges` table + same-component rejection trigger
    - **Description:** Add `spec_pipeline.task_dependency_edges` (from/to `task_item_id` FKs, `UNIQUE(from_task_item_id, to_task_item_id)`, `CHECK (from_task_item_id <> to_task_item_id)`) plus the index on `to_task_item_id`. Add a defensive BEFORE INSERT trigger that joins both endpoints to `task_items.tasks_doc_id` and rejects when they resolve to the same `tasks_doc_id` (belt-and-suspenders alongside the application-level check in T5.5).
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Inserting an edge between two `task_items` from the same `tasks_doc_id` is rejected at the DB layer even if application code were bypassed (Story 16.2); a self-referencing edge (`from = to`) is rejected by the CHECK constraint.
  - [x] 1.5 T1.5: Move `definition_of_done_items` to spec scope
    - **Description:** Re-key `definition_of_done_items` from `tasks_doc_id` to `spec_id UUID NOT NULL REFERENCES specs(id)`, `UNIQUE(spec_id, ordinal)`, via guarded `ALTER`. Leave `tasks_flags` untouched (stays keyed on `tasks_doc_id`).
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** A single spec with multiple component `tasks_docs` rows has exactly one shared set of `definition_of_done_items` rows addressable by `spec_id` alone (Story 16.9).
  - [x] 1.6 T1.6: `prompts` + `prompt_snapshots` tables
    - **Description:** Add `spec_pipeline.prompts` (project_id nullable, prompt_key, kind, body, description, origin, current_version) with the two partial unique indexes (`prompts_project_key` where `project_id IS NOT NULL`, `prompts_bundled_key` where `project_id IS NULL`). Add `spec_pipeline.prompt_snapshots` (prompt_id FK, version, body, description, `UNIQUE(prompt_id, version)`).
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** A project-scoped prompt and a bundled prompt can share the same `prompt_key` without a unique-index collision (Story 4.4 shadowing); attempting two project-scoped rows with the same `(project_id, prompt_key)` is rejected.
  - [x] 1.7 T1.7: `workflows`/`workflow_snapshots` into canonical DDL + `project_id`/`origin`
    - **Description:** Move the `workflows`/`workflow_snapshots` table definitions out of `packages/persistence/migrations/001_init.sql` and into `spec-templates/spec/db/schema.sql` as guarded `CREATE TABLE IF NOT EXISTS`, preserving existing columns, then add `project_id UUID REFERENCES projects(id)` (NULL = bundled) and `origin TEXT NOT NULL DEFAULT 'user'` via guarded `ALTER ... ADD COLUMN IF NOT EXISTS`.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** A fresh database booted only against the evolved `schema.sql` (no `001_init.sql` involvement) ends up with a working `workflows`/`workflow_snapshots` pair including the new columns; an existing pre-evolution database re-applying the script gets the new columns added without data loss.
  - [x] 1.8 T1.8: `known_actors` + `audit_log` tables
    - **Description:** Add `spec_pipeline.known_actors` (actor PK, source, updated_at) and `spec_pipeline.audit_log` (identity PK, actor, action, table_name, row_id, project_id, ts) plus the `audit_log_ts_idx` index, exactly as specified in design §Data Model 8.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** `audit_log` has no `UPDATE`/`DELETE` grant path exercised by any application code added in this spec (append-only, Story 11.3); the table imposes no row-count constraint (Story 14.4).
  - [x] 1.9 T1.9: Consolidate migrations into one idempotent script; remove migrations runner
    - **Description:** Fold the remaining `packages/persistence/migrations/001_init.sql` tables not already handled by T1.7 (`runs`, `run_events`, `pending_human_interactions`, `artifacts_meta`, `run_locks`) into `spec-templates/spec/db/schema.sql` as guarded `CREATE TABLE IF NOT EXISTS`, matching current column shapes exactly so the run engine's behavior is unchanged. Remove `applyMigrations`/the `packages/persistence/migrations` directory concept. Rewrite `ensureDatabaseReady` in `packages/server/src/composition/build-composition.ts` to execute `spec-templates/spec/db/schema.sql` by path as one script instead of iterating a migrations directory.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** A brand-new database boots successfully via `buildComposition` with zero manual bootstrap step (Story 13.2); `packages/persistence/migrations/` and `applyMigrations` are no longer referenced anywhere in `packages/server` or `packages/persistence` source; existing run-engine tests (`packages/server/test/e2e/api.test.mjs`) still pass unmodified against the consolidated schema.

### [x] 2. T2: template-shape-updates — design.template.md and tasks.template.md changes

- **Execution #:** 2
- **Description:** Ship the two template edits design.md described as required but explicitly deferred (design Flags, Data Model §12): a `## Components` section in `design.template.md`, and a split of `tasks.template.md` into a per-component task-document template plus a spec-wide index template. Purely template/markdown work — no runtime code dependency on T1, safe to run in parallel with it.
- **Traceability:** Story 15.1–15.4 (Components section), Story 8.4/10.3/10.4/16.9 (index vs per-component task template shapes) -> design §Data Model 12; design Flags ("current design.template.md has no Components section")
- **Files/areas touched:** `spec-templates/spec/design.template.md`, `spec-templates/spec/tasks.template.md`, new `spec-templates/spec/component-tasks.template.md`, new `spec-templates/spec/tasks-index.template.md`, `spec-templates/spec/README.md` (cross-references only, if needed)
- **Suggested agent:** `code-implementer`
- **Acceptance check:** Both new/edited templates are self-contained enough for a cold-context agent to fill in correctly, matching README.md's stated bar for every stage document.
- **Subtasks (run in listed order):**
  - [x] 2.1 T2.1: Add `## Components` section to `design.template.md`
    - **Description:** Insert a mandatory `## Components` section (table: `slug | display name | responsibility`, ≥1 row required) into `spec-templates/spec/design.template.md`, positioned to match how design.md for this very spec used it (after Overview/Architecture, before Data Model / Interfaces).
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** The template's inline comment states the ≥1-row requirement and the kebab-case slug convention explicitly, mirroring Story 15.1/15.3, so a design-drafter agent reading the template cold cannot miss the requirement.
  - [x] 2.2 T2.2: Split `tasks.template.md` into per-component template + top-level index template
    - **Description:** Create `component-tasks.template.md` holding the current template's body (Order, Parallel Execution Schema, Task List, Flags) minus the spec-wide Definition of Done, scoped to one component. Create `tasks-index.template.md`: a spec-wide document listing every declared component with its current status, a `## Cross-Component Dependencies` section, and the single spec-wide `## Definition of Done`. Update `tasks.template.md` itself to either become the index template or redirect to the two new files with a clear pointer (avoid leaving stale guidance behind).
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** The two new templates together reproduce every section the single old `tasks.template.md` had, with no section lost and Definition of Done appearing exactly once (in the index template only), matching Story 16.9/16.10 and design §Data Model 12.

### [x] 3. T3: library-store — DB-backed workflow/prompt library with versioning

- **Execution #:** 3
- **Description:** Build the `library-store` component: a `PromptStore`/`WorkflowStore` query layer over the T1 `prompts`/`prompt_snapshots`/`workflows`/`workflow_snapshots` tables with project scoping, shadowing, origin markers, and seed-if-absent bundled defaults; wire a DB-backed `LibraryResolver` implementation into `buildComposition` for prompts and workflows (templates/tools stay file-based — out of scope). Depends only on T1.
- **Traceability:** Stories 2, 3, 4.3–4.5, 13.3–13.5 -> design §Data Model 6, 7; §Architecture (Boot lifecycle seed passes)
- **Files/areas touched:** new `packages/persistence/src/library-store.ts`, `packages/persistence/src/index.ts` (exports), `packages/library/src/index.ts` (new resolver implementation), `packages/server/src/composition/build-composition.ts`
- **Suggested agent:** `code-implementer`
- **Acceptance check:** With T1 applied, a project-scoped prompt row shadows a same-`prompt_key` bundled row for that project only, and every other project still sees the bundled row (Story 4.4); no per-project copy is ever created at project-creation time (Story 4.5, Non-Goal).
- **Subtasks (run in listed order):**
  - [x] 3.1 T3.1: Prompt store with shadowing resolution + snapshot-on-update versioning
    - **Description:** Implement `resolvePrompt(projectId, key)` (project-scoped row if present, else bundled `project_id IS NULL` row) and prompt create/update functions. On every update, write a `prompt_snapshots` row capturing the prior body/description before bumping `current_version`, mirroring the existing `workflow_snapshots` pattern.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Updating a prompt twice produces two rows in `prompt_snapshots` (the pre-update states) and `prompts.current_version` increments each time (Story 3.2); looking up `(prompt_id, version)` recovers the exact prior body (Story 3.3).
  - [x] 3.2 T3.2: Workflow store writing to `workflows`/`workflow_snapshots` with scoping/origin
    - **Description:** Implement create/update functions writing to the evolved `workflows`/`workflow_snapshots` tables (project_id, origin), replacing the file-based path used for normal operation. Do not modify `packages/proto`/`createRpcFacade`'s gRPC surface itself in this subtask — only the storage it will read from (wiring happens in T7.1).
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Creating then updating a workflow definition persists both the current row and a `workflow_snapshots` history row to Postgres, never to `.relentless/workflows/*.yaml` (Story 2.1, 2.2).
  - [x] 3.3 T3.3: Boot seed-if-absent pass for bundled prompts/agents/workflows
    - **Description:** At boot, scan `packages/library/bundled/global/{agents,prompts,workflows}` and upsert each as a project-less row (`project_id IS NULL`, `origin='bundled'`) using `ON CONFLICT DO NOTHING` so an existing row (bundled or user-modified) is never overwritten.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Booting twice against the same database leaves pre-existing bundled rows byte-for-byte unchanged (Story 13.3); a bundled default absent on first boot is present after boot (Story 13.4); every seeded row carries `origin='bundled'` (Story 13.5).
  - [x] 3.4 T3.4: Wire DB-backed `LibraryResolver` into `buildComposition`
    - **Description:** Add a Postgres-backed `LibraryResolver` implementation (prompts + workflows resolved from the DB via T3.1/T3.2; templates/tools continue to resolve from the filesystem via the existing `FileSystemLibraryResolver` delegation) and swap it in as `buildComposition`'s default `libraryResolver`, replacing `createFileSystemLibraryResolver` for prompt/workflow resolution.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** With `buildComposition` wired to the new resolver, the workflow interpreter (`@relentless/engine`) can start and run a run using a DB-stored workflow/prompt with no `.relentless/workflows/`, `.relentless/agents/`, or `.relentless/prompts/` file present on disk (Story 1.2, 2.1, 3.1).

### [ ] 4. T4: mcp-transport — HTTP/SSE MCP server, auth, project-scoped session binding

- **Execution #:** 4
- **Description:** Build the `mcp-transport` component: a new `packages/server/src/mcp/` module mounting an MCP server over HTTP/SSE inside the existing daemon, bearer-token auth, and project-scoped session binding via `ensureProject`. This is transport plumbing only — it registers a tool dispatch mechanism but does not yet implement spec-doc-tools/guardrails/library-store tools (those wire in during T5/T6/T7). Depends only on T1 (needs `projects`).
- **Traceability:** Story 5 (all criteria) -> design §Architecture (Process & package topology, Request lifecycle), §Data Model 9 (Transport)
- **Files/areas touched:** new `packages/server/src/mcp/` (e.g. `server.ts`, `auth.ts`, `session.ts`), `packages/server/src/config/schema.ts`, `packages/server/src/config/load-config.ts`, `packages/server/src/composition/build-composition.ts`, `packages/server/package.json`
- **Suggested agent:** `code-implementer`
- **Acceptance check:** The daemon remains a single process (no second entry point/binary) — `packages/server/src/main.ts`/`cli.ts` continue to be the only process entry points (Story 5.2).
- **Subtasks (run in listed order):**
  - [ ] 4.1 T4.1: Add MCP SDK dependency; use `StreamableHTTPServerTransport`
    - **Description:** Add `@modelcontextprotocol/sdk` to `packages/server/package.json`. Use `StreamableHTTPServerTransport` (not `SSEServerTransport`, which the SDK treats as a legacy/deprecated transport) — it mounts directly on a bare Node `http.IncomingMessage`/`ServerResponse` handler pair with no express/fastify dependency, and its stateless-request model matches Story 5.8's "no session-resumption semantics" requirement more directly than the older SSE transport's long-lived-stream model.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** `pnpm install` resolves the new dependency cleanly; `packages/server/src/mcp/server.ts` instantiates `StreamableHTTPServerTransport` mounted on the plain Node HTTP listener from T4.2, with a one-paragraph comment recording this choice and why.
  - [ ] 4.2 T4.2: HTTP/SSE listener + `/mcp/:projectSlug` endpoint shape
    - **Description:** Stand up the Node `http` listener hosting the MCP transport, with routes matching `/mcp/:projectSlug`. `StreamableHTTPServerTransport` (T4.1) handles both POST (client→server messages) and GET (server→client stream) on this single path per the MCP spec's Streamable HTTP transport, so no separate `/sse/...` path is needed — narrowing design.md's illustrative `/(sse|mcp)/:projectSlug` shape to the single path the pinned transport class actually requires.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** A request to the `/mcp/:projectSlug` path with a valid `:projectSlug` reaches the MCP handshake (Story 5.1); the transport is reachable over HTTP without any local file dependency (Story 1.2 boundary).
  - [ ] 4.3 T4.3: Bearer-token auth pre-handler + config additions
    - **Description:** Add `mcpBearerToken` (from `RELENTLESS_MCP_BEARER_TOKEN`), `mcpHost`, `mcpPort` to `serverConfigSchema` and `load-config.ts`. Add a pre-handler that checks `Authorization: Bearer <token>` against the configured value before any tool call is dispatched.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** A request with a missing or mismatched bearer token receives a 401 before any tool handler runs (Story 5.3); a request to a different project's endpoint with the same valid token is allowed through (Story 5.6 — auth is not per-project); no in-API endpoint exists to expire/rotate/revoke the token (Story 5.7).
  - [ ] 4.4 T4.4: Project-slug → project_id session binding via `ensureProject`
    - **Description:** On connection, resolve `:projectSlug` to a `projects` row using T1.1's `ensureProject(slug)` helper (auto-creating if absent) and bind the resulting `project_id` to the MCP session for its entire lifetime. No tool call ever carries an explicit project parameter.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Connecting to a never-before-seen project slug auto-provisions that project rather than rejecting the connection (Story 4.2, 5.4); every tool call within that session implicitly operates against the bound `project_id` with no project argument accepted (Story 5.5); disconnect-then-reconnect is treated as an entirely new, independent session with no state carried over (Story 5.8).
  - [ ] 4.5 T4.5: Wire MCP module into `buildComposition`/`startDaemon`; stub tool registry
    - **Description:** Wire `packages/server/src/mcp/` into the existing daemon composition/startup path (alongside `buildComposition`), with an empty/stub tool registry ready for T5/T6/T7 to populate. Confirm the existing gRPC/proto transport (`packages/proto`, `createRpcFacade`) is untouched by this wiring.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Starting the server via its existing CLI entry point brings up both the gRPC transport (unchanged) and the new MCP HTTP/SSE listener in the same process (Story 5.2, Non-Goal boundary on gRPC/proto).

### [x] 5. T5: spec-doc-tools — fine-grained spec-pipeline tool catalog

- **Execution #:** 5
- **Description:** Build the `spec-doc-tools` component: the `SpecRepository` persistence layer plus every add/update/delete tool for requirements/design/tasks child tables, `finalize_stage`, `get_next_stage`, and `render_document`. Depends on T1 (schema), T2 (template shapes that `render_document` must reproduce), and T4 (a transport to register these tools onto).
- **Traceability:** Stories 1, 6, 7, 8, 9, 10, 15.5–15.7, 16.1–16.9 -> design §Data Model 3, 4, 5, 9, 11
- **Files/areas touched:** new `packages/persistence/src/spec-repository.ts`, new `packages/server/src/mcp/tools/` (per-table tool handler files), `packages/server/src/mcp/server.ts` (tool registration)
- **Suggested agent:** `code-implementer`
- **Acceptance check:** Every child table declared in the evolved schema (T1) has a distinct add/update/delete tool exposed through the transport built in T4 (Story 6.1, 6.2).
- **Subtasks (run in listed order):**
  - [x] 5.1 T5.1: `SpecRepository` query layer in `@relentless/persistence`
    - **Description:** Add a `SpecRepository` alongside the existing `PostgresRunStore`/`PostgresArtifactStore`, reusing the same `pg` `Pool` and `withTransaction` helper, covering CRUD for specs/requirements/design/tasks_docs and every child table.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Every mutation method executes inside a single transaction (setup for T6.3's shared audit-log insert); reads use plain queries with no write side effects.
  - [x] 5.2 T5.2: Spec lifecycle tools (`create_spec`, `get_spec`, `list_specs`)
    - **Description:** Implement the top-level spec lifecycle tools, project-implicit (bound session `project_id`), each requiring the caller-supplied `actor` argument on writes.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** `create_spec` auto-seeds the three `spec_stages` rows (existing `seed_spec_stages` trigger) and is only ever scoped to the session's bound project (Story 1.1, 4.1).
  - [x] 5.3 T5.3: Requirements child tools
    - **Description:** Implement add/update/delete tools for `user_story`, `acceptance_criterion`, `non_goal`, `assumption_open_question`, `glossary_term`, plus `set_requirements_overview`.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Adding a child row whose parent (`requirements_id`/`user_story_id`) does not exist is rejected (Story 7.3); each add tool places the new row at `max(ordinal/criterion_number)+1` for its sequence (Story 6.3).
  - [x] 5.4 T5.4: Design child tools (incl. `design_component`)
    - **Description:** Implement `set_design_overview`, `set_design_architecture`, and add/update/delete for `design_data_model_entry`, `design_traceability`, `design_alternative`, `design_open_risk`, `design_flag`, and the new `design_component` tool.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** `add_design_component` enforces the kebab-case slug pattern and unique ordinal per design (delegated to the T1.2 DB constraints, surfaced as a rule-naming error rather than a raw constraint-violation message); repositioning a component requires an explicit `update_design_component` call, never automatic reindexing (Story 6.4).
  - [x] 5.5 T5.5: Tasks child tools (component-scoped, incl. `task_dependency_edge`)
    - **Description:** Implement add/update/delete for `task_item`, `task_file_touched`, `parallel_batch`, `parallel_batch_member`, `tasks_flag` — every tool taking a component slug to resolve the correct `tasks_docs` row. Implement add/update/delete for the now spec-scoped `definition_of_done_item`. Implement add/delete for `task_dependency_edge`, resolving both endpoints' `tasks_doc_id` and rejecting same-component pairs at the application layer (ahead of T1.4's defensive DB trigger); perform no cycle check here.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** `add_task_dependency_edge` between two task items in the same component's task document is rejected with a rule-naming error (Story 16.2) without any graph traversal (Story 16.3); a cross-component edge add succeeds instantly with no cycle check performed (Story 16.1).
  - [x] 5.6 T5.6: `finalize_stage(stage, component?)`
    - **Description:** Implement the full finalize semantics from design §Data Model 9: predecessor-approved ordering check (Story 7.2; for a component task doc, the predecessor is the spec-wide `design` stage being `approved`); completeness checks (zero required top-level items, zero acceptance criteria on any user story, zero `task_files_touched` on any top-level task item within the finalizing component — Story 7.4, 7.5, 12.10); the cross-component `WITH RECURSIVE` cycle-detection query from design §Data Model 4 run on every tasks-stage finalize call; and the design-redraft reconciliation mechanic (delete orphaned `not_started`/zero-item component task docs, reject finalize naming any orphaned component that still has drafted content) per design §Data Model 3. Every rejection returns a distinct, rule-identifying error (Story 7.6).
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Finalizing `tasks` for one component transitions only that component's `tasks_docs.status`, never a shared tasks-stage status (Story 7.1, 16.5); finalizing with a cycle present anywhere in the spec's `task_dependency_edges` is rejected (Story 16.4); finalizing `design` with zero declared components is rejected (Story 15.2); finalizing `design` after a component was removed in a redraft, where the orphaned task doc still has task items, is rejected naming that component.
  - [x] 5.7 T5.7: `get_next_stage(spec)`
    - **Description:** Implement `get_next_stage` returning the first stage that is not `approved` and whose predecessor is `approved`, treating the tasks stage as `approved` only when every component's `tasks_docs.status = 'approved'`, and including the list of components not yet at `in_review`/`approved` when tasks is the actionable stage.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** With all three stages approved for every component, the tool reports no actionable stage (Story 8.2); with two of three components at `in_review` and one still `not_started`, the tool reports `tasks` as actionable and names the one lagging component (Story 8.3, 8.4).
  - [x] 5.8 T5.8: `render_document(spec, stage, component?)`
    - **Description:** Implement markdown reconstruction from stored rows, matching the layouts produced by T2's templates: for `stage='tasks'`, `component` omitted/`'all'` renders the top-level index (component list + status, Cross-Component Dependencies, spec-wide Definition of Done); `component='<slug>'` renders that component's own Order/Parallel Execution Schema/Task List/Flags. Requirements/design render per their existing single-document template shapes.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Rendered requirements/design/tasks-index/component-tasks documents are structurally comparable to the corresponding `.template.md` layout section-by-section (Story 10.1, 10.2, 10.3, 10.4).
  - [x] 5.9 T5.9: Shared append-only ordinal helper for all add tools
    - **Description:** Extract one shared "insert at `max(existing ordinal)+1`" helper used by every add tool across T5.3–T5.5 so ordinal-assignment logic isn't duplicated per table.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Calling any add tool never accepts an explicit ordinal/position argument; three consecutive adds to the same sequence produce ordinals N, N+1, N+2 with no gaps or reordering (Story 6.3, 6.4).
  - [x] 5.10 T5.10: Unit tests for `finalize_stage`/`get_next_stage` rule enforcement
    - **Description:** Write focused unit/integration tests covering the ordering check, each completeness check, the cycle-detection query, the redraft-reconciliation mechanic, and `get_next_stage`'s aggregate/actionable-component logic.
    - **Suggested agent:** `test-writer`
    - **Acceptance check:** Tests exist and pass for at least: predecessor-not-approved rejection, zero-top-level-item rejection, zero-acceptance-criteria rejection, zero-`task_files_touched` rejection, a constructed cycle across two components being rejected, and a non-cyclic cross-component graph passing.

### [ ] 6. T6: guardrails — semantic validation, attribution, audit, cycle/order enforcement

- **Execution #:** 6
- **Description:** Build the `guardrails` component: the content-validation module applied before every write in T5's tool handlers, actor/known-actors enforcement, append-only audit logging, boot-time actor registry sync, the parent/child checkbox rule, and confirmation that approve/deny stays unreachable. Depends on T5 (wires into its write paths) and T1 (known_actors/audit_log tables).
- **Traceability:** Stories 6.6, 9, 11, 12 -> design §Data Model 8, 10
- **Files/areas touched:** new `packages/server/src/mcp/guardrails/` (validation module, actor-registry check, audit-log writer), `packages/server/src/mcp/tools/*` (call sites wired in from T5)
- **Suggested agent:** `code-implementer`
- **Acceptance check:** Every rejection produced by the guardrails module returns a distinct, rule-naming error rather than a generic failure (Story 12.3), and guardrails validation runs in addition to, not instead of, the DB-level constraints from T1 (Story 12.4).
- **Subtasks (run in listed order):**
  - [ ] 6.1 T6.1: EARS/empty-content/quality-adjective validation module
    - **Description:** Implement the validation rules from design §Data Model 10: EARS-clause structural matching for `acceptance_criterion.full_text` against its declared `ears_pattern` (SHALL + the pattern's implied keyword); empty/whitespace rejection generally and specifically for `user_story.{role,capability,benefit,rationale}`, `design_traceability.addressed_by`, `design_data_model_entries.content`, and `task_items.{traceability,acceptance_check,description}`; an unquantified-quality-adjective rejection list, checked case-insensitively as a whole-word match against the field text: `fast`, `slow`, `scalable`, `reliable`, `performant`, `efficient`, `robust`, `secure`, `intuitive`, `seamless`, `flexible`, `simple`, `easy`, `responsive`, `lightweight`, `high-performance`, `low-latency`, `real-time`, `highly available`. A match is only rejected if no adjacent number+unit token (e.g. `200ms`, `99.9%`, `20 concurrent`) is present in the same field; this list is a fixed v1 vocabulary for this feature, not a placeholder — expanding it later is a normal follow-up change to this module, not a blocking gap.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** An acceptance criterion whose `full_text` lacks `SHALL` plus its pattern's implied keyword is rejected (Story 12.1, 12.6); an empty `user_story.role` is rejected (Story 12.5); the phrase "fast" with no accompanying number+unit is rejected while "responds within 200ms" is accepted (Story 12.7); every adjective in the list above has at least one rejection-case unit test (see T6.7).
  - [ ] 6.2 T6.2: Actor/attribution requirement + known-actors validation
    - **Description:** Require every write tool call to carry an `actor` argument; validate it against `known_actors` (`SELECT 1 FROM known_actors WHERE actor = $1`), rejecting on miss.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** A write with a missing `actor` argument is rejected before touching the database (Story 11.1); a write with an `actor` not present in `known_actors` is rejected (Story 11.4).
  - [ ] 6.3 T6.3: Append-only `audit_log` insertion in every write transaction
    - **Description:** Wrap every T5 mutation so its `audit_log` INSERT (actor, action, table_name, row_id, project_id, ts) shares the same transaction as the underlying mutation.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Every add/update/delete/finalize call that succeeds produces exactly one new `audit_log` row in the same commit (Story 11.2); no code path in this feature issues an `UPDATE`/`DELETE` against `audit_log` (Story 11.3).
  - [ ] 6.4 T6.4: Boot-time known-actors registry sync
    - **Description:** At boot, scan `spec-templates/agents/*.md` for agent names and `INSERT ... ON CONFLICT (actor) DO UPDATE source` into `known_actors`. No Pi-equivalent local agent-definition directory exists to scan: `packages/executors/src/index.ts`'s `PiExecutor` dynamically imports the `@earendil-works/pi-coding-agent` npm package and calls its `createAgentSession` API directly — Pi agents are not defined via local markdown files the way Claude Code's `spec-templates/agents/*.md` are, so Story 11.5's "if one exists" clause resolves to false. Record this as a one-line code comment at the scan call site rather than leaving it unresolved.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** After boot, `known_actors` contains an entry for every `.md` file under `spec-templates/agents/` (e.g. `design-drafter`, `tasks-drafter`); the scan function's code comment explicitly states that no Pi-equivalent directory exists and why, so a future reader doesn't re-open this question.
  - [ ] 6.5 T6.5: Parent/child checkbox rule (`update_task_item`)
    - **Description:** In `update_task_item`, reject marking a parent `is_checked = true` while any child `task_item` within the same component's task document is still unchecked. This rule only considers intra-component parent/child structure (`parent_item_id`), never cross-component `task_dependency_edges`.
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Attempting to check a parent task item with one unchecked child in the same component is rejected (Story 6.6); the same parent with an unchecked task item in a *different* component (linked only via a dependency edge, not `parent_item_id`) is unaffected by this rule.
  - [ ] 6.6 T6.6: Approve/deny exclusion enforcement
    - **Description:** Confirm and (if needed) add an explicit rejection path so no tool in the T5/T6 catalog transitions any stage from `in_review` to `approved`, or records a denial; confirm a hypothetical single-component tasks approve/deny call is likewise unreachable (only a spec-wide human action, out of this feature's tool surface, can do it).
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** Calling an unknown/unsupported tool name resembling "approve" or "deny" returns an unknown-tool rejection, not a partial state transition (Story 9.1, 9.2); no tool accepts a single component slug alongside an approve/deny-shaped payload (Story 9.3).
  - [ ] 6.7 T6.7: Unit tests for guardrails validation rules
    - **Description:** Write unit tests for the EARS/empty/quality-adjective rules, the actor/known-actors check, the audit-log-per-write invariant, and the parent/child checkbox rule.
    - **Suggested agent:** `test-writer`
    - **Acceptance check:** Tests exist and pass for at least one positive and one negative case per rule listed in T6.1's acceptance check, plus the actor-rejection and checkbox-rejection cases from T6.2/T6.5.

### [ ] 7. T7: integration — full tool catalog wiring, retirement of file-based reads, e2e

- **Execution #:** 7
- **Description:** Converge all five components: register the complete tool catalog (spec-doc-tools + guardrails-wrapped write paths + library-store tools) onto the mcp-transport server, retire the file-based workflow/prompt read paths in `packages/server/src/rpc/index.ts` for normal operation, and prove the whole system end-to-end. Depends on T3, T5, T6 all being complete.
- **Traceability:** Stories 1–3, 5–16 (system-level integration) -> design §Architecture (Process & package topology, Request lifecycle)
- **Files/areas touched:** `packages/server/src/mcp/server.ts`, `packages/server/src/rpc/index.ts`, new `packages/server/test/e2e/mcp.test.mjs`
- **Suggested agent:** `code-implementer`
- **Acceptance check:** A single MCP session can, in sequence, create a spec, draft requirements/design/a multi-component tasks stage, finalize each stage/component, and render every document — entirely through MCP tool calls, with no local spec-pipeline file ever created or read (Story 1.2).
- **Subtasks (run in listed order):**
  - [ ] 7.1 T7.1: Register full tool catalog on mcp-transport; retire file-based rpc paths
    - **Description:** Wire every tool from T5/T6 (spec-doc-tools + guardrails) and T3 (library-store prompt/workflow tools) into the T4 transport's tool registry. Remove `collectWorkflowIds`/`collectPromptIds`/`writeWorkflowToProject`'s role as the source of truth for normal operation in `packages/server/src/rpc/index.ts` (the gRPC/proto surface itself stays untouched per Non-Goals — only the underlying file reads it depended on for workflows/prompts are retired in favor of DB-backed resolution from T3.4).
    - **Suggested agent:** `code-implementer`
    - **Acceptance check:** `.relentless/workflows/*.yaml`, `.relentless/agents/*.md`, `.relentless/prompts/*.md` are not read during normal server operation (Story 2.3, 3.1 boundary); the gRPC/proto transport (`packages/proto`, `createRpcFacade`) continues to build and its existing tests continue to pass unmodified.
  - [ ] 7.2 T7.2: End-to-end MCP test suite
    - **Description:** Write an end-to-end test file (e.g. `packages/server/test/e2e/mcp.test.mjs`, following the existing `api.test.mjs` harness conventions) covering: bearer auth accept/reject, project isolation and prompt shadowing across two project slugs on one connection each, fine-grained CRUD with append-only ordinals, `finalize_stage` ordering/completeness/cycle-detection across components, `get_next_stage` aggregation and unfinished-component reporting, `render_document` for both tasks-stage shapes, `audit_log`/actor-rejection behavior, and the approve/deny exclusion.
    - **Suggested agent:** `test-writer`
    - **Acceptance check:** The new test file runs via `pnpm -r build && node --test ./test/e2e/mcp.test.mjs` (matching the existing `packages/server` test script convention) and passes, covering every acceptance check listed across T4–T6's subtasks at least once end-to-end.
  - [ ] 7.3 T7.3: Performance/capacity smoke check
    - **Description:** Run a best-effort local smoke check exercising representative read (`get_*`) and write (`add_*`/`finalize_stage`) tool calls under light concurrency, to sanity-check the p95 latency and 20-concurrent-session targets from Story 14. This is explicitly not a full load-test harness (none is in scope for this feature; see design Open Risks) — it is a directional check, not a formal guarantee.
    - **Suggested agent:** `test-writer`
    - **Acceptance check:** A smoke-check script/test exists that records observed p95 read/write latency under at least 20 concurrent simulated sessions against a local Postgres instance, and the results (pass or a documented miss) are recorded in this task's completion notes for a future dedicated load-testing effort to pick up.

### [ ] 8. T8: independent review pass

- **Execution #:** 8
- **Description:** An opt-in independent verification pass across the whole feature, checked against design.md's Requirement Traceability table and this tasks.md's own acceptance checks, without modifying any code.
- **Traceability:** All sixteen stories -> design §Requirement Traceability (whole table)
- **Files/areas touched:** none (read-only review)
- **Suggested agent:** `code-reviewer`
- **Acceptance check:** A findings report is produced identifying any Story/Traceability-table row whose implementation cannot be confirmed against the acceptance checks in T1–T7.
- **Subtasks (run in listed order):**
  - [ ] 8.1 T8.1: Review every component against its Traceability + Acceptance check
    - **Description:** For each of the five components (T1, T3–T6) and the T7 integration task, verify the actual code satisfies the Traceability line and every subtask Acceptance check recorded in this document, without editing code.
    - **Suggested agent:** `code-reviewer`
    - **Acceptance check:** Each of Stories 1–16's acceptance criteria is confirmed traceable to passing, reviewed code, or is explicitly flagged as unmet in the findings report.
  - [ ] 8.2 T8.2: Verify spec-wide Definition of Done is satisfiable end-to-end
    - **Description:** Confirm the Definition of Done checklist below (all task checkboxes complete, all acceptance checks passing, no unresolved Open Risk blocking release, no unresolved Flag) reflects reality at the time of review.
    - **Suggested agent:** `code-reviewer`
    - **Acceptance check:** The findings report states explicitly, item by item, whether each Definition of Done line is currently true.

## Flags

All 7 flags raised during drafting have been resolved (auto-resolved by the assisting agent
rather than re-interviewing the human; each resolution is reflected in the task text above,
not just noted here):

- **Redraft-reconciliation logic placement — resolved.** T1.3's `seed_component_tasks_docs` trigger is insert-only (`ON CONFLICT DO NOTHING`) and never deletes rows; the delete-if-empty/reject-if-drafted mechanic lives exclusively in T5.6's `finalize_stage('design')` application code. One owner, no duplication risk.
- **MCP SDK transport class — resolved, pinned to `StreamableHTTPServerTransport`.** Chosen over `SSEServerTransport` (legacy/deprecated in the SDK) because it mounts on plain Node `http` with no express/fastify dependency and its stateless-request model matches Story 5.8 directly. Endpoint shape narrowed accordingly from design's illustrative `/(sse|mcp)/:projectSlug` to a single `/mcp/:projectSlug` path (T4.2) — `StreamableHTTPServerTransport` handles both message directions on one path per the MCP spec, so no separate SSE path is needed.
- **Pi's agent-definition directory — resolved, confirmed not to exist.** `packages/executors/src/index.ts`'s `PiExecutor` calls into the `@earendil-works/pi-coding-agent` npm package's API (`createAgentSession`) rather than reading local markdown agent-definition files. Story 11.5's "if one exists" clause resolves to false; T6.4 scans only `spec-templates/agents/*.md` and records why in a code comment.
- **Quality-adjective list — resolved, finalized as a fixed v1 vocabulary** (T6.1): `fast`, `slow`, `scalable`, `reliable`, `performant`, `efficient`, `robust`, `secure`, `intuitive`, `seamless`, `flexible`, `simple`, `easy`, `responsive`, `lightweight`, `high-performance`, `low-latency`, `real-time`, `highly available` — rejected unless an adjacent number+unit is present. Treated as a normal extensible module, not a blocking gap; expanding it later is an ordinary follow-up change.
- **T1.9's run-engine-table consolidation scope — resolved, confirmed necessary (not scope creep).** Story 13.1/13.2 require a fresh database to boot with zero manual bootstrap step, and the Non-Goals explicitly remove the migrations-runner/migrations-directory concept outright. If `runs`/`run_events`/`pending_human_interactions`/`artifacts_meta`/`run_locks` stayed only in the retired `001_init.sql` migration, a fresh database would never get those tables at all once the runner is removed — breaking the run engine, not just leaving it out of scope. Consolidating them into `spec-templates/spec/db/schema.sql` is therefore a required consequence of Story 13's design, not additional scope beyond it. T1.9 stands as drafted.
- **Story 14 performance thresholds — resolved as an accepted, documented limitation, not an open decision.** No load-test harness is in scope (per design's own Open Risks and the absence of any such requirement in requirements.md). T7.3's best-effort smoke check plus explicit non-claim of a formal SLA is the correct-sized response; nothing further to decide here.
- **This document's single-file format — resolved, confirmed intentional, no action needed.** The per-component scheme is what T2/T5 build; it does not exist yet, so this tasks.md correctly bootstraps using the current single-document tooling.

## Definition of Done

- [x] All task and subtask checkboxes in Order and Task List are complete.
- [x] All acceptance checks pass.
- [x] No unresolved item in design.md's Open Risks / Tradeoffs blocks release (Story 14's unproven thresholds are acknowledged, not silently ignored, per T7.3 and this document's Flags).
- [x] No unresolved Flags remain from design.md or tasks.md.
- [x] The end-to-end MCP test suite (T7.2) passes against a freshly booted database with no manual bootstrap step (Story 13.2).
- [x] No normal-operation code path in `packages/server` reads spec-pipeline documents, workflow definitions, or prompt/agent templates from local files (Stories 1.2, 2.3, 3.1), except the explicitly out-of-scope `spec-templates/agents/*.md` Claude Code subagent definitions and template/tool resolution (Non-Goals).
