# Grilling Session: api-driven-spec-guarding

- Session name: api-driven-spec-guarding
- Start date: 2026-07-16T02:25:38.454086+00:00
- Last updated date: 2026-07-16T03:00:00.000000+00:00
- Status: complete

## Initial Prompt

```text
/grilling I just added the @relentless/spec-templates/spec/db/schema.sql file for context for a new implementation I want for the relentless application. 

 I want to replace all of the logic in relentless that uses actual files to instead use this new consolidated database design. This will include creating an MCP/API layer that future agents will integrate with. 

The overall goal is to completely remove the need for specs to be on the local machine. Instead, specs will be guarded by the API. 

This also gives us the flexibility to now add very concrete rules to our spec generation process. No more relying on flaky steering documents or agent.md's when building specs. just clean cut every time
```

## Decisions

_Record resolved questions and decisions here as the interview progresses._

### Q1: Scope — spec-pipeline only, or also the workflow-engine product's own file usage?

**Proposed Solutions:**
- A. Spec-pipeline only (Recommended) — migrate decisions.md/requirements.md/design.md/tasks.md/status.json + the grilling/compiler/drafter/orchestrator agents to DB+API. Workflow-engine's own YAML file usage in packages/server/src/rpc and packages/library is untouched — different concern.
- B. Broader scope — also include the workflow-engine's own file-based logic (YAML workflow definitions written/read by packages/server/src/rpc and packages/library).

**Raw user response:** "Broader scope"

**User selected solution:** B — Broader scope. Both the spec-pipeline meta-tooling AND the workflow-engine's own file-based logic (YAML workflow defs in packages/server/src/rpc, packages/library) are in scope for migration to DB + MCP/API.

### Q2: Which file-based subsystems are actually in scope?

Explored the codebase and found four distinct file-based subsystems:
1. Spec-pipeline docs (decisions/requirements/design/tasks/status under .relentless/specs/<slug>/)
2. Workflow definitions (YAML under .relentless/workflows/ and packages/library/bundled/global/workflows/, read/written by packages/server/src/rpc/index.ts; dormant unused `workflows`/`workflow_snapshots` tables already exist in persistence/migrations/001_init.sql)
3. Prompts/agents (markdown under .relentless/agents/, .relentless/prompts/ + bundled equivalents — the "flaky agent.md" system)
4. Run workspace artifacts (per-run input files under .relentless/runs/<runId>/workspace/, plus artifacts_meta table storing a file path + content_hash rather than content itself)

**Proposed Solutions:**
- Recommended: subsystems 1, 2, 3 in scope (specs, workflows, prompts/agents — all authored/versioned definitional documents that should be DB-governed and API-guarded). Subsystem 4 (run workspace artifacts) stays as files — ephemeral execution-time materials for a running workflow instance, not authored specs; forcing run working files into Postgres rows is a different problem (blob storage, size limits) outside this initiative.
- Alternative: some other combination.

**Raw user response:** "Your recommendation here works."

**User selected solution:** Recommended — subsystems 1 (specs), 2 (workflows), 3 (prompts/agents) are in scope for migration to DB + MCP/API. Subsystem 4 (run workspace artifacts) remains file-based, out of scope.

### Q3: Workflow definitions storage — reuse existing dormant tables or design new ones?

**Proposed Solutions:**
- Recommended: Reuse existing `workflows`/`workflow_snapshots` tables (already in persistence/migrations/001_init.sql but currently unused) — wire packages/server/src/rpc/index.ts to read/write them instead of .relentless/workflows/*.yaml files, extending columns as needed.
- Alternative: Design fresh tables purpose-built for the new approach, leaving/deprecating the existing tables.

**Raw user response:** "Reuse existing tables (Recommended)"

**User selected solution:** Reuse and extend the existing `workflows`/`workflow_snapshots` tables as the source of truth for workflow definitions.

### Q4: Bundled/global default library assets — files shipped in package, or seeded into DB?

**Proposed Solutions:**
- Recommended: Keep bundled defaults as files shipped with the package, loaded server-side and merged with DB-backed project overrides at read time. Agents/clients never touch these files directly — only the server does internally.
- Alternative: Seed bundled defaults into the database (e.g. on first server boot) so every read path — defaults and overrides alike — goes through the DB with no file fallback anywhere.

**Raw user response:** "Seed into DB"

**User selected solution:** Seed bundled/global default assets into the database (e.g. on first server boot) so there is no file fallback anywhere — every read path, defaults and overrides, goes through the DB.

### Q5: Re-seed policy on package upgrade — seed-if-absent, or always overwrite bundled rows?

**Proposed Solutions:**
- Recommended: Seed-if-absent only. Re-seeding inserts new/missing bundled IDs but never overwrites an existing row (customized or not). Track origin (source = bundled/user) enabling a future explicit "reset to default" action.
- Alternative: Always overwrite bundled-sourced rows on upgrade, discarding in-place edits; user edits would need a different ID to survive upgrades.

**Raw user response:** "Seed-if-absent only (Recommended)"

**User selected solution:** Seed-if-absent only, with an origin marker (source = bundled/user) tracked per row so bundled rows are never silently overwritten by re-seeding, and a future explicit "reset to default" action remains possible.

### Context note: existing server is not yet network-exposed

Investigated packages/server further: `startDaemon`/`buildComposition` only build an in-process composition object (engine, runStore, artifactStore, libraryResolver, pool) — there is no actual network listener anywhere. `packages/proto/proto/relentless.proto` and `createRpcFacade` in rpc/index.ts define a facade shape but it is never bound to a gRPC server or any transport. So there is no existing live API to retrofit; the MCP/API layer is being built for the first time.

### Q6: Where does the MCP server live — extend packages/server, or a new standalone package?

**Proposed Solutions:**
- Recommended: Extend the existing packages/server daemon with an MCP transport, reusing the same composition object, DB pool, and config loading already built for the workflow engine.
- Alternative: New standalone package (e.g. packages/mcp-server) with its own process, composition, and DB connection.

**Raw user response:** "Extend packages/server (Recommended)"

**User selected solution:** Extend the existing packages/server daemon with a new MCP transport, reusing the same composition/DB pool/config loading rather than standing up a separate process.

### Q7: Should this initiative also wire up the existing gRPC/proto transport?

**Proposed Solutions:**
- Recommended: Out of scope. Leave the gRPC/proto plan as untouched scaffolding for a separate future effort; this initiative delivers DB storage + MCP tools for agents only.
- Alternative: Also finally network-bind the gRPC transport and extend the proto to cover specs, as part of this same initiative.

**Raw user response:** "Out of scope (Recommended)"

**User selected solution:** gRPC/proto wiring is out of scope for this initiative. This effort delivers DB-backed storage + an MCP transport for agents only.

### Q8: MCP transport — HTTP/SSE remote, or local stdio?

**Proposed Solutions:**
- Recommended: HTTP/SSE remote. MCP server is a long-running network service; agents connect over HTTP/SSE from anywhere; only the server holds the Postgres connection. Actually satisfies "no specs on the local machine."
- Alternative: Local stdio — MCP server runs as a subprocess spawned locally by the agent's CLI, connecting to local or remote Postgres directly. Still requires a local checkout/process per machine.

**Raw user response:** "HTTP/SSE remote (Recommended)"

**User selected solution:** HTTP/SSE remote transport. The MCP server is a long-running network service; agents connect over HTTP/SSE from anywhere, and only the server itself holds the Postgres connection.

### Q9: Auth model for the remote MCP server

**Proposed Solutions:**
- Recommended: Static bearer token — single shared API-key/bearer token per deployment, configured via env var, checked on every request.
- Alternative: Per-agent tokens with revocation/audit trail.
- Alternative: No auth, rely on network placement (VPC/VPN) only.

**Raw user response:** "Static bearer token (Recommended)"

**User selected solution:** Static bearer token — a single shared API-key/bearer token per deployment, configured via environment variable and checked on every request.

### Q10: Depth of validation — API-layer semantic checks, or DB structural constraints only?

**Proposed Solutions:**
- Recommended: Yes, API-layer semantic checks. Write-tools mechanically check content-quality rules (measurable thresholds, non-empty meaningful fields, EARS clause presence) and reject non-compliant writes with a specific error.
- Alternative: DB structural constraints only (what schema.sql's types/CHECK/enums already cover); content-quality judgment remains the agent's responsibility as today.

**Raw user response:** "Yes, API-layer semantic checks (Recommended)"

**User selected solution:** Yes — MCP write-tools perform semantic/content validation (measurable thresholds, EARS clause presence, non-empty meaningful fields) beyond the DB's structural constraints, rejecting non-compliant writes with a specific error.

### Context note: no existing in-flight specs to migrate

Checked `.relentless/` in the relentless project itself — it is empty (no specs subdirectory yet). So there is no existing markdown-based spec data that needs to be backfilled/migrated into the new schema.

### Q11: Does this initiative include rewriting the consuming agents/skills?

**Proposed Solutions:**
- Recommended: Follow-up spec. This spec delivers the DB schema + MCP server only, independently testable via its own tool contracts. Rewiring grilling/requirements-compiler/design-drafter/tasks-drafter/orchestrator/code-implementer/code-reviewer/test-writer to use it is a separate follow-up spec.
- Alternative: Same spec — bundle rewriting all consuming agent definitions/tool grants into this initiative.

**Raw user response:** "Follow-up spec (Recommended)"

**User selected solution:** Follow-up spec. This spec delivers the DB schema + MCP server only; rewiring the consuming agents (grilling, requirements-compiler, design-drafter, tasks-drafter, spec-implementation-orchestrator, code-implementer, code-reviewer, test-writer) to actually call the MCP tools is separate, future work.

### Q12: Single-project or multi-project server?

**Proposed Solutions:**
- Recommended: Single-project per deployment. One server instance = one project's specs/workflows/prompts, matching the provided schema.sql (no tenant/project column anywhere). Stand up a new instance per project if ever needed.
- Alternative: Multi-project from the start — add a project/workspace_id scoping column across specs, workflows, and prompts tables so one deployment can isolate data for multiple projects.

**Raw user response:** "Multi-project from the start"

**User selected solution:** Multi-project from the start. One MCP server deployment must serve multiple distinct projects/codebases with isolated data — a project/workspace scoping concept is needed across specs, workflows, and prompts tables (schema.sql as given will need a project/workspace_id column threaded through, since it currently has none).

### Q13: Auth scoping — per-project tokens, or single shared token?

**Proposed Solutions:**
- Recommended: Per-project tokens. Each project gets its own bearer token; server checks the token against the project_id in the request. A caller with one project's token cannot read/write another project's data.
- Alternative: Single shared token across all projects (per Q9) — data isolation exists in the schema/queries, but any authenticated caller can address any project_id.

**Raw user response:** "Single shared token"

**User selected solution:** Single shared token across all projects. Data isolation exists at the schema/query level (via project_id scoping), but auth itself is not per-project — any caller holding the shared token can address any project_id.

### Q14: Project provisioning — explicit creation, or implicit on first write?

**Proposed Solutions:**
- Recommended: Explicit creation only. A projects table exists; a project must be created via a dedicated call before anything can be written under it.
- Alternative: Implicit creation on first write — referencing a new project id/slug in any write auto-creates that project row.

**Raw user response:** "Implicit creation on first write"

**User selected solution:** Implicit creation on first write. Referencing a new project id/slug in any write (creating a spec, workflow, prompt, etc.) auto-creates that project row on the fly; no separate provisioning call required.

### Q15: Bundled defaults — one shared layer, or per-project copy?

**Proposed Solutions:**
- Recommended: One shared layer. Bundled defaults are project-less rows (no project_id), read-only fallback for every project. A project can shadow a default by creating its own project-scoped row with the same id.
- Alternative: Per-project copy — each new project gets its own independent copy of every bundled default seeded at creation time.

**Raw user response:** "One shared layer (Recommended)"

**User selected solution:** One shared layer. Bundled defaults remain project-less rows acting as a read-only fallback for every project; Q5's seed-if-absent logic runs once globally, not per-project. A project may shadow a default with its own project-scoped row sharing the same id.

### Q16: How is a request's project identified — connection-bound, or explicit param per call?

**Proposed Solutions:**
- Recommended: Project-scoped connection. Each project gets its own endpoint (e.g. /mcp/<project-slug>); a session is bound to one project for its lifetime.
- Alternative: Explicit param per call — every tool call takes a project_id/slug parameter; one connection can address multiple projects.

**Raw user response:** "Project-scoped connection (Recommended)"

**User selected solution:** Project-scoped connection. Each project gets its own MCP endpoint (e.g. /mcp/<project-slug>); a session is bound to one project for its entire lifetime, and tool schemas do not carry a project_id parameter.

### Q17: Version history for prompts/agents?

**Proposed Solutions:**
- Recommended: Version history — add a snapshot table for prompts/agents mirroring workflow_snapshots, so past versions are recoverable and auditable.
- Alternative: Overwrite-only — prompts/agents have just a current row; updates discard prior content with no history.

**Raw user response:** "Version history (Recommended)"

**User selected solution:** Version history. Prompts/agents get a snapshot/version-history table mirroring workflow_snapshots, so past versions are recoverable and it is auditable which prompt version produced a given spec.

### Q18: Where does the schema live and how is it applied?

**Proposed Solutions:**
- Recommended: Fold into existing migrations — split schema.sql into new numbered files under packages/persistence/migrations, applied by the existing applyMigrations() runner.
- Alternative: Separate schema-application path, decoupled from packages/persistence's migration runner.

**Raw user response:** "big bang deployment here. no need to deal with migrations"

**User selected solution:** Big-bang deployment — no incremental migration discipline needed (pre-production, no existing data/users to preserve compatibility for). Needs a follow-up on mechanics: single consolidated schema file vs. dropping the migration runner entirely.

### Q18b: Big-bang mechanics — keep applyMigrations() as one file, or drop the runner entirely?

**Proposed Solutions:**
- Recommended: One consolidated migration file — rewrite/replace packages/persistence/migrations/001_init.sql as the complete current-state schema (runs/workflows + spec_pipeline + prompts), still applied via the existing applyMigrations() runner on boot.
- Alternative: Drop the migration runner entirely — remove applyMigrations()/the migrations directory concept; apply schema.sql directly (e.g. via psql) as a one-time step, no migration tooling going forward.

**Raw user response:** "Drop the migration runner"

**User selected solution:** Drop the migration runner. Remove applyMigrations() and the packages/persistence/migrations directory concept entirely; schema.sql is applied directly (e.g. via psql) as a one-time step, with no migration tooling involved going forward. (Follow-up needed: does the server still self-bootstrap schema on boot at all, or is schema setup now fully external to the server process?)

### Q19: Does the server still self-bootstrap schema on boot?

**Proposed Solutions:**
- Recommended: Self-apply on boot, idempotently — server runs schema.sql (CREATE TABLE/SCHEMA IF NOT EXISTS style) against the configured Postgres on every startup, so a fresh database just works without a separate manual step.
- Alternative: Fully external — server assumes schema.sql was already applied externally; it just connects and errors if expected tables are missing.

**Raw user response:** "Self-apply on boot, idempotently (Recommended)"

**User selected solution:** Self-apply on boot, idempotently. The server runs schema.sql (idempotent CREATE TABLE/SCHEMA IF NOT EXISTS style) against the configured Postgres on every startup — no migration history/versioning, but a fresh database works immediately without a separate manual bootstrap step.

### Q20: Who can call the approve/deny gate?

**Proposed Solutions:**
- Recommended: Exclude from MCP — approve/deny is not callable via the agent-facing MCP tools at all; needs a separate human-facing surface (CLI command, small dashboard) not built in this spec. The schema/API must not let agents self-approve.
- Alternative: Expose as an MCP tool too — approve/deny exists as a normal MCP tool; enforcement that only humans use it is a trust/process convention, not a structural one.

**Raw user response:** "Exclude from MCP (Recommended)"

**User selected solution:** Exclude approve/deny from the agent-facing MCP tool surface entirely. It is not one of the tools this spec's MCP server exposes to agents — a human-facing surface for it (CLI command, dashboard, etc.) is explicitly out of scope for this spec, but the requirement is that agents cannot call it through the API being built here.

### Q21: Human-readable document rendering — include, or raw structured data only?

**Proposed Solutions:**
- Recommended: Include markdown rendering — API can return a fully reconstructed markdown document (matching the old templates' layout) for any spec/stage.
- Alternative: Raw structured data only — API returns JSON of the rows; reconstructing a document view is left to whatever builds the human-facing surface later.

**Raw user response:** "Include markdown rendering (Recommended)"

**User selected solution:** Include markdown rendering. The API provides a capability to render a full requirements.md/design.md/tasks.md-equivalent document from the structured rows, matching the old templates' layout, so a future human-facing approval surface has something ready-made to display.

### Q22: MCP write granularity — whole-document submission, or fine-grained per-row tools?

**Proposed Solutions:**
- Recommended: Whole-document submission — one atomic call per stage (submit_requirements/submit_design/submit_tasks) replaces all child rows in one transaction, matching the draft-then-submit pattern the current agents use.
- Alternative: Fine-grained per-row tools (add_user_story, add_acceptance_criterion, add_non_goal, ...) called repeatedly to incrementally build a document.

**Raw user response:** "Fine-grained per-row tools"

**User selected solution:** Fine-grained per-row tools. Separate tools per child table (e.g. add_user_story, add_acceptance_criterion, add_non_goal) are called repeatedly by an agent to incrementally build up a document, rather than one atomic whole-document submission per stage. (Note: this pairs naturally with Q10's per-write semantic validation — each atomic add can be validated and rejected individually with specific, item-level feedback, which whole-document submission would make harder to pinpoint.)

### Q23: Explicit stage finalization — agent-callable finalize_stage tool, or implicit transition?

**Proposed Solutions:**
- Recommended: Explicit finalize_stage tool — agent calls finalize_stage(spec_id, stage) once done drafting, flipping status from not_started/in-progress to in_review. Distinct from the human-only approve/deny transition.
- Alternative: Implicit transition — status flips to in_review automatically some other way (e.g. on first row added, or a completeness heuristic), no explicit agent action.

**Raw user response:** "Explicit finalize_stage tool (Recommended)"

**User selected solution:** Explicit finalize_stage tool. The agent calls finalize_stage(spec_id, stage) once it has finished adding rows for that stage, flipping status to in_review. This is the agent-callable bookend to fine-grained per-row writes, and is distinct from the human-only approve/deny transition (in_review -> approved).

### Q24: Editing/redraft mechanics — clean slate, or per-row update/delete tools?

**Proposed Solutions:**
- Recommended: Clean slate on redraft — add_* tools plus one clear_stage/restart_stage tool; a denial means reconsider the document, not patch one field.
- Alternative: Per-row update/delete tools — every table also gets update_* and delete_* tools for targeted corrections without clearing the whole stage.

**Raw user response:** "Per-row update/delete tools"

**User selected solution:** Per-row update/delete tools. Every child table gets update_* and delete_* tools (in addition to add_*), so an agent can make targeted corrections to individual rows — including during redraft-after-deny — without necessarily clearing the whole stage.

### Q25: "What's next" query — explicit get_next_stage tool, or raw status query only?

**Proposed Solutions:**
- Recommended: Explicit tool — get_next_stage(spec_id) encapsulates "find the first not-approved stage whose predecessor is approved" server-side, so every calling agent gets consistent sequencing.
- Alternative: Raw status query only — agents call a tool returning each stage's raw status and re-derive "what's next" themselves.

**Raw user response:** "Explicit tool (Recommended)"

**User selected solution:** Explicit tool. The API exposes get_next_stage(spec_id) (or equivalently get_pipeline_status), encapsulating the "find the next actionable stage" sequencing logic server-side rather than leaving each calling agent to re-derive it.

### Q26: Change attribution/audit — lightweight actor field, or none?

**Proposed Solutions:**
- Recommended: Yes, lightweight actor field — writes carry a simple caller-supplied actor string (e.g. agent name or run id), independent of the shared auth token.
- Alternative: No attribution needed — writes are anonymous beyond the shared per-project token.

**Raw user response:** "Yes, lightweight actor field (Recommended)"

**User selected solution:** Yes. Every write carries a lightweight caller-supplied actor/attribution field (e.g. agent name or run id), independent of the shared auth token, so changes are traceable to a specific agent/run.

### Q27: Attribution storage — generic audit_log table, or per-row column?

**Proposed Solutions:**
- Recommended: Generic audit_log table — one append-only table capturing every mutation (actor, action, table, row id, timestamp) across the whole schema.
- Alternative: Per-row column — created_by/updated_by column added to every table; only shows the latest editor, not full history.

**Raw user response:** "Generic audit_log table (Recommended)"

**User selected solution:** Generic audit_log table. A separate append-only audit_log table captures every mutation (actor, action, table, row id, timestamp) across the whole schema, rather than adding a column to every individual table.

### Q28: Ordinal/ordering management — append-only, or auto-reindex on insert?

**Proposed Solutions:**
- Recommended: Append-only — add_* tools always place new items at the end of their sequence; repositioning requires explicit update calls on affected rows.
- Alternative: Auto-reindex on insert — add_* tools accept a target position and automatically shift existing ordinals to make room.

**Raw user response:** "Append-only (Recommended)"

**User selected solution:** Append-only. add_* tools always place new items at the end of their sequence (highest ordinal + 1); if an agent needs to reposition items, it does so via explicit update calls on the affected rows rather than the API silently reindexing anything.

### Q29: Concurrent update/delete conflicts — last-write-wins, or optimistic concurrency checks?

**Proposed Solutions:**
- Recommended: Last-write-wins — no version checks; parallel batches are designed so concurrent agents touch different rows in the first place.
- Alternative: Optimistic concurrency checks — updates/deletes require passing the expected current version, rejected with a conflict error if the row changed since.

**Raw user response:** "Last-write-wins (Recommended)"

**User selected solution:** Last-write-wins. No optimistic-concurrency/version checks on update_*/delete_* tools; the system relies on parallel batches already being designed to have concurrent agents touch different rows rather than guarding against same-row collisions.

### Q30: Which "agent.md" did the original brittleness complaint refer to — (A) spec-building subagent defs, or (B) engine's internal prompt library?

Explained to the user that two distinct piles of agent/prompt markdown exist:
- (A) `spec-templates/agents/*.md` (design-drafter.md, requirements-compiler.md, etc.) — the Claude Code subagent definitions that build specs. These cannot be fully de-localized: Claude Code's own subagent-discovery mechanism requires local files, a platform constraint outside relentless's control.
- (B) `.relentless/agents/`, `.relentless/prompts/` + bundled equivalents — the workflow engine's own internal prompt/agent template library, consumed by ClaudeExecutor/PiExecutor when a user-authored relentless workflow runs an AI-agent step. Unrelated to spec-building; this is what Q1/Q2 already scoped into the DB migration.

**Raw user response:** "I meant both. But I moreso meant that the rules we define in the agents.md file can sometimes be brittle. So we're adding deterministic guardrails to make sure its not lost after large contexts."

**Resolution:** The underlying goal is not "eliminate local files for pile (A)" (impossible — Claude Code needs local subagent files to function) but "stop relying solely on an agent correctly following pile (A)'s prose instructions, especially as its context grows large and instruction-following degrades." This is already what Q10 (API-layer semantic validation), Q22/Q24 (fine-grained per-row tools validated individually), and the schema's own structural constraints (enums, CHECK constraints) deliver: the API becomes a deterministic backstop that rejects malformed/incomplete spec content regardless of whether the calling agent's context has degraded. Pile (A) files continue to exist locally as unavoidable Claude Code subagent definitions (rewiring their prompts to call the new MCP tools is the Q11 follow-up spec); pile (B) moves into the DB outright per Q1/Q2. No scope change — this clarifies the "why" behind Q10/Q22/Q24 rather than introducing new decisions.

### Q31: Should the API hard-enforce pipeline ordering, or only guide via get_next_stage?

**Proposed Solutions:**
- Recommended: Hard enforcement — API rejects actions violating pipeline/structural ordering (parent must exist, predecessor stage must be approved before finalizing the next), regardless of what the calling agent's context remembers.
- Alternative: Guidance only — get_next_stage helps a well-behaved agent, but the API does not block out-of-order writes.

**Raw user response:** "Hard enforcement (Recommended)"

**User selected solution:** Hard enforcement. The API rejects out-of-order actions (e.g. finalizing a stage before its predecessor is approved, adding a child row before its parent exists) as a deterministic guardrail, independent of whether the calling agent's context has degraded enough to attempt the wrong action.

### Q32: Should finalize_stage enforce minimum completeness, or ordering only?

**Proposed Solutions:**
- Recommended: Yes, minimum completeness — finalize_stage rejects structurally-empty content (zero user stories, a story with zero acceptance criteria, zero task items) even if ordering is correct.
- Alternative: Ordering only — finalize_stage only checks stage sequencing (Q31); content completeness is entirely the agent's judgment.

**Raw user response:** "Yes, minimum completeness (Recommended)"

**User selected solution:** Yes. finalize_stage enforces minimum completeness rules (e.g. at least one user story, at least one acceptance criterion per story, at least one task item) in addition to Q31's ordering checks, rejecting thin/incomplete drafts that ordering enforcement alone would miss.

## Open-Question Follow-Up (post-compilation)

requirements-compiler flagged several open questions rather than inventing answers. Resolving them here.

### OQ1: NFR thresholds for the MCP/API layer

**Proposed Solutions:**
- Recommended: Adopt placeholder defaults — p95 < 500ms for reads, < 1s for writes; at least 20 concurrent MCP sessions per project without degradation; audit_log uncapped (revisit at ~10M rows).
- Alternative: Different numbers.
- Alternative: Leave unspecified for design stage.

**Raw user response:** "Adopt proposed defaults (Recommended)"

**User selected solution:** Adopt placeholder NFR thresholds: p95 request latency < 500ms for reads and < 1s for writes (including semantic validation); at least 20 concurrent MCP sessions per project without degradation; audit_log has no hard cap (append-only by design, revisit at ~10M rows). These are deliberately modest, non-architecture-defining placeholders for a small internal-tool-scale service.

### OQ2: Data-migration path for existing adopting projects

**Proposed Solutions:**
- Recommended: Greenfield, no import tool — no tooling to backfill pre-existing local spec files into the database, consistent with the big-bang schema decision (Q18).
- Alternative: Build a one-time import/backfill tool.

**Raw user response:** "Greenfield, no import tool (Recommended)"

**User selected solution:** Greenfield, no import tool. This initiative includes no tooling to import/backfill pre-existing local `.relentless/specs/*.md` content into the database; any project with old local specs manually re-creates what it needs.

### OQ3: Enumerating the semantic-validation rule set

Read the actual templates (requirements.template.md, design.template.md, tasks.template.md) to ground a concrete baseline rule list in the project's own existing rules.

**Proposed Solutions:**
- Recommended: Adopt this baseline —
  - Requirements: user_story role/capability/benefit/rationale each non-empty; acceptance_criterion full_text must structurally match its declared ears_pattern (contains SHALL + the implied WHEN/IF/WHILE/WHERE keyword); criteria with unquantified quality adjectives (fast/scalable/reliable/performant) without a number+unit are rejected.
  - Design: design_traceability.addressed_by non-empty; design_data_model_entries.content non-empty.
  - Tasks: task_items.traceability/.acceptance_check/.description each non-empty; every top-level task requires at least one task_files_touched entry; a parent task_item cannot be marked is_checked=true while any child task_item is unchecked (directly from the template's own stated rule).
- Alternative: Defer entirely to design stage.

**Raw user response:** "Adopt this baseline (Recommended)"

**User selected solution:** Adopt the baseline rule list above as requirements-level semantic validation rules. Design stage may add more granular rules as implementation details emerge, but this baseline is the confirmed minimum.

### OQ5: Actor field format — free text, or validated registry?

**Proposed Solutions:**
- Recommended: Free text, non-empty only — any non-empty string accepted, no registry to maintain.
- Alternative: Validated registry — actor value must match a known, maintained list of agent names.

**Raw user response:** "Validated registry"

**User selected solution:** Validated registry. The actor field must match a known, maintained registry of agent names rather than accepting arbitrary free text.

### OQ5b: How is the actor registry populated/maintained?

**Proposed Solutions:**
- Recommended: Dynamic table — a known_actors table growable via an API call as new agent types are created, no schema change needed.
- Alternative: Fixed enum in the schema — adding a new agent type requires a schema change.

**Raw user response:** "Is there a way that we can scan for what agents are available/configured in claude/pi and keep that up to date?"

**Resolution:** Neither manual registration nor a fixed enum — the registry should be auto-synced by scanning the actual configured subagent definitions. Investigated packages/executors/src/index.ts: ClaudeExecutor spawns the `claude` CLI directly; PiExecutor dynamically imports `@earendil-works/pi-coding-agent`; neither exposes a "list configured agents" API in code. The real existing source of truth for agent names relevant to spec-pipeline write attribution is `spec-templates/agents/*.md` (grilling, requirements-compiler, design-drafter, tasks-drafter, spec-implementation-orchestrator, code-implementer, code-reviewer, test-writer) — these are pile (A) agents from Q30, the ones that actually author spec-pipeline documents and need attribution.

### OQ5c: Registry sync mechanics — scan-and-sync at boot, or explicit registration calls?

**Proposed Solutions:**
- Recommended: Scan-and-sync at boot — server reads spec-templates/agents/*.md (and Pi's equivalent directory) at startup, upserting names into the known-actors table, re-scanning periodically/on restart.
- Alternative: Explicit registration calls only — no automatic scanning; new actors added via a register_actor API call.

**Raw user response:** "Scan-and-sync at boot (Recommended)"

**User selected solution:** Scan-and-sync at boot. The server scans the local spec-templates/agents/*.md directory (and Pi's equivalent, if one exists) at startup, upserting discovered agent names into the known-actors table, keeping the registry synced with whatever subagents actually exist without any manual registration step. This is consistent with the server already needing local filesystem access for other things (e.g. bundled defaults, Q4); the Q8 constraint was that calling agents don't need a local checkout, not that the server itself is filesystem-free.

### OQ6: Bearer token lifecycle — static secret with manual rotation, or built-in expiry/rotation mechanics?

**Proposed Solutions:**
- Recommended: Static secret, manual rotation — token is a long-lived env var value; rotating means changing the env var and restarting the server, no in-API expiry/refresh/revocation.
- Alternative: Built-in lifecycle management (expiry and/or rotation/revocation flow).

**Raw user response:** "Static secret, manual rotation (Recommended)"

**User selected solution:** Static secret, manual rotation only. The bearer token is a long-lived value configured via environment variable; rotation is an operational process (change the env var, restart the server), with no in-API expiry, refresh, or revocation mechanism.

### OQ7: MCP connection lifecycle on disconnect/reconnect

**Proposed Solutions:**
- Recommended: No special resumption needed — a reconnect is just a new HTTP/SSE connection to the same project endpoint with the same token; no in-flight state to resume since every write is already atomic and self-contained.
- Alternative: Build explicit session-resumption handling.

**Raw user response:** "No special resumption needed (Recommended)"

**User selected solution:** No special resumption semantics. A reconnect is simply a fresh HTTP/SSE connection to the same project-scoped endpoint, re-presenting the same bearer token. No session state is preserved or needs to be resumed, since every MCP tool call (add/update/delete/finalize) is already an atomic, self-contained operation against current DB state.

## Open-question follow-up: status

All 7 open questions flagged by requirements-compiler have now been resolved (OQ1-OQ7, including sub-resolutions OQ5b/OQ5c). Ready for requirements.md to be updated to reflect these resolutions and re-submitted for approve/deny.

## Amendment: Component-Scoped Task Files (session: component-task-refinement-strategy, 2026-07-16)

Design change: `tasks.md` is being split into one `{component}-tasks.md` per
design-declared component, with a mechanism to track cross-component execution order in
both parallel and single-threaded modes. Resolved via a dedicated follow-up grilling
session; full raw Q&A lives at
`.relentless/sessions/component-task-refinement-strategy/decisions.md`. Summarized and
renumbered here (continuing from Q32/OQ7) so this file remains the single canonical
decisions log for requirements-compiler.

### Q33: Where does a spec's list of "components" get declared?

**Proposed Solutions:**
- Recommended: Tasks-stage only — tasks-drafter identifies components itself from design.md + codebase when drafting tasks.md; requirements/design stages untouched.
- Alternative: Formal design-stage concept — design.md gains a new "Components" section/table declaring components up front; tasks stage must produce one task file per declared component.

**Raw user response:** "Formal design-stage concept"

**User selected solution:** Formal design-stage concept. design.md gains a new "Components" section (and corresponding schema table, e.g. `design_components`), and the tasks stage must produce task files that conform to what was declared there.

### Q34: Must tasks stage map 1:1 to design-declared components, or can tasks-drafter deviate?

**Proposed Solutions:**
- Recommended: Strict 1:1 — every design-declared targeted component gets exactly one `{component}-tasks.md`, mechanically enforceable.
- Alternative: Tasks-drafter can deviate — design.md's list is a strong suggestion only.

**Raw user response:** "Strict 1:1 (recommended)"

**User selected solution:** Strict 1:1 mapping. Every targeted component declared in design.md gets exactly one task file; no merging/splitting at tasks-drafting time. Mechanically enforceable at the API level (e.g. via a completeness/finalize check).

### Q35: What format should a component identifier take?

**Proposed Solutions:**
- Recommended: Kebab-case slug — same constraint as `specs.slug` (`^[a-z0-9]+(-[a-z0-9]+)*$`), used as DB key and filename; separate free-text display-name column for prose.
- Alternative: Free-form text — needs sanitizing/slugifying for filenames, risking collisions.

**Raw user response:** "Kebab-case slug (recommended)"

**User selected solution:** Kebab-case slug, matching the existing `specs.slug` convention, plus a separate free-text display-name column for rendered markdown.

### Q36: What granularity should cross-component ordering/parallelism tracking use?

**Proposed Solutions:**
- Recommended: Whole-component granularity — a new spec-level "Component Execution Schema" sequences/parallelizes entire `{component}-tasks.md` files against each other; each component file keeps its own unchanged internal Order/Parallel Execution Schema.
- Alternative: Task-level cross-component granularity — a cross-component dependency graph references individual task IDs across different component files, additive on top of each component's existing internal Order/Parallel Execution Schema.

**Raw user response:** "Task-level cross-component granularity"

**User selected solution:** Task-level cross-component granularity. A new cross-component dependency-edge mechanism references individual task_items across different component task files, additive alongside each component's existing (unchanged) internal Order + Parallel Execution Schema. Lets the orchestrator know precisely which cross-component task pairs block each other, for both single-threaded and parallel execution planning.

### Q37: Should cross-component dependency edges be restricted to connecting different components only?

**Proposed Solutions:**
- Recommended: Cross-component only — reject any edge where both task_items resolve to the same component/tasks_doc; Order/Parallel Execution Schema remains the sole mechanism for intra-component sequencing.
- Alternative: Allow same-component edges too — one unified mechanism, at the cost of two sources of truth that can conflict.

**Raw user response:** "Cross-component only (recommended)"

**User selected solution:** Cross-component only. The new dependency-edge table only permits edges between task_items belonging to two different components/tasks_docs. A DB constraint should reject same-component edges.

### Q38: When should the API reject a cycle in the cross-component dependency graph?

**Proposed Solutions:**
- Recommended: At finalize_stage time — individual edge adds never fail for cycle reasons; finalize_stage for the tasks stage runs a full graph check across all components' edges and rejects finalization if any cycle exists.
- Alternative: At edge-add time — add_task_dependency immediately walks the graph and rejects the call if it would close a cycle.

**Raw user response:** "At finalize_stage time (recommended)"

**User selected solution:** At finalize_stage time. Cycle detection happens only at `finalize_stage` for the tasks stage, consistent with the completeness/ordering checks already established in Stories 7/12. Individual `add_task_dependency` calls are never rejected for cycle reasons.

### Q39: Should the tasks stage keep one stage-level status, or should each component task file have its own independent status/finalize lifecycle?

**Proposed Solutions:**
- Recommended: Single stage-level status — one `tasks` row in `spec_stages` per spec; `finalize_stage` requires every component to satisfy completeness before the whole stage moves to `in_review`.
- Alternative: Per-component status — each `{component}-tasks.md` has its own status, finalized/approved independently.

**Raw user response:** "Per-component status"

**User selected solution:** Per-component status. Each component task file gets its own independent status/finalize lifecycle: a status column lives on the per-component task-doc row (rather than a single spec-level `tasks` row in `spec_stages`), with a derived/aggregate notion of "is the tasks stage as a whole approved" for consumers like `get_next_stage` (approved only once every declared component's task doc is individually approved — see Q41).

### Q40: Does the human-only approve/deny transition also become per-component, or stay a single spec-wide action?

**Proposed Solutions:**
- Recommended: Per-component approve/deny — each component task doc moves in_review -> approved (or back to drafting) independently.
- Alternative: Single spec-wide approve/deny — the human action still operates once at the spec's tasks-stage level, approving/denying all in_review components together, even though each component finalizes into in_review independently.

**Raw user response:** "Single spec-wide approve/deny"

**User selected solution:** Single spec-wide approve/deny. Approve/deny remains a single spec-wide human action (still excluded from agent-facing MCP tools per Story 9), even though each component's `finalize_stage` call is independent.

### Q41: When does the spec-wide approve/deny action become eligible?

**Proposed Solutions:**
- Recommended: Wait for all components — spec-wide approve/deny is only meaningful/available once every declared component's task doc is `in_review`; one all-or-nothing review round.
- Alternative: Allow partial rounds — a reviewer can approve/deny whatever subset is currently `in_review`, with others still drafting.

**Raw user response:** "Wait for all components (recommended)"

**User selected solution:** Wait for all components. The tasks stage as a whole only becomes reviewable once every declared component's task file has independently reached `in_review` via its own `finalize_stage` call — a new completeness gate on top of the per-component finalize checks. A single spec-wide approve moves every in_review component to approved together; a single spec-wide deny sends them all back to drafting together.

### Q42: Should Definition of Done be a single spec-wide checklist or per-component?

**Proposed Solutions:**
- Recommended: Single spec-wide DoD — one Definition of Done list per spec, not owned by any individual component's task doc.
- Alternative: Per-component DoD — each `{component}-tasks.md` keeps its own separate Definition of Done.

**Raw user response:** "Single spec-wide DoD (recommended)"

**User selected solution:** Single spec-wide DoD. `definition_of_done_items` moves to hang off the spec (or a spec-level tasks-stage summary row) rather than an individual component's `tasks_doc`, giving one whole-feature completion checklist that spans all components.

### Q43: Should Flags stay per-component or move to spec-wide (like DoD)?

**Proposed Solutions:**
- Recommended: Per-component — each component's task file keeps its own Flags list.
- Alternative: Spec-wide — one Flags list for the whole spec, same parent as the new spec-wide DoD.

**Raw user response:** "Per-component (recommended)"

**User selected solution:** Per-component. `tasks_flags` stays scoped per-component (unchanged shape, still hangs off each component's `tasks_doc_id`), unlike the new spec-wide Definition of Done.

### Q44: Should a top-level `tasks.md` index document still be rendered, or is spec-wide data only reachable via separate tool calls?

**Proposed Solutions:**
- Recommended: Keep a top-level index — plain `tasks.md` lists each component + status, renders Cross-Component Dependencies and the spec-wide Definition of Done; each `{component}-tasks.md` renders its own Order/Parallel Execution Schema/Task List/Flags.
- Alternative: No combined index — only per-component files are rendered; spec-wide data only reachable via dedicated get/list tool calls.

**Raw user response:** "Keep a top-level index (recommended)"

**User selected solution:** Keep a top-level index. A plain `tasks.md` remains the spec-wide index (Components + status summary, Cross-Component Dependencies, Definition of Done), while each `{component}-tasks.md` holds that component's own Order, Parallel Execution Schema, Task List, and Flags.

### Q45: Is declaring >=1 component in design.md mandatory for every spec, or optional with a legacy fallback?

**Proposed Solutions:**
- Recommended: Mandatory, always at least one component — every design.md must declare >=1 component (even a single "core" component for trivial specs); one code path throughout schema/API/rendering, no legacy branch.
- Alternative: Optional, fallback to plain tasks.md — specs that declare no components keep today's single tasks_docs behavior unchanged.

**Raw user response:** "Mandatory, always at least one component (recommended)"

**User selected solution:** Mandatory, always at least one component. Every spec's design.md must declare at least one component; there is no legacy/no-component code path. This means the existing acceptance criteria that assume a single unified tasks.md (Stories 1, 6, 7, 8, 9, 10, 12) need updating to reflect the component-based model, and design.md's template gains a mandatory "Components" section.

### Q46: Are per-component task-doc rows auto-seeded from design.md's Components list, or explicitly created via an add tool?

**Proposed Solutions:**
- Recommended: Auto-seed from design — a trigger fires when design's Components section is finalized/approved, auto-creating one empty `not_started` tasks_doc row per declared component, mirroring the existing `seed_spec_stages` pattern.
- Alternative: Explicit `add_task_component` tool — tasks-drafter must explicitly create each component's task doc before populating it.

**Raw user response:** "Auto-seed from design (recommended)"

**User selected solution:** Auto-seed from design. Component task-doc rows are auto-seeded (one per declared design component, status `not_started`) via a trigger when design.md's Components section is finalized/approved, mirroring `seed_spec_stages`. No explicit "create the component file" tool call is needed.

### Q47: How should this change land structurally in requirements.md?

**Proposed Solutions:**
- Recommended: New stories + patch existing ACs — add 1-2 new dedicated user stories for the component-split/cross-component-dependency mechanics, plus amend the specific existing ACs in Stories 1/6/7/8/9/10/12 that hard-code a single tasks.md.
- Alternative: Fold into existing stories only — rewrite the relevant existing stories in place, no new story added.

**Raw user response:** "New stories + patch existing ACs (recommended)"

**User selected solution:** New stories + patch existing ACs. Add new dedicated user stories covering: (a) design-declared components + mandatory 1:1 component task files, and (b) cross-component task-level dependency edges + per-component finalize/spec-wide approve semantics. Also patch existing ACs in Stories 1, 6, 7, 8, 9, 10, and 12 wherever they currently assume a single unified tasks.md/tasks_doc per spec.

### Amendment status

All 15 decisions (Q33-Q47) resolved as of 2026-07-16. Ready for requirements.md to
incorporate this amendment: new user stories for the component-split/cross-component-dependency
mechanics, plus targeted patches to Stories 1, 6, 7, 8, 9, 10, and 12's acceptance criteria
wherever they currently assume one unified tasks.md per spec.
