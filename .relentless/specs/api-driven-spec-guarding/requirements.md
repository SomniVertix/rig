# Requirements: API-Driven Spec Guarding

## Overview

Relentless currently stores spec-pipeline documents (decisions/requirements/design/tasks/status),
workflow definitions, and the workflow engine's internal prompt/agent template library as local
files. This feature replaces that file-based storage with a Postgres-backed, multi-project data
model exposed to agents through a remote MCP server, so specs and their governing rules can no
longer silently drift or be lost as an agent's context grows large. Deterministic API-layer
guardrails — semantic content validation, pipeline-ordering enforcement, and completeness checks
on stage finalization — replace reliance on agents faithfully following prose instructions in
brittle `agent.md`-style files.

## User Stories

### Story 1: Author spec-pipeline documents through the API

As an AI agent building a spec, I want to read and write decisions/requirements/design/tasks/status
content through the API instead of local files, so that spec data lives centrally and is no longer
dependent on the local filesystem of whichever machine is running the agent.

**Rationale:** The overarching goal of this initiative is removing the need for specs to exist on
the local machine at all; spec-pipeline documents are the first of the three file-based subsystems
in scope.

**Acceptance Criteria:**

1. THE SYSTEM SHALL store all spec-pipeline document content (decisions, requirements, design,
   the one-or-more per-component task documents that together make up the tasks stage, and
   status) in the database rather than in local files.
2. THE SYSTEM SHALL NOT require any spec-pipeline document to exist as a local file in order to be
   read, written, or advanced through the pipeline.
3. WHEN an agent requests the current state of a spec's pipeline documents, THE SYSTEM SHALL return
   the stored content from the database.

### Story 2: Author workflow definitions through the API

As an AI agent or workflow author, I want workflow definitions stored and served from the database
instead of YAML files under `.relentless/workflows/`, so that workflow authoring goes through the
same guarded API as everything else.

**Rationale:** The user explicitly broadened scope (Q1) to include the workflow engine's own
file-based logic, not just spec-pipeline meta-tooling, and the existing dormant `workflows`/
`workflow_snapshots` tables are reused as the source of truth (Q3) rather than the local YAML files
currently read/written by `packages/server/src/rpc/index.ts`.

**Acceptance Criteria:**

1. THE SYSTEM SHALL store workflow definitions using the existing `workflows`/`workflow_snapshots`
   tables as the source of truth, in place of `.relentless/workflows/*.yaml` files.
2. WHEN a workflow definition is created or updated, THE SYSTEM SHALL persist it to the database
   rather than to a local YAML file.
3. THE SYSTEM SHALL NOT read workflow definitions from local YAML files as part of normal
   operation.

### Story 3: Author and version prompt/agent library entries through the API

As an AI agent executing a workflow step, I want the prompt/agent template library served from the
database with version history, so that the exact prompt content that produced a given result is
recoverable and auditable.

**Rationale:** Prompts/agents (the workflow engine's internal, "flaky agent.md" prompt library
consumed by ClaudeExecutor/PiExecutor) are the third file-based subsystem in scope (Q2), and the
user explicitly chose to give this content version history mirroring `workflow_snapshots` (Q17).

**Acceptance Criteria:**

1. THE SYSTEM SHALL store prompt/agent template content in the database rather than as local
   markdown files under `.relentless/agents/`, `.relentless/prompts/`, or their bundled
   equivalents.
2. WHEN a prompt or agent template row is updated, THE SYSTEM SHALL retain the prior version in a
   snapshot/version-history table rather than discarding it.
3. THE SYSTEM SHALL make it possible to determine which specific prompt/agent version was in
   effect at a past point in time.

### Story 4: Isolate data across multiple projects

As an operator running one MCP server deployment for several distinct codebases, I want each
project's specs, workflows, and prompts data isolated from other projects, so that one deployment
can safely serve multiple unrelated projects.

**Rationale:** The user chose multi-project support from the start (Q12), requiring a
project/workspace scoping concept threaded through the specs, workflows, and prompts tables, with
implicit project provisioning on first write (Q14) and one shared, project-less layer of bundled
defaults that any project may shadow (Q15).

**Acceptance Criteria:**

1. THE SYSTEM SHALL scope spec, workflow, and prompt/agent data by project so that one project's
   data is isolated from another's.
2. WHEN a write references a project identifier that does not yet exist, THE SYSTEM SHALL create
   that project automatically rather than rejecting the write for lack of prior provisioning.
3. THE SYSTEM SHALL maintain bundled default prompts/agents as project-less rows acting as a
   read-only fallback available to every project.
4. WHEN a project creates its own row sharing the same id as a bundled default, THE SYSTEM SHALL
   let the project-scoped row shadow (take precedence over) the bundled default for that project.
5. THE SYSTEM SHALL NOT create a separate per-project copy of each bundled default at project
   creation time.

### Story 5: Connect remotely to a project's MCP endpoint

As an AI agent running on any machine, I want to connect to a project-scoped MCP endpoint over
HTTP/SSE using a shared bearer token, so that I never need a local checkout of spec/workflow/prompt
data to participate in the pipeline.

**Rationale:** The MCP server is a long-running network service reached via HTTP/SSE (Q8),
extending the existing `packages/server` daemon rather than a new standalone process (Q6), guarded
by a single shared bearer token per deployment (Q9), with each project addressed via its own
project-scoped connection/endpoint bound for the session's lifetime (Q16) rather than a per-call
project parameter. The bearer token is deliberately a static, long-lived secret with rotation only
via manual env-var change plus restart — no in-API expiry/rotation/revocation lifecycle (OQ6) — and
a disconnect/reconnect is just a fresh connection with no session-resumption semantics to build
(OQ7).

**Acceptance Criteria:**

1. THE SYSTEM SHALL expose the MCP server over an HTTP/SSE remote transport.
2. THE SYSTEM SHALL implement the MCP transport as an extension of the existing `packages/server`
   daemon rather than as a separate standalone process.
3. WHEN a request does not present a valid shared bearer token, THE SYSTEM SHALL reject the
   request.
4. THE SYSTEM SHALL bind an MCP connection/session to exactly one project for that session's
   entire lifetime via a project-scoped endpoint.
5. THE SYSTEM SHALL NOT require a project identifier parameter on individual tool calls, since the
   project is already determined by the connection.
6. IF a caller holding the shared bearer token addresses a different project's endpoint, THEN THE
   SYSTEM SHALL allow the request (auth is not itself per-project; isolation is enforced at the
   schema/query level per Story 4), consistent with the single-shared-token model chosen.
7. THE SYSTEM SHALL NOT provide any in-API mechanism to expire, rotate, or revoke the shared bearer
   token. Rotating the token is a manual operational action — changing the configured environment
   variable and restarting the server — with no built-in refresh, expiry, or revocation flow.
8. WHEN an MCP client disconnects and later reconnects, THE SYSTEM SHALL treat the reconnection as a
   new, independent connection to the same project-scoped endpoint, re-presenting the bearer token,
   with no prior session state resumed or required (every tool call is already atomic and
   self-contained).

### Story 6: Incrementally build a document with fine-grained row tools

As an AI agent drafting a requirements/design/tasks document, I want separate add/update/delete
tools per child item (e.g. user story, acceptance criterion, non-goal, task), so that I can build
up and correct a document incrementally with item-level feedback rather than submitting or
resubmitting an entire document at once.

**Rationale:** The user chose fine-grained per-row tools over whole-document submission (Q22),
paired with per-row update/delete tools for targeted corrections including during
redraft-after-deny (Q24), append-only ordering for newly added items (Q28), and no
optimistic-concurrency guarding on concurrent updates/deletes (Q29).

**Acceptance Criteria:**

1. THE SYSTEM SHALL provide a distinct add tool per child table (e.g. user stories, acceptance
   criteria, non-goals, tasks) that an agent calls repeatedly to build up a document.
2. THE SYSTEM SHALL provide update and delete tools per child table so that an agent can correct or
   remove an individual row without clearing the entire stage.
3. WHEN an add tool is called for a given sequence, THE SYSTEM SHALL place the new item at the end
   of that sequence (highest existing ordinal + 1).
4. IF an agent needs to reposition an existing item within its sequence, THEN THE SYSTEM SHALL
   require an explicit update call on the affected row(s) rather than automatically reindexing
   other rows.
5. WHEN two update or delete calls affect the same row concurrently, THE SYSTEM SHALL apply
   last-write-wins semantics without rejecting either call for a version conflict.
6. IF an update call attempts to mark a parent `task_item` as checked (`is_checked = true`) while
   any of its child `task_item` rows within the same component's task document is still unchecked,
   THEN THE SYSTEM SHALL reject the update. This rule governs each component's own internal
   parent/child hierarchy only; it does not consider cross-component dependency edges (see
   Story 16).

### Story 7: Explicitly finalize a pipeline stage

As an AI agent that has finished drafting a stage, I want to call an explicit finalize tool that
enforces both ordering and minimum completeness, so that a stage cannot be marked ready for human
review while thin, incomplete, or out of sequence.

**Rationale:** The user chose an explicit, agent-callable `finalize_stage` tool (Q23) as the
bookend to fine-grained per-row writes, distinct from the human-only approve/deny transition. Both
pipeline ordering (Q31) and minimum content completeness (Q32) are hard-enforced by the API as
deterministic guardrails, independent of whatever the calling agent's own context currently
"believes" is true.

**Acceptance Criteria:**

1. THE SYSTEM SHALL provide a `finalize_stage` tool that transitions a stage's status from
   not-started/in-progress to `in_review`. For the tasks stage, `finalize_stage` operates on a
   single component's task document (transitioning that component's own status), not on a single
   shared status for the tasks stage as a whole (see Story 16).
2. IF an agent attempts to finalize a stage — or, for the tasks stage, a component's task
   document — whose predecessor stage is not yet `approved`, THEN THE SYSTEM SHALL reject the
   finalize call.
3. IF an agent attempts to add a child row whose parent record does not exist, THEN THE SYSTEM
   SHALL reject the write.
4. IF an agent attempts to finalize a stage — or, for the tasks stage, a component's task
   document — that has zero of its required top-level items (e.g. zero user stories, zero task
   items in that component), THEN THE SYSTEM SHALL reject the finalize call.
5. IF an agent attempts to finalize the requirements stage where at least one user story has zero
   acceptance criteria, THEN THE SYSTEM SHALL reject the finalize call.
6. WHEN a finalize call is rejected for an ordering or completeness reason, THE SYSTEM SHALL return
   an error identifying which check failed.

### Story 8: Determine the next actionable pipeline stage

As an AI agent or orchestrator, I want a single tool that tells me the next actionable stage for a
given spec, so that every calling agent gets consistent sequencing without re-deriving the logic
itself.

**Rationale:** The user chose an explicit `get_next_stage` tool (Q25) over leaving each caller to
re-derive "find the first not-approved stage whose predecessor is approved" from raw status
fields.

**Acceptance Criteria:**

1. THE SYSTEM SHALL provide a tool that, given a spec identifier, returns the next actionable stage
   (the first stage that is not yet `approved` and whose predecessor stage, if any, is
   `approved`).
2. WHEN every stage for a spec is already `approved`, THE SYSTEM SHALL indicate that no further
   pipeline stage is actionable.
3. THE SYSTEM SHALL treat a spec's tasks stage as `approved` only once every declared component's
   task document has independently reached `approved`, and as still actionable (not `approved`)
   while any declared component's task document has not yet reached `approved`.
4. WHEN reporting the tasks stage's actionability for a spec, THE SYSTEM SHALL make available which
   of the spec's declared components have not yet reached `in_review` or `approved`, so a calling
   agent knows which component task documents still require drafting or finalizing.

### Story 9: Keep approve/deny a human-only action

As a project maintainer, I want the approve/deny gate excluded from the agent-facing MCP tool
surface entirely, so that agents structurally cannot self-approve their own spec-pipeline work.

**Rationale:** The user chose to exclude approve/deny from the agent-facing MCP tools altogether
(Q20); a human-facing surface for it (CLI, dashboard) is acknowledged as out of scope for this
spec, but the API itself must not expose a callable path for agents to perform that transition.

**Acceptance Criteria:**

1. THE SYSTEM SHALL NOT expose an MCP tool that transitions a stage's status from `in_review` to
   `approved` or from `in_review` back to `in_review`-with-denial.
2. IF an MCP client attempts to invoke a capability equivalent to approve or deny, THEN THE SYSTEM
   SHALL reject the call as an unsupported/unknown tool.
3. THE SYSTEM SHALL treat the tasks stage's approve/deny transition as a single spec-wide human
   action operating over every declared component's task document together, even though each
   component's `finalize_stage` call is independent (see Story 16). IF an MCP client attempts to
   invoke a capability that would approve or deny a single component's task document
   independently of the others, THEN THE SYSTEM SHALL reject the call as an unsupported/unknown
   tool, consistent with criteria 1-2 above.

### Story 10: Render a document for human review

As a human reviewer, I want to retrieve a fully reconstructed markdown document for any spec stage,
so that reviewing a spec doesn't require me to read raw structured/tabular data.

**Rationale:** The user chose to include markdown rendering in the API (Q21), matching the layout
of the prior file-based templates, so a future human-facing approval surface has something
ready-made to display.

**Acceptance Criteria:**

1. THE SYSTEM SHALL provide a capability to render a requirements/design/tasks-equivalent markdown
   document from the structured rows stored for a given spec and stage.
2. WHEN a stage's rendered document is requested, THE SYSTEM SHALL reflect the layout of the
   corresponding prior file-based template for that stage.
3. WHEN a spec's top-level `tasks.md` index document is requested, THE SYSTEM SHALL render each
   declared component together with its current status, the Cross-Component Dependencies, and the
   spec-wide Definition of Done.
4. WHEN a specific component's task document is requested, THE SYSTEM SHALL render that
   component's own Order, Parallel Execution Schema, Task List, and Flags.

### Story 11: Attribute and audit every write

As an auditor or maintainer, I want every mutation attributed to a caller-supplied actor and
recorded in an append-only audit log, so that I can trace which agent or run produced a given
change.

**Rationale:** The user chose a lightweight, caller-supplied actor field on every write (Q26),
recorded into a generic append-only `audit_log` table capturing actor, action, table, row id, and
timestamp for every mutation across the schema (Q27), rather than a per-row
created_by/updated_by column. The actor value must validate against a known-actors registry rather
than accepting arbitrary free text (OQ5), and that registry is kept current automatically by the
server scanning the local subagent-definition files at boot rather than through manual
registration (OQ5b, OQ5c).

**Acceptance Criteria:**

1. THE SYSTEM SHALL require every write (add/update/delete/finalize) to carry a caller-supplied
   actor/attribution value.
2. WHEN any row is inserted, updated, or deleted across the schema, THE SYSTEM SHALL record an
   entry in an append-only audit log capturing the actor, action, affected table, affected row
   identifier, and timestamp.
3. THE SYSTEM SHALL NOT overwrite or delete existing audit log entries as part of normal write
   operations.
4. IF a write's actor value does not match an entry in the known-actors registry, THEN THE SYSTEM
   SHALL reject the write.
5. WHEN the server starts, THE SYSTEM SHALL scan `spec-templates/agents/*.md` (and Pi's equivalent
   agent-definition directory, if one exists) and upsert each discovered agent name into the
   known-actors registry, so the registry stays current without any manual registration step.

### Story 12: Reject non-compliant spec content deterministically

As a project maintainer, I want the API itself to reject spec content that fails basic
content-quality rules, so that spec quality does not silently degrade purely because a calling
agent's context has grown large and its instruction-following has degraded.

**Rationale:** The user confirmed (Q30) that the underlying goal behind API-layer semantic
validation (Q10) is a deterministic backstop against agents failing to correctly follow brittle,
prose-based `agent.md`-style instructions as their context grows — not merely a structural/typing
check. Fine-grained per-row writes (Q22/Q24) let each violation be rejected individually with
item-level feedback. The confirmed baseline rule set (OQ3) is grounded directly in the project's
own existing requirements/design/tasks templates rather than invented from scratch; design stage
may add further granular rules as implementation details emerge, but the criteria below are the
confirmed minimum.

**Acceptance Criteria:**

1. WHEN a write tool receives content for a field that requires a measurable, testable statement
   (e.g. an acceptance criterion or a non-functional requirement), THE SYSTEM SHALL reject the
   write if the content does not follow an EARS clause pattern.
2. IF a write tool receives an empty or whitespace-only value for a field that is required to be
   meaningful content, THEN THE SYSTEM SHALL reject the write.
3. WHEN a write is rejected for failing semantic/content validation, THE SYSTEM SHALL return an
   error that identifies the specific rule that failed, distinct from a generic/opaque failure.
4. THE SYSTEM SHALL apply semantic/content validation in addition to, not instead of, any
   structural database constraints (types, enums, required columns).
5. IF a write tool receives an empty or whitespace-only value for `user_story.role`,
   `user_story.capability`, `user_story.benefit`, or `user_story.rationale`, THEN THE SYSTEM SHALL
   reject the write.
6. WHEN a write tool receives an `acceptance_criterion.full_text` value alongside a declared
   `ears_pattern`, THE SYSTEM SHALL reject the write if the text does not structurally match that
   pattern (e.g. containing SHALL together with the pattern's implied WHEN/IF/WHILE/WHERE keyword).
7. IF an acceptance criterion or non-functional statement uses an unquantified quality adjective
   (e.g. "fast," "scalable," "reliable," "performant") without an accompanying number and unit,
   THEN THE SYSTEM SHALL reject the write.
8. IF a write tool receives an empty or whitespace-only value for `design_traceability.addressed_by`
   or `design_data_model_entries.content`, THEN THE SYSTEM SHALL reject the write.
9. IF a write tool receives an empty or whitespace-only value for a `task_items.traceability`,
   `task_items.acceptance_check`, or `task_items.description` field within any component's task
   document, THEN THE SYSTEM SHALL reject the write.
10. IF an agent attempts to finalize a component's task document while any top-level task item
    within that component has zero associated `task_files_touched` entries, THEN THE SYSTEM SHALL
    reject the finalize call.

### Story 13: Boot against a fresh or existing database without manual migration steps

As an operator starting the server, I want the schema applied idempotently on every boot, so that
a fresh database works immediately without a separate manual bootstrap step, and bundled default
content is seeded without clobbering existing customizations.

**Rationale:** The user chose a big-bang schema approach with no incremental migration discipline
(Q18), dropping the migration runner/migrations-directory concept entirely in favor of the server
self-applying an idempotent schema on every startup (Q18b, Q19). Bundled/global default
prompts/agents are seeded into the database (Q4) using seed-if-absent logic that never overwrites
an existing row, tracking an origin marker (bundled vs. user) per row for a future "reset to
default" action (Q5).

**Acceptance Criteria:**

1. WHEN the server starts, THE SYSTEM SHALL apply its schema against the configured database using
   idempotent statements (e.g. create-if-not-exists) rather than a versioned migration history.
2. THE SYSTEM SHALL NOT require a separate, manual schema-application step before the server can
   run against a fresh database.
3. WHEN the server starts and a bundled default prompt/agent/workflow row is already present,
   THE SYSTEM SHALL leave the existing row unmodified rather than overwriting it.
4. WHEN the server starts and a bundled default row is absent, THE SYSTEM SHALL insert it.
5. THE SYSTEM SHALL record an origin marker (bundled or user) on every prompt/agent/workflow row
   so that a future explicit "reset to default" action can be built on top of it.

### Story 14: Meet baseline performance and capacity thresholds

As an operator running the MCP/API layer for a project, I want the service to meet concrete
latency and concurrency thresholds, so that the deterministic guardrails this feature adds do not
themselves become a bottleneck for a small internal-tool-scale deployment.

**Rationale:** `decisions.md` originally established no measurable NFR thresholds for the MCP/API
layer, which the requirements template requires for any non-functional criterion. The user
subsequently adopted concrete, deliberately modest placeholder thresholds (OQ1) rather than
leaving them unspecified for the design stage. Because `audit_log` is uncapped by design (see
criterion 4), no retention/pruning policy is needed at this stage (OQ4) — this is a resolved
non-issue, not a remaining gap.

**Acceptance Criteria:**

1. WHILE the system is operating under normal conditions, THE SYSTEM SHALL respond to read
   operations (e.g. `get_*` tools) within a p95 latency of 500 milliseconds.
2. WHILE the system is operating under normal conditions, THE SYSTEM SHALL respond to write
   operations (e.g. `add_*`/`update_*`/`delete_*`/`finalize_stage` tools, including semantic
   validation) within a p95 latency of 1 second.
3. THE SYSTEM SHALL support at least 20 concurrent MCP sessions per project without degrading
   below the latency thresholds in criteria 1 and 2.
4. THE SYSTEM SHALL NOT impose a hard row-count cap on the `audit_log` table. It is append-only by
   design; the threshold is revisited only if/when it approaches roughly 10 million rows.

### Story 15: Declare components in design and enforce a strict 1:1 mapping to task documents

As a design-drafter agent, I want to declare one or more components in `design.md` and have the
tasks stage mechanically enforce a one-to-one mapping between declared components and task
documents, so that the tasks stage's structure is derived deterministically from design rather than
left to a tasks-drafter's own judgment about how to split work.

**Rationale:** A follow-up grilling session (session `component-task-refinement-strategy`,
summarized as Q33-Q47 in `decisions.md`) resolved that components become a formal design-stage
concept (Q33) with a strict, mechanically-enforceable 1:1 mapping onto task documents (Q34), using
kebab-case slug identifiers matching the existing spec-slug convention plus a separate display name
(Q35). Declaring at least one component is mandatory for every spec with no legacy
single-`tasks.md` fallback (Q45), and component task-document rows are auto-seeded from design's
declared components rather than created via a separate explicit tool (Q46).

**Acceptance Criteria:**

1. THE SYSTEM SHALL require every spec's `design.md` to declare at least one component; there
   SHALL NOT be a legacy code path that permits a spec to proceed with zero declared components.
2. IF an agent attempts to finalize the design stage while zero components have been declared,
   THEN THE SYSTEM SHALL reject the finalize call.
3. THE SYSTEM SHALL require each declared component's identifier to be a kebab-case slug matching
   the pattern `^[a-z0-9]+(-[a-z0-9]+)*$`, the same convention used for spec slugs.
4. THE SYSTEM SHALL store a separate free-text display name for each declared component,
   independent of its kebab-case slug identifier, for use in rendered markdown.
5. WHEN a spec's `design.md` Components section is finalized, THE SYSTEM SHALL automatically
   create exactly one task document per declared component, each initialized with a status of
   `not_started`.
6. THE SYSTEM SHALL NOT expose or require a separate MCP tool to explicitly create a component's
   task document; auto-seeding on design finalization is the only creation path.
7. THE SYSTEM SHALL enforce a strict one-to-one mapping between a spec's declared components and
   its task documents: exactly one task document per declared component, with no merging of two
   components into one task document and no splitting of one component across multiple task
   documents.

### Story 16: Track cross-component task dependencies and finalize/approve components independently

As a tasks-drafter agent or orchestrator, I want to declare blocking dependency edges between task
items that live in different components' task documents, and have each component's task document
finalize independently while the human review gate still waits for every component to be ready, so
that cross-component execution order is explicit without disturbing any single component's own
internal sequencing.

**Rationale:** The same follow-up grilling session resolved that cross-component ordering is
tracked at individual-task-item granularity (Q36) via a dependency-edge mechanism restricted to
connecting different components only (Q37), with cycle detection deferred to `finalize_stage` time
rather than performed on every edge add (Q38). Each component's task document carries its own
independent status and finalize lifecycle (Q39), while the human-only approve/deny action for the
tasks stage remains a single spec-wide action (Q40) that only becomes eligible once every declared
component has independently reached `in_review` (Q41). The Definition of Done becomes a single
spec-wide checklist (Q42), while Flags remain scoped per-component, unchanged in shape (Q43). A
top-level `tasks.md` index is still rendered spec-wide alongside each component's own task document
(Q44).

**Acceptance Criteria:**

1. THE SYSTEM SHALL provide a tool to add a dependency edge between two `task_items` belonging to
   two different components' task documents, additive to each component's own existing internal
   Order and Parallel Execution Schema (which continue to govern intra-component sequencing only).
2. IF an agent attempts to add a dependency edge where both endpoint `task_items` resolve to the
   same component's task document, THEN THE SYSTEM SHALL reject the write.
3. THE SYSTEM SHALL NOT perform cycle detection when an individual dependency edge is added.
4. WHEN an agent calls `finalize_stage` for a component's task document, THE SYSTEM SHALL run a
   cycle-detection check across the full cross-component dependency graph (all edges added so far,
   across all of the spec's components) and reject the finalize call if a cycle exists.
5. THE SYSTEM SHALL maintain an independent status and `finalize_stage` lifecycle for each
   component's task document, rather than a single shared status for the tasks stage as a whole.
6. THE SYSTEM SHALL make the human-only spec-wide approve/deny action for the tasks stage eligible
   only once every declared component's task document has independently reached `in_review` via
   its own `finalize_stage` call.
7. WHEN a human approves the tasks stage, THE SYSTEM SHALL transition every `in_review` component
   task document to `approved` together as a single action.
8. WHEN a human denies the tasks stage, THE SYSTEM SHALL transition every `in_review` component
   task document back to a drafting status together as a single action.
9. THE SYSTEM SHALL maintain the Definition of Done checklist as a single spec-wide list spanning
   all of a spec's components, not owned by or scoped to any individual component's task document.
10. THE SYSTEM SHALL maintain Flags as a per-component list scoped to each component's own task
    document, unchanged in shape from the existing per-row Flags mechanism.

## Non-Goals

- Migrating run workspace artifacts (per-run input files under `.relentless/runs/<runId>/workspace/`
  and the `artifacts_meta` table) into the database. These remain file-based; this is ephemeral
  execution-time material, not authored/versioned spec content (Q2).
- Wiring up or extending the existing gRPC/proto transport (`packages/proto`, `createRpcFacade`).
  This effort delivers DB-backed storage plus an MCP transport only (Q7).
- Rewiring the consuming agents/skills (grilling, requirements-compiler, design-drafter,
  tasks-drafter, spec-implementation-orchestrator, code-implementer, code-reviewer, test-writer) to
  actually call the new MCP tools. That rewiring is explicitly deferred to a separate follow-up
  spec (Q11).
- Per-agent or per-project authentication tokens, and any token revocation/audit trail beyond the
  single shared bearer token per deployment (Q9, Q13).
- Optimistic-concurrency/version checks on update or delete calls. Concurrent writes to the same
  row use last-write-wins semantics with no conflict detection (Q29).
- Building a human-facing approve/deny surface (CLI command, dashboard, or similar). This spec only
  requires that approve/deny is not reachable through the agent-facing MCP tools (Q20); the actual
  human-facing surface is out of scope.
- Any incremental migration tooling or migration history/versioning. The migration runner and
  migrations directory concept are removed outright in favor of one idempotent schema application
  on every boot (Q18b).
- Per-project copies of bundled default prompts/agents/workflows. Bundled defaults remain a single
  shared, project-less layer that individual projects may shadow (Q15).
- An explicit, separate project-provisioning call. Referencing a new project id/slug in any write
  auto-creates that project (Q14).
- Automatic reindexing of ordinals when a new item is inserted at a specific position. Add tools
  are append-only; repositioning is a separate explicit update (Q28).
- De-localizing the Claude Code subagent definition files (`spec-templates/agents/*.md`, e.g.
  design-drafter.md, requirements-compiler.md — "pile (A)"). Claude Code's own subagent-discovery
  mechanism requires these as local files; this is a platform constraint outside this initiative's
  control (Q30).
- Building tooling to import or backfill pre-existing local `.relentless/specs/*.md` (or
  workflow/prompt file) content into the database for projects that already have file-based specs.
  This feature is greenfield; any project adopting it manually re-creates what it needs (OQ2).
- Any in-API bearer token lifecycle management — expiry, rotation, or revocation. The shared token
  is a static, long-lived secret; its only rotation mechanism is manually changing the configured
  environment variable and restarting the server (OQ6).
- Explicit MCP session-resumption/reconnect-state handling. A reconnect is simply a new,
  independent connection to the same project-scoped endpoint; no in-flight session state is
  preserved or needs to be resumed (OQ7).
- Sharing or referencing a single component across multiple specs. A component is declared and
  scoped within one spec's `design.md`; cross-spec component reuse/linking is out of scope (Q33,
  Q35).
- Retroactively migrating any spec whose tasks stage was already drafted under the prior,
  single-unified-`tasks.md` model into the new per-component structure. This amendment governs
  specs entering (or re-entering) the tasks stage going forward; no backfill tooling for
  already-drafted specs is included (Q45, Q47).

## Assumptions / Open Questions

As of the 2026-07-16 update to `decisions.md`, all 7 open questions previously flagged in this
section (OQ1-OQ7, including sub-resolutions OQ5b and OQ5c) have been resolved and incorporated
into the stories above:

- NFR thresholds for the MCP/API layer -> resolved by OQ1, now Story 14, criteria 1-3.
- Audit log retention/pruning policy -> resolved by OQ4 (no hard cap imposed, so no pruning policy
  is needed at this stage) -> Story 14, criterion 4.
- Data-migration path for existing adopting projects -> resolved by OQ2 (greenfield, no import
  tooling) -> Non-Goals.
- Full semantic/content-validation rule set -> resolved by OQ3 (concrete baseline adopted) ->
  Story 12, criteria 5-10, and Story 6, criterion 6.
- Actor field format/convention -> resolved by OQ5/OQ5b/OQ5c (validated known-actors registry,
  auto-synced by scanning local agent-definition files at server boot) -> Story 11, criteria 4-5,
  and Glossary.
- Bearer token rotation/expiry/revocation -> resolved by OQ6 (static long-lived secret, manual
  rotation only) -> Story 5, criterion 7, and Non-Goals.
- MCP session reconnect/resume behavior -> resolved by OQ7 (fresh connection, no resumption
  semantics) -> Story 5, criterion 8, and Non-Goals.

No open questions remain from this round of clarification.

### Amendment (2026-07-16): Component-Scoped Task Files

The `component-task-refinement-strategy` follow-up grilling session resolved 15 further decisions
(Q33-Q47, appended to `decisions.md`) splitting the tasks stage into one task document per
design-declared component. All 15 were fully resolved by the human — no blocking gap required
flagging back here as a genuinely open question. One implementation-level detail was not addressed
by the decisions and is flagged for the design stage's attention:

- **Design.md edited after component auto-seeding:** Q46 establishes that component task documents
  are auto-seeded once when design's Components section is finalized/approved. `decisions.md` does
  not address what happens if `design.md` is later redrafted (e.g. after a deny) with a different
  set of components than what was originally auto-seeded — whether existing task documents for
  removed components are archived/deleted, and whether newly-added components trigger a second
  seeding pass. The design stage should decide this mechanic explicitly.

## Glossary

- **MCP (Model Context Protocol):** The protocol agents use to discover and call tools exposed by
  the remote server built in this feature.
- **Spec-pipeline document:** One of decisions/requirements/design/tasks/status for a given spec,
  previously stored as local markdown/JSON files under `.relentless/specs/<slug>/`.
- **Pipeline stage:** One of `requirements`, `design`, or `tasks` within a spec, each with a status
  of `not_started`, `in_review`, or `approved`.
- **`finalize_stage`:** The agent-callable tool that transitions a stage from drafting to
  `in_review`, distinct from the human-only approve/deny transition to `approved`.
- **`get_next_stage`:** The tool that returns the next actionable stage for a given spec.
- **Bundled default:** A project-less prompt/agent/workflow row shipped with the package, acting as
  a shared read-only fallback for every project unless shadowed by a project-scoped row of the
  same id.
- **Origin marker:** A per-row flag (`bundled` or `user`) recording whether a prompt/agent/workflow
  row originated from the shipped defaults or was authored/edited by a project, used to protect
  bundled rows from being silently overwritten on re-seed.
- **Project-scoped connection:** An MCP session bound to exactly one project (via a project-scoped
  endpoint) for its entire lifetime, as opposed to a project identifier passed per call.
- **Actor/attribution field:** A lightweight, caller-supplied string identifying which agent or run
  performed a given write, independent of the shared bearer token. Must match an entry in the
  known-actors registry.
- **Known-actors registry:** The server-maintained list of valid actor/attribution values. It is
  auto-synced at server boot by scanning `spec-templates/agents/*.md` (and Pi's equivalent
  agent-definition directory, if one exists) and upserting each discovered agent name; writes with
  an actor value not present in this registry are rejected.
- **`audit_log`:** The append-only table recording every mutation's actor, action, affected table,
  affected row id, and timestamp.
- **Pile (A) / Pile (B) agent definitions:** Two distinct file-based agent/prompt piles identified
  during grilling — (A) the Claude Code subagent definitions that build specs
  (`spec-templates/agents/*.md`), which remain local due to a Claude Code platform constraint; and
  (B) the workflow engine's own internal prompt/agent template library (`.relentless/agents/`,
  `.relentless/prompts/` + bundled equivalents), which this feature migrates into the database.
- **Run workspace artifacts:** Per-run execution-time input files under
  `.relentless/runs/<runId>/workspace/`, explicitly out of scope for this migration.
- **Component:** A design-declared unit of a spec (a kebab-case slug identifier plus a separate
  free-text display name) that the tasks stage must map onto one-to-one — exactly one task
  document per declared component. Every spec must declare at least one component; there is no
  legacy no-component code path.
- **Component task document (`{component}-tasks.md`):** The per-component task document produced
  during the tasks stage, containing that component's own Order, Parallel Execution Schema, Task
  List, and Flags, with its own independent status and `finalize_stage` lifecycle.
- **Cross-component dependency edge:** A task-level blocking relationship between two `task_items`
  belonging to two different components' task documents, additive to (not a replacement for) each
  component's own internal Order and Parallel Execution Schema. Edges connecting two `task_items`
  in the same component are rejected. Cycle detection across the full edge graph runs only at
  `finalize_stage` time, never on individual edge adds.
- **Top-level `tasks.md` index:** The spec-wide rendered document that lists every declared
  component and its current status, the Cross-Component Dependencies, and the spec-wide Definition
  of Done — distinct from each component's own `{component}-tasks.md` document.
- **Spec-wide Definition of Done:** The single Definition of Done checklist spanning all of a
  spec's components, owned at the spec level rather than by any individual component's task
  document.
