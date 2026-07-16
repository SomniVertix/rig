<!--
  tasks-index.template.md
  The single spec-wide tasks-stage document, autonomously drafted by the tasks stage
  from an APPROVED design.md. No human interview happens at this stage — see
  README.md. This document does NOT contain any component's own Order / Parallel
  Execution Schema / Task List / Flags — those live one-per-component in
  component-tasks.template.md instances (one per row in design.md's Components
  section). This index instead tracks, spec-wide: which components exist and their
  current status, dependencies that cross component boundaries, and the single
  Definition of Done for the whole spec. This is the one and only place the
  Definition of Done appears — it must never be duplicated into a component-tasks.md
  instance.
-->

# Tasks: <feature name> (Index)

## Components

<!--
  Mandatory: one row per component declared in design.md's Components section — this
  list must match it exactly (same slugs, same count). `Status` mirrors that
  component's own tasks_docs lifecycle state (`not_started` / `in_review` /
  `approved`) and should be kept current as each component's tasks document
  progresses — it is live runtime state, not fixed at drafting time.
-->

| Slug | Display name | Status | Component tasks document |
|---|---|---|---|
| `<component-slug>` | <Component Display Name> | not_started | `<component-slug>-tasks.md` |

## Cross-Component Dependencies

<!--
  Mandatory section. Represent dependencies BETWEEN components' task items here —
  never inside a single component-tasks.md file, which only expresses intra-component
  order. Each edge means "from" must complete before "to" can start. List edges by
  component slug + task ID (e.g. `db-schema 1.2 -> mcp-transport 1.1`). If a build
  order between components is illustrated in design.md (e.g. a components/build-order
  diagram), reconcile this list against it. Leave explicitly empty (state "None.") if
  no cross-component dependency exists — do not omit the section.
-->

-

## Definition of Done

<!-- The single spec-wide checklist for the WHOLE spec (all components combined), not
     per-component. Implementation of every component is not complete until every item
     here is checked. This is the only Definition of Done for this spec — component-
     tasks.md instances must not define their own. -->

- [ ] All task and subtask checkboxes in every component's Order and Task List are complete.
- [ ] All acceptance checks pass, across every component.
- [ ] No unresolved item in design.md's Open Risks / Tradeoffs blocks release.
- [ ] No unresolved Flags remain from design.md or any component-tasks.md / this index.
- [ ] Every component listed above has reached `approved` status.
