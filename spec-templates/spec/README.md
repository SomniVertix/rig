# Spec Workflow

This document defines how a "spec" is created and consumed in this project. It is written
so that an AI agent with **zero prior context** can read it cold and correctly execute
whichever stage of the workflow applies. Every stage document produced by this workflow
must itself be self-contained enough for a fresh, cold-context agent to act on — never
assume a later reader has access to this conversation or any earlier one.

## What a "spec" is

A spec is not one document. It is three sequential stage documents that together fully
describe a feature:

1. **`requirements.md`** — what must be true. No implementation detail.
2. **`design.md`** — how it will be built. Technical approach, grounded in the requirements.
3. **The tasks documents** — the concrete, ordered, executable work plan derived from the
   design, split per-component: one spec-wide `tasks-index.md` (component list + status,
   Cross-Component Dependencies, Definition of Done) plus one `<component-slug>-tasks.md`
   per component declared in design.md's Components section (that component's own Order,
   Parallel Execution Schema, Task List, Flags). See Stage 3 below.

Stages are strictly sequential (requirements → design → tasks), but each stage may be
executed by a **completely different agent with a clean context**. Treat every stage
boundary as a cold handoff.

## Where things live

Two different kinds of files exist. Do not confuse them:

- **Templates** (this folder, `relentless/templates/spec/`) — the reusable skeletons this
  document describes. Checked into the project, never modified per-feature.
- **Instances** (`.relentless/specs/<feature-slug>/`) — the real, filled-in documents for
  one specific feature, generated at runtime from the templates.

```
relentless/
  templates/spec/
    README.md                    <- this file
    requirements.template.md
    design.template.md
    tasks.template.md            <- retired pointer; see below
    tasks-index.template.md
    component-tasks.template.md
  .relentless/
    specs/
      <feature-slug>/
        decisions.md              (provenance copy from the grilling session)
        requirements.md
        design.md
        tasks-index.md
        <component-slug>-tasks.md (one per component declared in design.md)
        status.json
```

## The pipeline

```
human idea
   │
   ▼
[grilling session]  (type: session — takes over the active agent session)
   │  interviews the human until requirements are unambiguous
   ▼
decisions.md  ───────copied to───────►  .relentless/specs/<slug>/decisions.md
   │
   ▼
[requirements compile]  (mechanical)
   │  decisions.md -> requirements.md, using requirements.template.md
   ▼
requirements.md  ──[approve/deny gate]──►  design.md  ──[approve/deny gate]──►  tasks.md  ──[approve/deny gate]──►  implementation
                        (autonomous draft)                  (autonomous draft)              (orchestrator)
```

**The grilling interview is the last point of deep human interaction in the entire
pipeline.** Every stage after requirements compilation is autonomous AI work. The human's
only remaining involvement is a quick **approve/deny** review at the end of each stage —
never another interview.

### Feature slug

Derive a short kebab-case slug from the feature's working title as stated at the start of
the interview (e.g. "dark mode toggle" → `dark-mode-toggle`), sanitized to filesystem-safe
characters. If `.relentless/specs/<slug>/` already exists, append a numeric suffix
(`-2`, `-3`, ...) until the name is free.

## Stage 0 — Requirements gathering (`grilling`, type: `session`)

A session-type skill takes over the active agent session and interviews the human about
the feature idea until requirements are concrete, testable, and free of ambiguity. It
produces only `decisions.md` — a raw Q&A log, not a formal document. It does not write
`requirements.md` itself.

Session skills are skills that take over the active agent session and usually work as the
detailed information gathering for an upcoming spec.

When the interview concludes, copy the resulting `decisions.md` into
`.relentless/specs/<feature-slug>/decisions.md`. This copy is retained permanently as a
provenance record — no downstream stage reads it, but it preserves *why* a requirement
exists in the human's own words, for later human or audit review.

## Stage 1 — Requirements compile (mechanical)

Read `.relentless/specs/<feature-slug>/decisions.md` and produce
`.relentless/specs/<feature-slug>/requirements.md` using `requirements.template.md`.

This step is **mostly mechanical**: reformat the decisions log into proper requirements
structure (user stories, EARS acceptance criteria, non-goals). It is not a fresh
interview. However, if something the template requires is simply absent from
`decisions.md`, do not invent an answer — stop and ask the human directly for that one
piece of missing information, then continue. This is a narrow clarifying question, not a
Q&A session.

Acceptance criteria use **EARS notation** (see `requirements.template.md` for the full
pattern set and rationale). Any non-functional requirement must include a measurable
threshold — reject and flag ones that don't (e.g. "the system shall be fast" is not
acceptable; "the system shall respond within 200ms under 1000 concurrent users" is).

Once written, set `requirements` status to `in_review` in `status.json` (see
[Status tracking](#status-tracking)) and present the document to the human for
approve/deny.

## Stage 2 — Design (autonomous draft)

Once `requirements.md` is `approved`, read it cold and draft
`.relentless/specs/<feature-slug>/design.md` using `design.template.md`. This is fully
autonomous — do not interview the human. Every requirement must be traceable to a part of
the design that satisfies it.

If the requirements document is insufficient to design some part of the feature with
confidence, do not halt to ask a blocking question. Draft your best-effort approach and
record the concern in the **Flags** section of `design.md` (see the template). The human
will see it during their approve/deny review.

Set `design` status to `in_review` and present for approve/deny.

## Stage 3 — Tasks (autonomous draft)

Once `design.md` is `approved`, read it cold and draft the tasks-stage documents. Also
fully autonomous. Break the design into discrete, independently-inspectable tasks, each
traced back to the requirement(s) and design section(s) it implements.

design.md's Components section (see `design.template.md`) declares >=1 component. The
tasks stage maps onto it 1:1: draft one
`.relentless/specs/<feature-slug>/<component-slug>-tasks.md` per declared component using
`component-tasks.template.md`, plus exactly one spec-wide
`.relentless/specs/<feature-slug>/tasks-index.md` using `tasks-index.template.md` that
lists every component + its status, the Cross-Component Dependencies, and the single
spec-wide Definition of Done. Do not author a single unified `tasks.md` — that format is
retired (see `tasks.template.md`'s pointer note).

**The Order section is mandatory in every component-tasks document.** Determine which
tasks within that component can run concurrently without risk of ambiguity and represent
the full run as one precomputed **linear numbered checklist**, including subtasks (e.g.
`1`, `1.1`, `1.2`, `2`). Do this analysis now, while you have full context from
`design.md`, rather than leaving it for the implementing agent to infer later. Ordering
that crosses component boundaries goes in `tasks-index.md`'s Cross-Component
Dependencies section instead, never inside a component-tasks document's Order.

**Parallel mode schema is mandatory.** In addition to the linear checklist, include a
`Parallel Execution Schema` section that groups the same task/subtask IDs into sequential
parallel batches (e.g. `P1`, `P2`) so an orchestrator can run compatible work concurrently
without re-deriving grouping logic at runtime.

**Checklist semantics are required.** Draft all task/subtask checkboxes as unchecked. The
implementer/orchestrator must check each item immediately when it completes so the
relevant document (a component's `<component-slug>-tasks.md`, or `tasks-index.md` for the
Components table/Definition of Done) remains an accurate live execution state.

**Suggested agent per task.** Take inventory of the agent types currently available to
you and assign the best-suited one to each task (and subtask, if applicable). If none of
the available agents is a good fit, set the field to `none` — the implementer will use
its default agent for that task.

Same Flags rule as design: draft best-effort, record concerns in the Flags section rather
than halting.

Set `tasks` status to `in_review` and present for approve/deny.

## Approve/deny gate

At the end of every stage (requirements, design, tasks), present the document to the
human for a quick review:

- **Approve** → set that stage's status to `approved` in `status.json`, unblocking the
  next stage.
- **Deny** → the human gives a short freeform reason (one or two sentences — not a Q&A
  loop). Redraft the document incorporating that feedback, then re-present it for
  approval. Status stays `in_review` until approved.

Advancing to the next stage is blocked while the current stage's document is not
`approved`.

## Status tracking

`.relentless/specs/<feature-slug>/status.json` tracks pipeline state. It is separate from
the markdown documents so they stay pure, standalone-readable content with no pipeline
metadata mixed in.

```json
{
  "stage": "design",
  "requirements": "approved",
  "design": "in_review",
  "tasks": "not_started",
  "created_at": "2026-07-12T22:03:36Z",
  "updated_at": "2026-07-13T01:00:00Z"
}
```

`stage` is the current active stage. Each of `requirements` / `design` / `tasks` is one
of `not_started`, `in_review`, `approved`. If `status.json` does not exist yet, treat the
spec as brand new (stage `requirements`, everything `not_started`).

**Entry-point behavior:** whatever invokes this workflow should inspect
`status.json` (creating it if absent) and always do the next correct thing — run the next
stage whose predecessor is `approved` and which is itself not yet `approved`. This lets a
human or orchestrating agent re-invoke the same entry point repeatedly without needing to
remember which stage comes next.

## Implementation handoff (orchestrator)

Once the `tasks` stage is `approved`, implementation begins. The implementer is an
**orchestrator**, executing the precomputed linear plan mechanically:

1. Read `tasks-index.md` and every `<component-slug>-tasks.md` document it lists, in
   full — cold, no prior context assumed.
2. Choose runtime mode:
  - linear mode: walk the `Order` checklist top-to-bottom, one item at a time.
  - parallel mode: follow `Parallel Execution Schema` batch-by-batch, dispatching each
    batch's items concurrently.
3. After each item completes in either mode, mark its checkbox immediately in `tasks.md`.
4. Repeat until every ordered item is done and the Definition of Done checklist is
  satisfied.

The orchestrator does not need deep judgment — it mechanically executes the precomputed
plan. All the reasoning about ordering, parallel grouping, and agent selection already
happened when `tasks.md` was authored.
