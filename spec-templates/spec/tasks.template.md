<!--
  tasks.template.md
  RETIRED as a standalone authoring template — kept only as a pointer so nothing that
  references this filename by habit is left stranded. The tasks stage now produces a
  per-component document scheme instead of one single-file tasks.md, to match
  design.md's mandatory Components section (see design.template.md).

  Use these two templates instead:
    - tasks-index.template.md      — the ONE spec-wide document: component list +
                                      status, Cross-Component Dependencies, and the
                                      single spec-wide Definition of Done.
    - component-tasks.template.md  — ONE INSTANCE PER declared component: that
                                      component's own Order, Parallel Execution
                                      Schema, Task List, and Flags. No Definition of
                                      Done here — it lives only in the index.

  Drafted autonomously by the tasks stage from an APPROVED design.md, same as before.
  No human interview happens at this stage — see README.md. The Order section inside
  each component-tasks.md instance remains mandatory and linear.
-->

# Tasks template — see tasks-index.template.md and component-tasks.template.md

This file is intentionally not a fillable template body. A tasks stage drafting
`tasks.md` for a feature must instead produce:

1. Exactly one `tasks-index.md` (or equivalent index filename) from
   `tasks-index.template.md`, spec-wide.
2. Exactly one component-scoped tasks document per row in design.md's Components
   section, from `component-tasks.template.md`.

Do not hand-author a single unified `tasks.md` body under this filename going
forward — read `tasks-index.template.md` and `component-tasks.template.md` cold
instead.
