<!--
  tasks.template.md
  Drafted autonomously by the tasks stage from an APPROVED design.md. No human
  interview happens at this stage — see README.md. The Order section is mandatory
  and linear: number tasks/subtasks in exact run order so implementation can be
  executed mechanically from top to bottom.
-->

# Tasks: <feature name>

## Order

<!--
  This is the single source of truth for run order. Represent the full execution
  sequence as a numbered checklist, including subtasks, in the exact order they
  must run for a linear implementation.

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
  in parallel mode.

  Rules:
  - Use only IDs that exist in Order (e.g. 1, 1.1, 1.2, 2).
  - Group IDs into parallel batches where items in the same batch are safe to
    run concurrently.
  - Batches run in sequence (P1, then P2, then P3...).
  - Keep runtime completion state in Order/Task List checkboxes, not here.
-->

- **P1 (parallel):** 1.1, 1.2
- **P2 (parallel):** 2

## Task List

<!--
  One entry per task. Fields:
    Execution #     required integer run position for top-level task (1, 2, 3...).
    ID              stable identifier referenced by Order and subtasks.
    Description     what to build/change.
    Traceability    requirement(s) + design sections this task implements.
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
- **Traceability:** Story 1 -> design §Architecture
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
     because it was insufficient or ambiguous on some point. Always draft your
     best-effort task list regardless — record the concern here instead of halting
     to ask the human. The human reviews this section during the approve/deny
     gate. -->

-

## Definition of Done

<!-- Top-level checklist for the whole spec, not per-task. Implementation is not
     complete until every item here is checked. -->

- [ ] All task and subtask checkboxes in Order and Task List are complete.
- [ ] All acceptance checks pass.
- [ ] No unresolved item in design.md's Open Risks / Tradeoffs blocks release.
- [ ] No unresolved Flags remain from design.md or tasks.md.