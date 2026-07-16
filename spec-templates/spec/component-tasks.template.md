<!--
  component-tasks.template.md
  One filled-in instance of this template exists PER declared component (see
  design.md's Components section / design.template.md), autonomously drafted by the
  tasks stage from an APPROVED design.md. No human interview happens at this stage —
  see README.md. This document covers exactly one component's own run order,
  parallel-execution grouping, task list, and flags. It does NOT carry the spec-wide
  Definition of Done — that lives once, in tasks-index.template.md, alongside the list
  of every component and the Cross-Component Dependencies. The Order section below is
  mandatory and linear: number tasks/subtasks in exact run order so this component's
  slice of implementation can be executed mechanically from top to bottom.

  File naming convention: instances of this template are named `<component-slug>.md`
  or `tasks-<component-slug>.md` (match whatever the surrounding spec directory
  convention already uses for other per-component files), one per row declared in
  design.md's Components section.
-->

# Tasks: <feature name> — Component: <component-slug> (<Component Display Name>)

<!-- `<component-slug>` MUST match a slug row in design.md's Components section
     exactly (kebab-case). This document exists 1:1 with that declared component. -->

## Order

<!--
  This is the single source of truth for this component's run order. Represent the
  full execution sequence for THIS COMPONENT ONLY as a numbered checklist, including
  subtasks, in the exact order they must run for a linear implementation. Task IDs are
  scoped to this component (e.g. `1`, `1.1`, `1.2`, `2`) — cross-component ordering is
  expressed separately via `task_dependency_edges` / the index's Cross-Component
  Dependencies section, never by renumbering here.

  Checklist state is live runtime state:
  - drafter writes every item unchecked ([ ])
  - implementer/orchestrator checks an item ([x]) immediately when it completes
  - parent tasks should only be checked after all of their subtasks are checked
-->

- [ ] 1. T1: <short title>
- [ ] 1.1 T1.1: <subtask title>
- [ ] 1.2 T1.2: <subtask title>
- [ ] 2. T2: <short title>

## Parallel Execution Schema

<!--
  Mandatory: define how the same ordered task/subtask IDs from Order can be run
  in parallel mode, within this component.

  Rules:
  - Use only IDs that exist in this component's Order (e.g. 1, 1.1, 1.2, 2).
  - Group IDs into parallel batches where items in the same batch are safe to
    run concurrently.
  - Batches run in sequence (P1, then P2, then P3...).
  - Keep runtime completion state in Order/Task List checkboxes, not here.
  - Dependencies on OTHER components are not represented here — see this spec's
    tasks-index.md Cross-Component Dependencies section instead.
-->

- **P1 (parallel):** 1.1, 1.2
- **P2 (parallel):** 2

## Task List

<!--
  One entry per task, scoped to this component. Fields:
    Execution #     required integer run position for top-level task (1, 2, 3...),
                    scoped to this component.
    ID              stable identifier referenced by Order and subtasks.
    Description     what to build/change.
    Traceability    requirement(s) + design section(s) this task implements,
                    including this component's row in design.md's Components table.
    Files/areas     explicit list — the auditable task blast radius.
                    touched
    Suggested agent take inventory of the agent types currently available and name
                    the best-suited one for this task. `none` if no available
                    agent is a good fit — the implementer falls back to its
                    default agent.
    Subtasks        required numbered checklist in run order; each subtask includes
                    ID, description, suggested agent (or `none`), and acceptance.
    Acceptance      how the implementer knows this task is done. Derive from the
    check           relevant EARS criteria / design details, not a vague restatement
                    of the description.
-->

### [ ] 1. T1: <short title>

- **Execution #:** 1
- **Description:**
- **Traceability:** Story 1 -> design §Architecture; design Components: `<component-slug>`
- **Files/areas touched:**
- **Suggested agent:** `none`
- **Acceptance check:**
- **Subtasks (run in listed order):**
  - [ ] 1.1 T1.1: <subtask title>
    - **Description:**
    - **Suggested agent:** `none`
    - **Acceptance check:**
  - [ ] 1.2 T1.2: <subtask title>
    - **Description:**
    - **Suggested agent:** `none`
    - **Acceptance check:**

### [ ] 2. T2: <short title>

<!-- repeat pattern -->

## Flags

<!-- Concerns, gaps, or assumptions encountered while breaking design.md into tasks
     for THIS COMPONENT because it was insufficient or ambiguous on some point.
     Always draft your best-effort task list regardless — record the concern here
     instead of halting to ask the human. The human reviews this section during the
     approve/deny gate. -->

-
