<!--
  tasks.template.md
  RETIRED as a standalone authoring template — kept only as a pointer so nothing that
  references this filename by habit is left stranded. There was never a single "tasks.md"
  file to begin with once the rig MCP server took over spec storage; the tasks
  stage produces a per-component document scheme instead, to match design's mandatory
  Components section (see design.template.md), all as rows rendered on demand via
  mcp__rig__render_document — nothing here is hand-filled or written to disk.

  Use these two templates instead (both describing render_document output shape):
    - tasks-index.template.md      — the ONE spec-wide document: component list +
                                      status, Cross-Component Dependencies, and the
                                      single spec-wide Definition of Done.
    - component-tasks.template.md  — ONE INSTANCE PER declared component: that
                                      component's own Order, Parallel Execution
                                      Schema, Task List, and Flags. No Definition of
                                      Done here — it lives only in the index.

  Drafted autonomously by the tasks stage from an APPROVED design, same as before. No
  human interview happens at this stage — see README.md. The Order section inside each
  component-tasks document remains mandatory and linear.
-->

# Tasks template — see tasks-index.template.md and component-tasks.template.md

This file is intentionally not a fillable template body — there is no `tasks.md` file at
all. A tasks stage drafting tasks for a feature must instead produce, via
`mcp__rig__*` tool calls (never file writes):

1. Exactly one spec-wide index matching `tasks-index.template.md`'s shape (rendered via
   `render_document` with `component: "all"`).
2. Exactly one component-scoped tasks document per row in design's Components section,
   matching `component-tasks.template.md`'s shape (rendered via `render_document` with that
   component's slug).

Do not hand-author a single unified tasks document going forward — read
`tasks-index.template.md` and `component-tasks.template.md` cold instead.
