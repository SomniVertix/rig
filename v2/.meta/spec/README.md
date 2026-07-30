# Spec Workflow

This document defines how a "spec" is created and consumed in this project. It is written
so that an AI agent with **zero prior context** can read it cold and correctly execute
whichever stage of the workflow applies.

**All spec data lives in the `rig` MCP server, not the local filesystem.** Every
read and write described below is an `mcp__rig__*` tool call against Neo4j-backed
storage (`internal/graph`), scoped by an explicit `workspaceId` argument on every
call that needs one (`list_specs`, `create_expedition`, etc.) — `get_spec`/
`render_document`/etc. take only the already-scoped `specId` or `expeditionId`
they were handed. No agent in this pipeline ever uses Read/Write/Edit/Glob on a
spec document, a `decisions.md`, or a `status.json` — those files do not exist at
runtime. The only real files involved are the templates in this folder, which
are reference material describing the *shape* `render_document` produces — they
are never hand-filled or copied per-feature.

**Workspace binding:** the MCP server exposes a single fixed route (`/mcp`, no
per-workspace path segment or header) — there is no ambient, session-wide
binding. Each VS Code `.code-workspace` file carries a durable `rig.workspaceId`,
discovered by `internal/binding`'s scanner. An MCP client resolves its own
`workspaceId` once per session by calling the `resolve_workspace_id` tool (or
`POST /resolve`) with its current working directory, then threads that
`workspaceId` explicitly into every subsequent call that needs one — see
`internal/binding/README.md` for the resolution mechanism itself. (v1 instead
injected an `X-Rig-Project-Id` header via a shared stdio resolver proxy so every
call was ambiently scoped; v2 has no such proxy — scoping is an explicit
argument, not connection-level state.)

Every stage document produced by this workflow must itself be self-contained enough for a
fresh, cold-context agent to act on — never assume a later reader has access to this
conversation or any earlier one. For MCP-managed state that means: re-fetch it via
`get_spec` / `get_next_stage` / `render_document` at the start of every invocation, never
assume it's still what it was last time you looked.

## What a "spec" is

A spec is not one document. It is three sequential stages that together fully describe a
feature, each stored as structured rows and rendered to markdown on demand:

1. **Requirements** — what must be true. No implementation detail.
2. **Design** — how it will be built. Technical approach, grounded in the requirements.
3. **Tasks** — the concrete, ordered, executable work plan derived from the design, split
   per-component: one spec-wide index (component list + status, Cross-Component
   Dependencies, Definition of Done) plus one task document per component declared in the
   design's Components section. See Stage 3 below.

Stages are strictly sequential (requirements → design → tasks), but each stage may be
executed by a **completely different agent with a clean context**. Treat every stage
boundary as a cold handoff: call `mcp__rig__get_spec` and/or
`mcp__rig__render_document` at the start of your turn rather than trusting anything
carried over from a previous message.

## Where things live

Two different kinds of things exist. Do not confuse them:

- **Templates** (this folder, `spec-templates/spec/`) — reference documents describing the
  section-by-section shape that `render_document` produces for each stage. Checked into the
  project, read for structure/guidance, never written to per-feature.
- **Instances** — real, per-feature data, held entirely by the `rig` MCP server as
  nodes scoped by `workspaceId`. There is no `.rig/specs/<slug>/`
  directory. A spec instance is identified purely by the `specId` returned from
  `mcp__rig__complete_expedition` (which creates the spec when an expedition completes
  with a spec outcome — see Stage 0), and every subsequent tool call for that spec takes
  that `specId` (or an id/slug derived from it, e.g. `componentSlug`).

```
spec-templates/spec/
  README.md                    <- this file
  requirements.template.md
  design.template.md
  tasks-index.template.md
  component-tasks.template.md

rig MCP server (Neo4j graph, internal/graph — see neo4jstore.go for the full model)
  (:Expedition)                (one node per discovery effort — Stage 0), scoped by workspaceId
    -[:HAS_WAYPOINT]->(:Waypoint)          (one question each) + WaypointAsset + BLOCKS dependency edges
    -[:HAS_TERM]->(:ExpeditionTerm)        (per-expedition terminology)
    Expedition.outcomeSpecId ──► the spec a completed expedition produced
  (:Spec)                      (one node per feature, scoped by workspaceId — replaces status.json's stage state
                                 via requirementsStageStatus/designStageStatus properties directly on Spec)
    -[:HAS_USER_STORY]->(:UserStory)-[:HAS_CRITERION]->(:AcceptanceCriterion)
    -[:HAS_NON_GOAL]->(:NonGoal), -[:HAS_OPEN_QUESTION]->(:OpenQuestion), -[:HAS_GLOSSARY_TERM]->(:GlossaryTerm)
    -[:HAS_COMPONENT]->(:DesignComponent)-[:HAS_TASKS_DOC]->(:TasksDoc)-[:HAS_TASK_ITEM]->(:TaskItem)
    -[:HAS_DATA_MODEL_ENTRY]->(:DataModelEntry), -[:HAS_TRACEABILITY_ENTRY]->(:TraceabilityEntry)
    -[:HAS_ALTERNATIVE]->(:Alternative), -[:HAS_OPEN_RISK]->(:OpenRisk), -[:HAS_DOD_ITEM]->(:DefinitionOfDoneItem) (spec-wide)
    TaskItem -[:BLOCKS]->TaskItem (cross-component only), -[:HAS_SUBTASK]->TaskItem, -[:HAS_FILE_TOUCHED]->FileTouched
```

## The pipeline

```
human idea
   │
   ▼
[expedition]  (discovery schema — grilling and/or wayfinder skills)
   │  each question becomes a WAYPOINT driven to a decision
   │  (sighted → marked → claimed → reached | bypassed), persisted live via the
   │  mcp__rig__* expedition tools — nothing lives only in session context
   ▼
complete_expedition (outcome: spec) ──creates the spec AND links the expedition to it
   │                                  (trails.outcome_spec_id) in one transaction
   ▼
[requirements compile]  (mechanical, via mcp__rig__* tools)
   │  the expedition's reached waypoints (read via get_expedition_by_spec) -> requirements
   │  rows, using requirements.template.md as the target shape
   ▼
requirements  ──[approve/deny gate]──►  design  ──[approve/deny gate]──►  tasks  ──[approve/deny gate]──►  implementation
   (autonomous draft)                     (autonomous draft)                (orchestrator)
```

**The expedition — the grilling interview and any wayfinder campaign around it — is the
last point of deep human interaction in the entire pipeline.** Every stage after requirements compilation is autonomous AI work. The human's
only remaining involvement is a quick **approve/deny** review at the end of each stage —
never another interview.

### Feature slug

Derive a short kebab-case slug from the feature's working title as stated at the start of
the expedition (e.g. "dark mode toggle" → `dark-mode-toggle`). Call
`mcp__rig__list_specs` and check whether that slug is already in use in this
workspace; if so, append a numeric suffix (`-2`, `-3`, ...) until it's free, then pass it to
`mcp__rig__complete_expedition` when the expedition completes with a spec outcome. Keep
the returned `specId` — everything downstream is addressed by it, not by the slug.

## Stage 0 — Discovery (an expedition, via the `grilling` and `wayfinder` skills)

Stage 0 is an **expedition**: one effort to turn a loose idea into a destination, stored in
the `discovery` schema and worked entirely through `mcp__rig__*` tools (`create_expedition`,
`add_waypoint`, `reach_waypoint`, `bypass_waypoint`, `get_frontier`, ... — the skills
hard-fail without the rig MCP server; there is no local storage layer). Each
question is a **waypoint** driven to a decision through the lifecycle
sighted → marked → claimed → reached | bypassed.

There is no structural difference between a quick grilling conversation and a long
wayfinder campaign: a grill adds a waypoint and reaches it in the same breath (no claim
step); a campaign marks waypoints and lets later conversations claim them off the frontier
(`claim_waypoint` / `get_frontier`; a stale claim is reclaimable after the server's
`RIG_CLAIM_TTL`, or released manually via `release_waypoint`). Either way, every
decision is persisted durably as it's made — nothing lives only in the session's context,
and there is no verbatim in-context handoff to Stage 1.

The expedition ends with `mcp__rig__complete_expedition` (`outcome_kind: "spec"`), which
creates the spec **and** links the expedition to it (`trails.outcome_spec_id`) in a single
transaction. At most one expedition can stand behind any spec.

## Stage 1 — Requirements compile (mechanical)

The decisions transcript is the spec's linked expedition: call
`mcp__rig__get_expedition_by_spec` with the `specId` and read its reached waypoints
(resolution + gist, in reached order) as the decisions, its bypassed waypoints as
out-of-scope rulings, and its expedition terms as terminology. Produce the spec's
requirements from that using `requirements.template.md` as the target section shape, via
these `mcp__rig__*` calls:

1. The spec already exists — `complete_expedition` created it. Do not create one here.
2. `set_requirements_overview` for the `## Overview` section.
3. `add_user_story` per story, then `add_acceptance_criterion` per EARS criterion under
   each returned `userStoryId`.
4. `add_non_goal` per non-goal.
5. `add_assumption_open_question` per gap/ambiguity.
6. `add_glossary_term` per domain term.

This step is **mostly mechanical**: reformat the decisions transcript into proper
requirements structure. It is not a fresh interview. If something the template requires is
simply absent from the transcript, do not invent an answer — record it via
`add_assumption_open_question` instead (see Stage 1's agent notes for why this replaced
"stop and ask the human directly").

Acceptance criteria use **EARS notation** (see `requirements.template.md` for the full
pattern set and rationale — `add_acceptance_criterion`'s `earsPattern` enum mirrors it
exactly). Any non-functional requirement must include a measurable threshold — flag ones
that don't via `add_assumption_open_question` rather than writing a vague one.

Once every section is written, call `mcp__rig__finalize_stage` with
`stage: "requirements"` to submit it for review, then call
`mcp__rig__render_document` with `stage: "requirements"` and present the rendered
markdown to the human for approve/deny.

## Stage 2 — Design (autonomous draft)

Precondition: call `mcp__rig__get_spec` and confirm `requirements` is `"approved"`.
If it isn't, stop and report that back — do not draft against unapproved requirements.

Read the requirements cold via `mcp__rig__render_document`
(`stage: "requirements"`) — never assume you already know its contents. This stage is
fully autonomous — do not interview the human. Every requirement must be traceable to a
part of the design that satisfies it.

Produce the design using `design.template.md` as the target section shape, via:

1. `set_design_overview`, `set_design_architecture`.
2. `add_design_component` for every component (at least one is mandatory — a design with
   zero declared components is rejected at `finalize_stage`). Slugs must be kebab-case.
3. `add_design_data_model_entry` per schema/type/API contract.
4. `add_design_traceability` per requirement/story, mapping it to the design section or
   component that satisfies it.
5. `add_design_alternative`, `add_design_open_risk`, `add_design_flag` as needed.

If the requirements are insufficient to design some part with confidence, do not halt.
Draft your best-effort approach anyway and record the concern via `add_design_flag`.

Call `mcp__rig__finalize_stage` with `stage: "design"`. This also auto-seeds one
task document per declared component server-side — nothing further to do for that. Then
`render_document` (`stage: "design"`) and present for approve/deny.

## Stage 3 — Tasks (autonomous draft)

Precondition: `design` must be `"approved"` (`get_spec`). The design's Components section
(read via `render_document`, `stage: "design"`) declares >=1 component; the tasks stage maps
onto it 1:1 — one task document per component slug already seeded by Stage 2's
`finalize_stage`, plus the single spec-wide Definition of Done.

For **each** component (`componentSlug` from the design):

1. `add_task_item` per task/subtask, **in the exact order it must run** — `item_id` and
   `execution_order` are derived append-only from call order, there is no explicit
   position argument, so the sequence you call this in *is* the Order section. Use
   `parentItemId` for subtasks. Keep the returned task-item id — you'll need it for files
   touched, parallel batches, and any cross-component dependency edge.
2. `add_task_file_touched` per file/area for that task item.
3. `add_parallel_batch` once per batch, in sequence (`batchLabel`/`batchOrder` are derived
   from call order), then `add_parallel_batch_member` for each task item in that batch.
4. `add_tasks_flag` for any concern specific to this component.

Spec-wide, once (not per component):

- `add_definition_of_done_item` for each item in the single Definition of Done, shared
  across every component.
- `add_task_dependency_edge` for any dependency that crosses component boundaries (`from`
  must complete before `to`). Since there's no lookup-by-display-id tool, keep an in-memory
  map from each component's task-item ids (as you create them) to the UUIDs `add_task_item`
  returned, for the whole drafting session across all components — you need those UUIDs to
  wire an edge. Never express a cross-component dependency inside a single component's
  Order/Parallel Execution Schema.

**Suggested agent per task.** Take inventory of the agent types currently available to you
and record the best-suited one in `add_task_item`'s `suggestedAgent` (or `update_task_item`
after the fact). If none fits, use `none` — the implementer falls back to its default agent.

Same Flags rule as design: draft best-effort, record concerns via `add_tasks_flag` rather
than halting.

Once a component's items/batches/flags are complete, call `mcp__rig__finalize_stage`
with `stage: "tasks"` and `component: "<slug>"` — each component finalizes independently
(this is also where cross-component cycle detection runs, across the whole spec's edges).
Repeat per component, then `render_document` (`stage: "tasks"`, `component: "all"` for the
index, or a specific slug for one component's document) and present for approve/deny.

## Approve/deny gate

At the end of every stage (requirements, design, and each tasks component), your job is to
call `mcp__rig__finalize_stage`, which submits it to `in_review`, and then present
the `render_document` output to the human. **Approve/deny itself is a human-only action not
exposed by any `mcp__rig__*` tool** — you cannot set a stage to `approved` yourself,
and you should not report a stage as approved just because you finalized it. Your
involvement ends at "submitted for review."

- **Approve** happens outside your tool access; the next stage becomes eligible once you
  observe (via `get_spec` / `get_next_stage`) that it has flipped to `approved`.
- **Deny** — the human gives a short freeform reason (one or two sentences — not a Q&A
  loop), which reaches you as part of your next invocation. Redraft using the relevant
  `update_*`/`add_*`/`delete_*` tools for that stage, incorporating the feedback, then call
  `finalize_stage` again to resubmit.

Advancing to the next stage is blocked while the current stage (or, for tasks, a given
component) is not `approved` — `get_next_stage` will simply not surface it as actionable.

## Status tracking

There is no `status.json`. Call `mcp__rig__get_spec` with the spec's id to get its
`current_stage` and each of `requirements` / `design` / `tasks`'s status
(`not_started`, `in_review`, `approved`) directly from the server.

**Entry-point behavior:** whatever invokes this workflow should call
`mcp__rig__get_next_stage` first thing and always do the next correct thing — run
the next stage whose predecessor is `approved` and which is itself not yet `approved` (for
tasks, this includes telling you which components still lag). This lets a human or
orchestrating agent re-invoke the same entry point repeatedly without needing to remember
which stage — or which component — comes next.

## Implementation handoff (orchestrator)

Once every component's `tasks` stage is `approved`, implementation begins. The implementer
is an **orchestrator**, executing the precomputed plan mechanically:

1. Call `get_next_stage` / `get_spec`, then `render_document` (`stage: "tasks"`, first
   `component: "all"` for the index, then each component) to read the full plan — cold, no
   prior context assumed.
2. Choose runtime mode:
   - linear mode: walk each component's Order top-to-bottom, one item at a time.
   - parallel mode: follow each component's Parallel Execution Schema batch-by-batch,
     dispatching each batch's items concurrently, while respecting any cross-component
     `task_dependency_edges` between components.
3. After each item completes in either mode, call `mcp__rig__update_task_item` with
   `isChecked: true` immediately — this is the live checklist state; there is no file to
   edit. (A parent item is rejected if marked checked while any of its children in the same
   component are still unchecked.)
4. Repeat until every ordered item is done, then call
   `mcp__rig__update_definition_of_done_item` with `isChecked: true` for each spec-
   wide Definition of Done item as it's verified satisfied.

The orchestrator does not need deep judgment — it mechanically executes the precomputed
plan. All the reasoning about ordering, parallel grouping, and agent selection already
happened when tasks were drafted.
