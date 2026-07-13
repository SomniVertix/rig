<!--
  tasks.template.md
  Drafted autonomously by the tasks stage from an APPROVED design.md. No human
  interview happens at this stage — see README.md. The Order section is mandatory:
  compute concurrency-safe execution waves now, while you have full context from
  design.md, rather than leaving that analysis to the implementing agent.
-->

# Tasks: <feature name>

## Order

<!--
  Group tasks into waves. Tasks within the same wave MUST be safe to run
  concurrently (no overlapping files/areas touched, no ordering dependency between
  them). Waves run strictly in sequence; all tasks in a wave complete before the
  next wave starts. This is what makes concurrent implementation agents safe —
  don't leave this analysis implicit in per-task "Depends on" fields alone.
-->

- **Wave 1:** T1, T2, T3 (no shared files/areas, no interdependency)
- **Wave 2:** T4 (depends on T1, T2)
- **Wave 3:** T5 (depends on T4)

## Task List

<!--
  One entry per task. Fields:
    ID              stable identifier, referenced by Order above and by other
                    tasks' Depends on.
    Description     what to build/change.
    Traceability    requirement(s) + design section(s) this task implements.
    Files/areas     explicit list — the auditable basis for the Order wave
                    touched          groupings above, and the task's blast radius.
    Suggested agent take inventory of the agent types currently available and name
                    the best-suited one for this task (or subtask). `none` if no
                    available agent is a good fit — the implementer falls back to
                    its default agent.
    Depends on      explicit task-ID list (the raw edges Order's waves were
                    computed from — kept so a single task can be inspected in
                    isolation without cross-referencing the whole Order section).
    Acceptance      how the implementer knows this task is done. Derive from the
    check           relevant EARS criteria / design details, not a vague restatement
                    of the description.
-->

### T1: <short title>

- **Description:**
- **Traceability:** Story 1 -> design §Architecture
- **Files/areas touched:**
- **Suggested agent:** `none`
- **Depends on:** —
- **Acceptance check:**

### T2: <short title>

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

- [ ] All tasks in the Task List are complete.
- [ ] All acceptance checks pass.
- [ ] No unresolved item in design.md's Open Risks / Tradeoffs blocks release.
- [ ] No unresolved Flags remain from design.md or tasks.md.
