<!--
  design.md — API-Driven Spec Guarding
  Drafted autonomously by the design stage from an APPROVED requirements.md. No human
  interview happened at this stage. Concerns where requirements.md was insufficient are
  recorded in Flags rather than blocking. Grounded in the actual relentless/ monorepo:
  packages/{server,persistence,library,schema} and spec-templates/spec/db/schema.sql.
-->

# Design: API-Driven Spec Guarding

## Overview

This feature replaces relentless's file-based storage of three subsystems — spec-pipeline
documents (decisions/requirements/design/tasks/status), workflow definitions, and the
workflow engine's internal prompt/agent template library — with a Postgres-backed,
multi-project data model exposed to agents over a remote MCP (HTTP/SSE) transport. On top of
that storage sits a deterministic API-layer guardrail set: semantic/EARS content validation,
pipeline-ordering enforcement, and completeness checks at stage finalization. The point is
that spec quality and pipeline sequencing stop depending on an agent faithfully following
prose in brittle `agent.md` files as its context grows.

The design builds directly on what already exists. `spec-templates/spec/db/schema.sql` is the
canonical `spec_pipeline` DDL (specs → requirements/designs/tasks children, with real enum
types, a `set_updated_at()` trigger, and a `seed_spec_stages()` AFTER-INSERT trigger). This
design *evolves* that schema rather than replacing it: it drops the one-`tasks_docs`-per-spec
constraint, adds a component model, adds projects/prompts/audit/known-actors tables, and
reconciles the schema with Story 13's "apply idempotent DDL on every boot" model. The MCP
transport is added as an extension of the existing `packages/server` daemon
(`buildComposition` / `startDaemon`), not a new process. The existing file-reading RPC facade
in `packages/server/src/rpc/index.ts` is superseded for spec/workflow/prompt reads by
DB-backed resolution.

Requirements addressed span all sixteen stories: DB-backed spec docs (Story 1), DB-backed
workflows (Story 2) and versioned prompt/agent library (Story 3), multi-project isolation
(Story 4), the remote bearer-guarded MCP transport (Story 5), fine-grained per-row tools
(Story 6), `finalize_stage` ordering+completeness enforcement (Story 7), `get_next_stage`
(Story 8), the human-only approve/deny exclusion (Story 9), markdown rendering (Story 10),
attribution + audit log (Story 11), deterministic content validation (Story 12), idempotent
boot + bundled-default seeding (Story 13), performance/capacity thresholds (Story 14), the
design-declared component model with strict 1:1 task-document mapping (Story 15), and
cross-component dependency edges with independent per-component finalize plus a single
spec-wide approve/deny gate (Story 16).

## Components

<!-- Story 15: design.md formally declares >=1 component (kebab-case slug + display name).
     The tasks stage maps 1:1 onto these: exactly one task document per component. NOTE: the
     current design.template.md has no Components section; adding it is itself in scope (see
     Flags). Cross-component task dependency edges (Story 16) between the task items that will
     hang off these components are illustrated at the end of Data Model / Interfaces. -->

This spec declares five components. Every downstream tasks-stage task document maps one-to-one
onto exactly one of these slugs.

| Slug | Display name | Responsibility |
|---|---|---|
| `db-schema` | Database Schema & Idempotent Boot | Evolve `spec_pipeline` DDL (component model, projects, prompts, audit, known-actors), seeding triggers, and the boot-time idempotent apply path replacing the migrations runner. |
| `mcp-transport` | MCP Transport & Project Scoping | HTTP/SSE MCP server extending `packages/server`, bearer-token auth, project-scoped endpoints/session binding, implicit project provisioning. |
| `spec-doc-tools` | Spec-Pipeline Document Tools | Fine-grained add/update/delete tools per child table, `finalize_stage`, `get_next_stage`, component + dependency-edge tools, markdown rendering. |
| `guardrails` | Validation, Attribution & Audit | Semantic/EARS content validation, empty/quality-adjective rejection, actor-registry validation, append-only audit logging, ordering/completeness/cycle enforcement helpers. |
| `library-store` | Workflow & Prompt Library Store | DB-backed workflows and versioned prompt/agent library with project scoping, origin markers, shadowing, and seed-if-absent bundled defaults. |

## Architecture

### Process & package topology

```
                        HTTP/SSE (bearer-guarded, project-scoped endpoint)
  MCP client (agent) ───────────────────────────────────────────────► packages/server daemon
                                                                          │
                     ┌────────────────────────────────────────────────────┤
                     ▼                        ▼                             ▼
             [mcp-transport]          [spec-doc-tools]              [library-store]
          HTTP listener + auth   tool handlers (add/update/       workflow + prompt
          + session→project bind  delete/finalize/render/          resolution & versioning
                     │            get_next_stage/edges)                    │
                     └───────────────┬──────────────┬────────────────────┘
                                     ▼              ▼
                              [guardrails]     @relentless/persistence (pg Pool)
                        validation · actor      SpecRepository (new query layer)
                        registry · audit log            │
                                     └──────────────────┤
                                                        ▼
                                             Postgres  spec_pipeline schema
                                          (evolved schema.sql, applied idempotently on boot)
```

- **mcp-transport** is new code inside `packages/server` (e.g. `packages/server/src/mcp/`). It
  adds `@modelcontextprotocol/sdk` and a Node `http` listener (no new dependency on
  express/fastify is required — the MCP SDK's `StreamableHTTPServerTransport` mounts on a bare
  Node request handler). It is wired into `buildComposition`/`startDaemon` so the daemon keeps
  being a single process (Story 5.2).
- **spec-doc-tools**, **guardrails**, and **library-store** are tool/service modules that the
  transport dispatches to. They are pure over a new persistence query layer (a
  `SpecRepository` added to `@relentless/persistence`, alongside the existing
  `PostgresRunStore`/`PostgresArtifactStore`, reusing the same `pg` `Pool` and
  `withTransaction` helper).
- The existing `createRpcFacade` file-based workflow/prompt reads
  (`packages/server/src/rpc/index.ts`) are superseded by DB-backed resolution for
  workflows/prompts; the gRPC/proto transport is explicitly untouched (Non-Goal).

### Request lifecycle (a single write tool call)

1. HTTP request arrives at `POST /mcp/:projectSlug` (or the SSE equivalent). Bearer middleware
   checks the `Authorization: Bearer <token>` header against the configured shared token; a
   mismatch/absence → 401 before any tool runs (Story 5.3).
2. The transport resolves `:projectSlug` to a `projects` row, auto-creating it if absent
   (Story 4.2, Story 5.4). The resolved `project_id` is bound to the MCP session for its
   lifetime; individual tool calls never carry a project parameter (Story 5.5).
3. The tool handler validates the caller-supplied `actor` against `known_actors` (Story 11.4)
   and the payload against the semantic/content rules in **guardrails** (Story 12). Any
   failure returns a structured, rule-identifying error and performs no write
   (Story 12.3, Story 7.6).
4. On success the handler executes the DB mutation inside a single transaction that also
   appends an `audit_log` row (Story 11.2). Last-write-wins; no optimistic-concurrency check
   (Story 6.5, Non-Goal).

### Boot lifecycle (Story 13)

`buildComposition → ensureDatabaseReady` changes from "run every file in
`packages/persistence/migrations/`" to "apply the single canonical idempotent DDL"
(the evolved `spec-templates/spec/db/schema.sql`, shipped with the package and referenced by
path, executed as one script of `CREATE ... IF NOT EXISTS` / `CREATE TYPE ... /` guarded
statements). The migrations-runner/`applyMigrations` directory concept is removed (Story 13.1,
13.2; Non-Goal "incremental migration tooling"). After DDL, boot runs two idempotent seed
passes: (a) scan agent-definition files → upsert `known_actors` (Story 11.5); (b) seed bundled
default prompts/agents/workflows as project-less rows with `origin = 'bundled'` using
seed-if-absent (`ON CONFLICT DO NOTHING`), never overwriting an existing row (Story 13.3–13.5).

## Data Model / Interfaces

All DDL below lives in `spec_pipeline` (the existing schema namespace) and is authored as
idempotent statements so the whole file re-applies cleanly on every boot (Story 13.1). Enum
mutations use `CREATE TYPE ... ` guarded by a `DO $$ ... IF NOT EXISTS` block; table/column
additions use `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

### 1. Projects (Story 4)

```sql
CREATE TABLE IF NOT EXISTS spec_pipeline.projects (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT projects_slug_is_kebab_case CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
```

- `specs`, `prompts`, and `workflows` gain a `project_id UUID REFERENCES projects(id)`.
- `specs.slug` uniqueness moves from global `UNIQUE(slug)` to `UNIQUE(project_id, slug)` so two
  projects can host same-named specs (Story 4.1).
- Implicit provisioning is an application helper `ensureProject(slug)` doing
  `INSERT ... ON CONFLICT (slug) DO NOTHING RETURNING id` then `SELECT` — called once per
  session bind, never as an explicit tool (Story 4.2; Non-Goal "explicit project-provisioning
  call").
- Bundled default prompts/workflows are project-less rows: `project_id IS NULL` (Story 4.3,
  4.5). Isolation is enforced purely by `project_id` predicates in every query (Story 4.1,
  Story 5.6 — auth is not per-project).

### 2. Design components (Story 15)

```sql
CREATE TABLE IF NOT EXISTS spec_pipeline.design_components (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id    UUID NOT NULL REFERENCES spec_pipeline.designs (id) ON DELETE CASCADE,
    slug         TEXT NOT NULL,
    display_name TEXT NOT NULL,
    ordinal      INTEGER NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (design_id, slug),
    UNIQUE (design_id, ordinal),
    CONSTRAINT design_components_slug_is_kebab_case
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
```

The kebab-case CHECK reuses the exact `specs`-slug pattern (Story 15.3). `display_name` is a
separate free-text field for rendered markdown (Story 15.4). Mandatory ≥1 component is enforced
at design finalization, not by schema (Story 15.1, 15.2) — see `finalize_stage` below.

### 3. Tasks documents become per-component (Stories 15, 16)

The single-row-per-spec constraint is dropped; `tasks_docs` becomes one row per declared
component, carrying its own independent lifecycle status.

```sql
-- Evolution of the existing tasks_docs table:
--   * drop UNIQUE(spec_id)
--   * add component linkage + per-component status
CREATE TABLE IF NOT EXISTS spec_pipeline.tasks_docs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spec_id             UUID NOT NULL REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE,
    design_component_id UUID NOT NULL REFERENCES spec_pipeline.design_components (id) ON DELETE CASCADE,
    component_slug      TEXT NOT NULL,          -- denormalized for rendering/edge resolution
    component_name      TEXT NOT NULL,          -- display name snapshot
    feature_name        TEXT NOT NULL,
    status              spec_pipeline.stage_status NOT NULL DEFAULT 'not_started',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (spec_id, component_slug),           -- strict 1:1 mapping (Story 15.7)
    UNIQUE (design_component_id)                -- exactly one doc per component
);
```

- `status` here is the authoritative per-component lifecycle (Story 16.5). `task_items`,
  `task_files_touched`, `parallel_batches`/`parallel_batch_members`, and `tasks_flags` keep
  hanging off `tasks_doc_id` unchanged — they remain per-component (Story 16.10 for Flags;
  Parallel Execution Schema stays intra-component per Story 16.1).
- The `spec_stages` row for `stage_name = 'tasks'` is retained but redefined as a spec-wide
  *aggregate/cache*: it is not settable by `finalize_stage` (which is per-component); it flips
  to `approved` only by the human spec-wide approve action (Story 16.7). `get_next_stage`
  computes tasks actionability from the `tasks_docs.status` set directly rather than trusting
  that cache (see Story 8 below).

**Auto-seeding trigger (Story 15.5, 15.6).** Mirroring the existing `seed_spec_stages`
AFTER-INSERT trigger precedent, a trigger seeds component task documents when design reaches
`in_review` (the "Components section finalized" moment):

```sql
CREATE OR REPLACE FUNCTION spec_pipeline.seed_component_tasks_docs() RETURNS trigger AS $$
BEGIN
    IF NEW.stage_name = 'design' AND NEW.status = 'in_review'
       AND OLD.status IS DISTINCT FROM 'in_review' THEN
        INSERT INTO spec_pipeline.tasks_docs
            (spec_id, design_component_id, component_slug, component_name, feature_name)
        SELECT d.spec_id, c.id, c.slug, c.display_name, d.feature_name
        FROM spec_pipeline.designs d
        JOIN spec_pipeline.design_components c ON c.design_id = d.id
        WHERE d.spec_id = NEW.spec_id
        ON CONFLICT (design_component_id) DO NOTHING;   -- idempotent re-seed
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER spec_stages_seed_component_tasks
    AFTER UPDATE ON spec_pipeline.spec_stages
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.seed_component_tasks_docs();
```

`ON CONFLICT DO NOTHING` makes re-finalization (after a design deny→redraft) additive: newly
declared components get a fresh `not_started` task doc; already-seeded ones are untouched
(Story 15.6 — no separate creation tool; auto-seed is the only path).

**Redraft-with-removed-components mechanic (resolves the requirements Flag).** requirements.md
left open what happens if a redrafted design.md drops a previously-seeded component. Decision:
`finalize_stage('design')` runs a pre-seed reconciliation. For each existing `tasks_docs` row
whose `component_slug` is no longer among the design's declared components:
- if that orphaned doc is still `not_started` **and** has zero `task_items`, it is deleted
  (safe — no drafted work lost);
- if it has any drafted content (task items, or status beyond `not_started`), the design
  finalize is **rejected** with an error naming the orphaned component, forcing the agent to
  explicitly delete that component's drafted work before re-finalizing. This keeps the 1:1
  mapping strict (Story 15.7) without silently destroying authored tasks.

### 4. Cross-component dependency edges (Story 16)

```sql
CREATE TABLE IF NOT EXISTS spec_pipeline.task_dependency_edges (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spec_id           UUID NOT NULL REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE,
    from_task_item_id UUID NOT NULL REFERENCES spec_pipeline.task_items (id) ON DELETE CASCADE,
    to_task_item_id   UUID NOT NULL REFERENCES spec_pipeline.task_items (id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_task_item_id, to_task_item_id),
    CONSTRAINT edge_not_self CHECK (from_task_item_id <> to_task_item_id)
);
CREATE INDEX IF NOT EXISTS task_dependency_edges_to_idx
    ON spec_pipeline.task_dependency_edges (to_task_item_id);
```

- Semantics: `from` blocks `to` (`from` must complete before `to`). Additive to each
  component's own Order/Parallel Execution Schema, which stay intra-component (Story 16.1).
- **Same-component rejection (Story 16.2)** cannot be a pure column CHECK because it requires
  resolving each endpoint's `tasks_doc_id → component`. `add_task_dependency_edge` resolves both
  endpoints' `tasks_doc_id` and rejects when they are equal (also enforced defensively by a
  BEFORE INSERT trigger that joins both endpoints to `task_items.tasks_doc_id`).
- **No cycle detection on add (Story 16.3):** the add path performs only the same-component and
  existence checks.
- **Cycle detection at finalize (Story 16.4):** `finalize_stage` for any component runs a
  `WITH RECURSIVE` walk over *all* of the spec's edges and rejects if a back-edge is reached:

  ```sql
  WITH RECURSIVE reach(from_id, to_id, path) AS (
      SELECT from_task_item_id, to_task_item_id,
             ARRAY[from_task_item_id, to_task_item_id]
      FROM spec_pipeline.task_dependency_edges WHERE spec_id = $1
    UNION ALL
      SELECT r.from_id, e.to_task_item_id, r.path || e.to_task_item_id
      FROM reach r
      JOIN spec_pipeline.task_dependency_edges e
        ON e.from_task_item_id = r.to_id AND e.spec_id = $1
      WHERE NOT e.to_task_item_id = ANY(r.path)      -- prune already-visited
  )
  SELECT 1 FROM reach WHERE to_id = from_id LIMIT 1; -- any row => cycle
  ```

### 5. Definition of Done moves to spec scope (Story 16.9)

```sql
-- Was: definition_of_done_items(tasks_doc_id ...). Now spec-scoped:
CREATE TABLE IF NOT EXISTS spec_pipeline.definition_of_done_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spec_id     UUID NOT NULL REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE,
    ordinal     INTEGER NOT NULL,
    description TEXT NOT NULL,
    is_checked  BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (spec_id, ordinal)
);
```

`tasks_flags` is unchanged (stays keyed on `tasks_doc_id`, i.e. per-component) per Story 16.10.

### 6. Prompt/agent library with version history (Stories 3, 4, 13)

```sql
CREATE TABLE IF NOT EXISTS spec_pipeline.prompts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES spec_pipeline.projects (id) ON DELETE CASCADE, -- NULL = bundled
    prompt_key      TEXT NOT NULL,           -- e.g. 'design-drafter'
    kind            TEXT NOT NULL,           -- 'agent' | 'prompt'
    body            TEXT NOT NULL,
    description     TEXT,
    origin          TEXT NOT NULL DEFAULT 'user',    -- 'bundled' | 'user' (Story 13.5)
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- project-scoped uniqueness AND a distinct project-less (bundled) uniqueness:
CREATE UNIQUE INDEX IF NOT EXISTS prompts_project_key
    ON spec_pipeline.prompts (project_id, prompt_key) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS prompts_bundled_key
    ON spec_pipeline.prompts (prompt_key) WHERE project_id IS NULL;

CREATE TABLE IF NOT EXISTS spec_pipeline.prompt_snapshots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id   UUID NOT NULL REFERENCES spec_pipeline.prompts (id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    body        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (prompt_id, version)
);
```

- On every prompt update, the handler writes a `prompt_snapshots` row capturing the *prior*
  body/description then bumps `current_version` — mirroring the `workflow_snapshots` pattern
  (Story 3.2). Point-in-time recovery is a `prompt_snapshots` lookup by `(prompt_id, version)`
  or timestamp (Story 3.3).
- **Shadowing (Story 4.4):** `resolvePrompt(project_id, key)` selects the project-scoped row if
  present, else the bundled (`project_id IS NULL`) row. No per-project copy is created
  (Story 4.5).

### 7. Workflows (Story 2)

The dormant `workflows`/`workflow_snapshots` tables (currently in the public schema via
`packages/persistence/migrations/001_init.sql`) are brought into the canonical idempotent DDL
and extended with `project_id UUID REFERENCES projects(id)` (NULL = bundled) and
`origin TEXT NOT NULL DEFAULT 'user'`. Create/update tools write here (Story 2.1, 2.2); the
file-reading path in `rpc/index.ts` (`collectWorkflowIds`, `writeWorkflowToProject`) is retired
for normal operation (Story 2.3). `workflow_snapshots` continues to hold version history and
gains the same seed-if-absent + origin treatment as prompts (Story 13.3–13.5).

### 8. Attribution & audit (Story 11, 14.4)

```sql
CREATE TABLE IF NOT EXISTS spec_pipeline.known_actors (
    actor      TEXT PRIMARY KEY,
    source     TEXT NOT NULL,        -- file/dir the name was discovered in
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spec_pipeline.audit_log (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor      TEXT NOT NULL,
    action     TEXT NOT NULL,        -- 'insert' | 'update' | 'delete' | 'finalize'
    table_name TEXT NOT NULL,
    row_id     TEXT NOT NULL,
    project_id UUID,
    ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON spec_pipeline.audit_log (ts);
```

- Every write tool takes a required `actor` argument (Story 11.1). Validation:
  `SELECT 1 FROM known_actors WHERE actor = $1` — miss → reject (Story 11.4).
- The mutation and its `audit_log` INSERT share one transaction; the log is append-only, never
  updated/deleted by normal operations (Story 11.2, 11.3), and has no row cap (Story 14.4).
- **Registry sync at boot (Story 11.5):** scan `spec-templates/agents/*.md` (and Pi's
  agent-definition directory if present) for agent names, `INSERT ... ON CONFLICT (actor) DO
  UPDATE source` into `known_actors`.

### 9. MCP transport & tool surface

**Transport (Story 5).** New `packages/server/src/mcp/` mounts an
`@modelcontextprotocol/sdk` server over an HTTP/SSE listener (Story 5.1) inside the existing
daemon (Story 5.2). Config additions to `serverConfigSchema`
(`packages/server/src/config/schema.ts`): `mcpBearerToken` (from `RELENTLESS_MCP_BEARER_TOKEN`),
`mcpHost`, `mcpPort`. Endpoint shape: `/(sse|mcp)/:projectSlug`. A pre-handler validates the
bearer token (Story 5.3, 5.6 — token is not per-project) and binds `:projectSlug`→`project_id`
to the session (Story 5.4, 5.5). The token is a static env secret with no in-API
expiry/rotation/revocation (Story 5.7) and reconnects are fresh, stateless connections
(Story 5.8). Because tool calls are atomic and self-contained, no session-resume state exists.

**Tool catalog** (project is implicit; every write also takes `actor`):

- Spec lifecycle: `create_spec`, `get_spec`, `list_specs`, `get_next_stage`,
  `finalize_stage`, `render_document`.
- Requirements child tools (add/update/delete each): `user_story`, `acceptance_criterion`,
  `non_goal`, `assumption_open_question`, `glossary_term`; plus `set_requirements_overview`.
- Design child tools: `set_design_overview`, `set_design_architecture`; add/update/delete each
  of `design_data_model_entry`, `design_traceability`, `design_alternative`, `design_open_risk`,
  `design_flag`, and **`design_component`** (new, Story 15).
- Tasks child tools (component-scoped — each takes the component slug): add/update/delete each
  of `task_item`, `task_file_touched`, `parallel_batch`, `parallel_batch_member`, `tasks_flag`;
  add/update/delete `definition_of_done_item` (spec-scoped now); and **`task_dependency_edge`**
  (add/delete, new, Story 16).

**`finalize_stage(stage, component?)` (Stories 7, 15, 16):**
- `component` is required and meaningful only for `stage = 'tasks'`; it transitions *that
  component's* `tasks_docs.status` to `in_review`, not a shared tasks status (Story 7.1,
  16.5).
- Predecessor-approved ordering check: reject if the predecessor stage is not `approved`
  (requirements→design→tasks) (Story 7.2). For a component task doc, the predecessor is the
  design stage being `approved`.
- Completeness checks with a rule-identifying error (Story 7.6):
  - zero required top-level items → reject: zero user stories (requirements), zero declared
    components (design, Story 15.2), zero task items in the component (tasks) (Story 7.4);
  - requirements: any user story with zero acceptance criteria → reject (Story 7.5);
  - tasks: any top-level task item in the component with zero `task_files_touched` → reject
    (Story 12.10);
  - tasks: run the cross-component cycle check (Story 16.4).
- Adding a child whose parent record does not exist is rejected at the add path (Story 7.3).

**`get_next_stage(spec)` (Story 8):** returns the first stage that is not `approved` and whose
predecessor is `approved` (Story 8.1); indicates "none actionable" when all stages are
`approved` (Story 8.2). The tasks stage is treated as `approved` only when *every* component's
`tasks_docs.status = 'approved'`, and as still-actionable while any is not (Story 8.3). The
response includes the list of components whose task docs have not yet reached `in_review`/
`approved` (Story 8.4).

**Approve/deny is not exposed (Story 9).** No tool transitions `in_review → approved` or
records a denial (Story 9.1); such calls are unknown tools and rejected (Story 9.2). The
tasks-stage approve/deny is described as a single spec-wide human action over all components;
no tool can approve/deny one component independently (Story 9.3, 16.6–16.8). The human-facing
surface that performs approve/deny is out of scope (Non-Goal).

**Rendering (Story 10).** `render_document(spec, stage, component?)` reconstructs markdown from
rows in the prior template's layout (Story 10.1, 10.2). For `stage = 'tasks'`:
- `component = 'all'` (or omitted) → the top-level `tasks.md` index: every declared component
  with its current status, the Cross-Component Dependencies, and the spec-wide Definition of
  Done (Story 10.3).
- `component = '<slug>'` → that component's own Order, Parallel Execution Schema, Task List, and
  Flags (Story 10.4).

### 10. Semantic/content validation (Story 12)

A `guardrails` validation module applied *before* every write, in addition to DB constraints
(Story 12.4). Rules:
- EARS-clause enforcement on fields requiring measurable statements: an
  `acceptance_criterion` / non-functional statement whose text lacks a valid EARS clause
  pattern is rejected (Story 12.1). When `acceptance_criterion.full_text` is written with a
  declared `ears_pattern`, the text must structurally match (contain `SHALL` plus the pattern's
  implied keyword — `WHEN`/`IF`/`WHILE`/`WHERE`) or it is rejected (Story 12.6). Uses the
  existing `ears_pattern` enum as the pattern vocabulary.
- Empty/whitespace-only rejection for meaningful-content fields generally (Story 12.2), and
  specifically for `user_story.{role,capability,benefit,rationale}` (Story 12.5),
  `design_traceability.addressed_by` / `design_data_model_entries.content` (Story 12.8), and
  `task_items.{traceability,acceptance_check,description}` within any component (Story 12.9).
- Unquantified quality-adjective rejection: a curated adjective list (`fast`, `scalable`,
  `reliable`, `performant`, `efficient`, `robust`, …) triggers rejection unless accompanied by
  a number+unit (Story 12.7).
- The parent/child checkbox rule: an `update_task_item` marking a parent `is_checked = true`
  while any child `task_item` in the same component doc is unchecked is rejected — an intra-
  component rule that ignores cross-component edges (Story 6.6).
- Every rejection returns a distinct, rule-naming error (Story 12.3).

### 11. Fine-grained tool semantics (Story 6)

Each child table gets its own add/update/delete tool (Story 6.1, 6.2). Add is append-only:
new ordinal = current max + 1 for that sequence (Story 6.3). Repositioning requires explicit
`update` calls on the affected rows; no automatic reindex (Story 6.4; Non-Goal). Concurrent
update/delete on the same row is last-write-wins with no version conflict (Story 6.5;
Non-Goal). Reused mechanics: `withTransaction` from `@relentless/persistence`, and the existing
`set_updated_at()` trigger on mutated tables.

### 12. Template shape changes (implementation for the tasks stage — described, not edited here)

- **`design.template.md`** gains a `## Components` section: a table of `slug | display name |
  responsibility`, mandatory ≥1 row (mirrors the Components section authored above). This is
  what the `add_design_component` tool and the design-finalize completeness check read against.
- **`tasks.template.md`** splits into two templates: (a) a per-component
  `{component}-tasks.md` template holding that component's Order, Parallel Execution Schema,
  Task List, and Flags (the current template's body, minus the spec-wide Definition of Done);
  and (b) a new top-level `tasks.md` index template listing each declared component + status,
  the Cross-Component Dependencies section, and the single spec-wide Definition of Done. The
  render tool (§9) produces both shapes.

### 13. Cross-component edge illustration (this spec's own components)

The five components declared above have natural build-order edges the tasks stage will encode
as `task_dependency_edges` between their task items (illustrative, not exhaustive):

```
db-schema ──► mcp-transport ──► spec-doc-tools ──► guardrails
    └────────► library-store ──────────┘
```

`db-schema` task items block the others (schema must exist first); `guardrails` and
`spec-doc-tools` items are mutually additive within the finalize/validation flow. No cycle
exists, so the finalize-time cycle check passes.

## Requirement Traceability

| Requirement | Addressed by |
|---|---|
| Story 1: Author spec-pipeline documents through the API | Data Model §3, §9 (spec/requirements/design/tasks/status all DB rows + tools); Architecture (DB-backed resolution replacing `rpc/index.ts` reads) |
| Story 2: Author workflow definitions through the API | Data Model §7 (workflows/workflow_snapshots in canonical DDL, `project_id`+`origin`); retiring `collectWorkflowIds`/`writeWorkflowToProject` |
| Story 3: Author and version prompt/agent library entries | Data Model §6 (`prompts` + `prompt_snapshots`, `current_version`, point-in-time lookup) |
| Story 4: Isolate data across multiple projects | Data Model §1 (`projects`, `project_id` scoping, `ensureProject`, bundled project-less rows, shadowing, no per-project copies) |
| Story 5: Connect remotely to a project's MCP endpoint | Architecture (transport in daemon); Data Model §9 (HTTP/SSE, bearer pre-handler, `/…/:projectSlug` binding, static token, stateless reconnect) |
| Story 6: Incrementally build a document with fine-grained row tools | Data Model §11 (per-child add/update/delete, append-only ordinals, LWW); §10 (parent/child checkbox rule 6.6) |
| Story 7: Explicitly finalize a pipeline stage | Data Model §9 `finalize_stage` (ordering + completeness + rule-naming errors; per-component for tasks) |
| Story 8: Determine the next actionable pipeline stage | Data Model §9 `get_next_stage` (tasks aggregate from `tasks_docs.status`, unfinished-component list) |
| Story 9: Keep approve/deny a human-only action | Data Model §9 "Approve/deny is not exposed" (no tool, unknown-tool rejection, spec-wide-only for tasks) |
| Story 10: Render a document for human review | Data Model §9 rendering + §12 template shapes (index vs per-component) |
| Story 11: Attribute and audit every write | Data Model §8 (`known_actors`, `audit_log`, required `actor`, boot registry sync); Architecture request lifecycle |
| Story 12: Reject non-compliant spec content deterministically | Data Model §10 (EARS/empty/quality-adjective rules, `full_text`↔`ears_pattern`, rule-naming errors, finalize file-touched check) |
| Story 13: Boot against a fresh or existing database | Architecture boot lifecycle; Data Model preamble (idempotent DDL); §6/§7 seed-if-absent + `origin` markers |
| Story 14: Meet baseline performance and capacity thresholds | Architecture (single-transaction writes, indexed lookups); Data Model §8 (uncapped `audit_log`); Open Risks (measurement) |
| Story 15: Declare components and enforce 1:1 mapping | Components section; Data Model §2 (`design_components`), §3 (per-component `tasks_docs`, seed trigger, redraft mechanic), §9 (`add_design_component`, design-finalize check) |
| Story 16: Cross-component dependencies + independent finalize | Data Model §4 (`task_dependency_edges`, same-component rejection, finalize-time cycle check), §3 (per-component status), §5 (spec-wide DoD), §9 (spec-wide approve/deny, per-component finalize) |

## Alternatives Considered

- **Keep `tasks_docs` one-per-spec and model components as a column/tag on `task_items`.**
  Rejected: Story 15's strict 1:1 mapping and independent per-component finalize lifecycle
  (Story 16.5) need a first-class per-component row that owns a `status`. A tag on task items
  cannot carry an independent finalize state or a clean UNIQUE 1:1 constraint.
- **Application-code seeding of component task docs instead of a DB trigger.** A trigger was
  chosen to mirror the existing `seed_spec_stages` precedent in the same schema file, keeping
  seeding atomic with the design→in_review transition and immune to an agent forgetting to call
  a seed step. Application seeding would re-introduce exactly the "agent must remember" fragility
  this feature exists to remove.
- **Continuous cycle detection on every edge add.** Rejected per Story 16.3/Q38: cheap adds,
  with the (potentially expensive) full-graph check deferred to the finalize bottleneck where a
  clean acyclic graph actually matters.
- **JSONB blobs for component/edge/validation data.** Rejected to stay consistent with the
  existing schema's deliberate "no JSONB; every known shape is real columns/rows" stance.
- **A separate standalone MCP process.** Rejected per Story 5.2/Q6: extend the existing
  `packages/server` daemon, reusing its `pg` Pool, config loader, and composition wiring.
- **Adding express/fastify for the HTTP layer.** Rejected: the MCP SDK's HTTP/SSE transport
  mounts on Node's built-in `http` handler, avoiding a heavy new dependency.
- **Per-project copies of bundled defaults at project creation.** Rejected per Story 4.5/Q15:
  shadowing via a resolve-time lookup keeps one shared project-less layer.
- **Deleting orphaned component task docs unconditionally on design redraft.** Rejected in favor
  of the reject-if-drafted rule (Data Model §3) so a redraft can never silently destroy authored
  task work.

## Open Risks / Tradeoffs

- **Story 14 thresholds are asserted, not proven.** The design favors single-transaction writes
  and indexed lookups but includes no load-test harness; whether p95 read <500 ms / write <1 s
  at 20 concurrent sessions holds is unverified until a benchmark exists. The
  `audit_log`-per-write and the recursive cycle check are the most likely hotspots.
- **Recursive cycle check cost is unbounded in principle.** For pathological edge counts the
  `WITH RECURSIVE` walk could be slow at finalize; acceptable for internal-tool scale but noted.
- **`spec_stages.tasks` as a derived cache** introduces a small dual-source-of-truth risk
  between that row and the `tasks_docs.status` set. Mitigated by making `get_next_stage` compute
  from `tasks_docs` directly and only the human approve action writing the cache; still a place
  where drift could occur if a future writer bypasses that path.
- **Idempotent single-file DDL forgoes migration history** (Story 13/Q18). Destructive schema
  evolution (e.g. the `tasks_docs` UNIQUE(spec_id) drop) must be expressed as guarded
  `ALTER`/`DROP CONSTRAINT IF EXISTS` statements; a botched guard could fail re-apply on an
  older database. Greenfield adoption (Non-Goal: no backfill) limits the blast radius.
- **Last-write-wins with no concurrency control** (Story 6.5) means two agents editing the same
  spec concurrently can clobber each other silently; accepted per the requirements/Non-Goal.
- **Same-component edge rejection depends on application + trigger logic, not a static CHECK**,
  so correctness relies on that resolution being present on every add path.

## Flags

- **The current `design.template.md` has no `## Components` section** (Story 15 requires design
  to declare components). This design authored a Components section anyway and specifies the
  template change in Data Model §12, but adding the section to the shipped template — and the
  `add_design_component` tool that reads it — is implementation work the tasks stage must
  schedule. Until the template ships, this design.md's Components section is ahead of the
  template it was drafted against.
- **Requirements did not specify the design-redraft-with-removed-components mechanic** (the gap
  requirements.md itself flagged for design). This design decided it (Data Model §3:
  delete-if-empty, reject-if-drafted). This is a design judgement call, not a requirement — a
  reviewer should confirm the reject-if-drafted behavior is the desired safety posture rather
  than, say, auto-archiving.
- **Pi's agent-definition directory location is unconfirmed.** Story 11.5 says scan Pi's
  equivalent dir "if one exists"; the actual path was not located in the codebase during design
  exploration (only `spec-templates/agents/*.md` and
  `packages/library/bundled/global/agents/*.md` were found). Implementation must resolve Pi's
  path or confirm none exists.
- **No MCP SDK is currently a dependency.** `@modelcontextprotocol/sdk` must be added to
  `packages/server`; the exact transport class (`StreamableHTTPServerTransport` vs
  `SSEServerTransport`) and its project-scoped-routing integration should be pinned during
  implementation, as the SDK's HTTP-transport API surface is the load-bearing assumption behind
  Story 5.
- **Exact quality-adjective list (Story 12.7) is not enumerated by requirements.** This design
  proposes a starter set; the precise vocabulary is a tunable implementation detail that may
  cause false positives/negatives and should be reviewed.
- **`spec_stages` predecessor for a component task doc.** Story 7.2 says finalize is rejected if
  the predecessor stage is not approved; for a per-component task doc this design treats the
  spec-wide `design` stage being `approved` as the predecessor. This is the natural reading but
  was not spelled out in requirements.
