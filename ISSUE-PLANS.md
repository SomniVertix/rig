A collection of known issues/gaps in the Rig application that need a permanent fix:



---
## `rig` MCP tools never expose a task item's real UUID to a fresh reader

**Problem:** `spec-implementation-orchestrator` (and any other actor that reads tasks cold, without having been the one that authored them) is instructed to call `mcp__rig__update_task_item`/`mcp__rig__update_definition_of_done_item` with the row's real database `id` to check items off as work completes. But the only read path available to such a caller — `mcp__rig__render_document(stage: "tasks", ...)` — returns markdown only, showing each item's display label (`item_id`, e.g. `"1"`, `"1.1"`) and never its underlying UUID primary key. `mcp__rig__get_spec` only returns per-component `tasksDocs` summaries, not individual task items. There is no `list_task_items`/`get_task_item`-style tool in the `mcp__rig__*` surface either.

Confirmed by probing `update_task_item` with `id: "1"` (the display label) — it fails server-side with `invalid input syntax for type uuid: "1"`, proving the real ids are opaque UUIDs the caller has no supported way to look up. The only workaround found was querying `spec_pipeline.task_items`/`spec_pipeline.definition_of_done_items` directly over the Postgres connection used by `docker-compose.yml`'s `postgres` service — which works, but requires DB access and schema knowledge that a tool-scoped MCP client shouldn't need.

Hit while running `/spec-implementation-orchestrator` on the `workspace-based-project-binding` spec (2026-07-19).

**Proposal:**
- Have `render_document`'s tasks-stage markdown include each item's real `id` (e.g. as an HTML comment or a trailing inline code span next to the display label), so a caller can round-trip label → id without a side channel.
- And/or add a lightweight `list_task_items(specId, component)` (and equivalent for Definition of Done items) read tool that returns structured rows (`id`, `item_id`, `title`, `isChecked`, `parentItemId`) — mirroring what `add_task_item` already returns to its caller at creation time, just made available to a *different* later caller too.
- Either fix removes the need for any orchestrator-style actor to fall back on raw SQL against `spec_pipeline.task_items`/`definition_of_done_items`.

---
## `spec.currentStage` is a dead column that never reflects real progress

**Problem:** `get_spec` returns a top-level `currentStage` field (`spec_pipeline.specs.current_stage`) that is read in `spec-repository.ts`'s row-mapping code but never written anywhere after spec creation — no INSERT/UPDATE in the file touches it once the spec exists. It sits permanently at its creation-time default (`"requirements"`), even after requirements, design, and every tasks component have been approved and implementation has fully run.

Confirmed on the `workspace-based-project-binding` spec (2026-07-19): `currentStage` read `"requirements"` while `stages` showed requirements/design `approved` and all 5 `tasksDocs` components `approved`, with every task item in every component checked `[x]` and the corresponding implementation actually present on disk.

**Proposal:**
- Either derive `currentStage` at read time from the same logic `get_next_stage` already uses (cheapest, guaranteed consistent), or
- Write `current_stage` alongside every `finalizeStage`/`approveStage`/`denyStage` transition so the stored column stays truthful.
- Prefer the derived-at-read-time approach — a second source of truth for the same fact is how this drifted in the first place.

---
## The `tasks` stage's `spec_stages` row never advances, even when every component is approved

**Problem:** `spec_pipeline.spec_stages` has one row per spec per stage (`requirements`, `design`, `tasks`), and `get_spec`'s `stages` array surfaces its `status` for each. For `requirements`/`design`, `finalizeStage`/`transitionStageStatus` correctly update that row (`not_started` → `in_review` → `approved`/back to `not_started` on deny). But the `tasks` branch of both functions operates entirely on the per-component `spec_pipeline.tasks_docs.status` rows instead, and never touches the generic `spec_stages` row for `stage_name = 'tasks'`. That row is therefore stuck at `not_started` forever, no matter how many (or how few) components are actually approved.

Confirmed on the `workspace-based-project-binding` spec (2026-07-19): `stages` reported `tasks: not_started` while all 5 `tasksDocs` components read `approved` and `get_next_stage` (which correctly reads `tasks_docs` directly) reported `actionableStage: null`. The `stages[tasks].status` field is effectively vestigial — nothing consumes it correctly except by accident, since the real signal lives in `tasksDocs`.

**Proposal:**
- Either compute the `tasks` entry in `get_spec`'s `stages` array from the same `tasksApproved` logic `get_next_stage` already uses (all `tasks_docs` rows for the spec are `approved`) rather than reading the unused `spec_stages` row, or
- Retire the `spec_stages` row for `stage_name = 'tasks'` entirely if it serves no other purpose, to avoid a second, silently-wrong source of truth alongside `tasks_docs`.
- This and the `currentStage` issue above share the same root cause (a summary field computed once and never kept in sync with the per-component/per-item rows that are the actual source of truth) and may be worth fixing together.
