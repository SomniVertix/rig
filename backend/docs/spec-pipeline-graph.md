# Spec Pipeline → Neo4j Graph Migration — Decisions

Trailhead prompt: Build the graph implementation/translation of the spec pipeline — move spec and spec-artifact storage from Postgres (v1) to the Neo4j graph model (v2), with bounded schema/constraint rules analogous to the expedition port. Key open threads from the ask: promotion rules between specs, open-questions (formerly "flags") handling, what triggers a stage rebuild from review feedback, and a schema/constraint for atomic (vs. sprawling) tasks.

Grounding (from codebase research):
- v1 Postgres source of truth: `v1/spec-templates/spec/db/schema.sql` (PART 1, lines 256-871), business logic in `v1/packages/persistence/src/spec-repository.ts`.
- v2 already ported trails/waypoints → Expedition/Waypoint in Neo4j: `v2/internal/graph/store/neo4jstore/neo4jstore.go` (EnsureSchema, lines 94-195), domain types in `v2/internal/graph/domain/`.
- v2 spec tools are stubs today: `v2/internal/graph/mcpserver/specstubs.go`.
- v2's `.meta/spec/README.md` describes the target pipeline contract but is stale (still describes Postgres/TS server).

---

## Decisions

### 1. Fresh cutover, no data migration
**Q:** Is this a real Postgres→Neo4j data migration (ETL of existing specs), or a fresh cutover with no carryover, matching how the expedition/waypoint port was done (wiped DB, greenfield)?
**A:** Fresh cutover. No data carryover from v1 Postgres. New specs start fresh in v2's Neo4j graph; existing v1 spec data is left behind.

### 2. "Promotion" means stage-to-stage advancement, not spec-to-spec linking
**Q:** What does "promotion from one spec to another" mean?
**A:** Clarified — it means the pipeline's stage promotion: trail → spec, requirements → design, design → tasks, tasks → implementation. Not a relationship between two distinct spec entities. (Initial guesses offered — spec spurring a new spec, spec superseding a prior spec, draft→tracked maturity gate — were all off; user meant standard stage advancement.)

### 3. 1:1 stage-container rows fold into :Spec node properties, field-by-field (not a markdown blob)
**Q:** Postgres has 1:1-per-spec tables (`requirements`, `designs`) holding just overview/architecture text, alongside real multi-row tables. Fold these into :Spec node properties, or keep them as their own 1:1 node labels mirroring Postgres?
**A:** Fold into :Spec node properties — no separate :Requirements/:Design nodes. But each distinct field/section must remain its own typed property (e.g. `requirementsOverview`, `designOverview`, `designArchitecture` as separate properties) — explicitly NOT a single `body` property holding a dumped markdown blob. This same "typed fields, not a blob" principle applies to all other spec artifacts with clearly defined schemas, not just these two.

### 4. Every repeatable/addressable artifact becomes its own real graph node; only singleton text fields fold into :Spec
**Q:** Confirm: singleton per-spec overview/architecture text stays as :Spec properties (per decision 3); every repeatable, individually add/update/delete-able artifact (user stories, acceptance criteria, non-goals, open questions, glossary terms, design components, data model entries, traceability rows, alternatives, open risks, flags, tasks docs, task items, files touched, dependency edges, parallel batches/members, DoD items) becomes its own node label with stable id and relationships — forced by (a) Neo4j properties can't hold lists of objects, and (b) the existing tool contract already needs per-item add/update/delete by ID.
**A:** Confirmed. Additional requirement: constraints must be enforced strictly on BOTH sides — Neo4j schema constraints (uniqueness, required properties, etc.) AND application-code validation — and the shape (property set) of each node label must be kept consistent/uniform across instances, not ad hoc per call site.

### 5. Unify requirements' assumptions/open-questions + design_flags + tasks_flags into one :OpenQuestion node label
**Q:** v1 has three separate flag-like concepts with no resolution lifecycle at all (assumptions_open_questions at requirements stage, design_flags, tasks_flags). Unify into one :OpenQuestion node label reused across stages, or keep three distinct per-stage concepts?
**A:** Unify into one :OpenQuestion label, used at every stage (requirements/design/tasks), distinguished by a stage/raised-during property and a relationship to whatever it's attached to. One consistent shape, one set of tools (add/update/delete/resolve) reused across the pipeline.

### 6. Unresolved :OpenQuestion blocks BOTH finalize_stage and approve — behavior change from v1
**Q:** Should unresolved open questions block finalize_stage (agent submit), approve (human sign-off), or both?
**A:** Both. This is a deliberate behavior change from v1, where drafting agents were told to never halt and just record best-effort flags. Now: unresolved open questions block finalize_stage too.

### 7. Drafters halt entirely on a real gap — no more silent best-effort assumptions
**Q:** Given finalize_stage now blocks on open questions, what should a drafter (e.g. design-drafter) do when it hits a gap from an insufficient prior stage — self-resolve with a stated assumption and keep going, or halt completely and wait for a human answer?
**A:** Halt completely. If a drafter hits a real gap, it raises the :OpenQuestion and cannot finalize_stage at all — drafting stops and waits for a human to answer before the agent can proceed/finalize. No more silent "best-effort assumption, keep going" for gap-driven work. (Open follow-up: how the agent resumes after a human answers — see below.)

### 8. Resume-after-answer: fresh re-invocation reads full current state + answer, reconciles, then finishes
**Q:** After a human resolves the blocking open question, how does the halted drafter resume — purely additive (only add what was missing), full restart of the stage, or fresh re-invocation that reconciles?
**A:** Fresh re-invocation. The partial draft persists in the graph exactly as it was left. Re-running the same drafter agent means it reads all current state cold (same as any invocation) plus the newly resolved answer, revises any already-drafted content the answer contradicts, finishes the remaining work, and calls finalize_stage.

### 9. Deny stays destructive/non-versioned like v1 (no history snapshot)
**Q:** On stage deny, snapshot prior content as append-only history (like WaypointHistoryEntry), or stay destructive like v1 (status just resets, no versioning)?
**A:** Stay destructive like v1 — no history snapshot node type for denials. Confirmed against v1's actual behavior (`spec-repository.ts` `transitionStageStatus`, ~line 2876): deny does NOT delete the drafted content rows either — it only flips stage status back to `not_started` and stores `denied_at`/`last_denial_reason`. The existing content (user stories, components, etc.) is left in place in the graph for the redraft agent to revise via its normal add/update/delete tools when re-invoked — same reconciliation pattern as the answer-driven resume in decision 8, just triggered by a human deny instead of a raised open question.

### 10. Orphaned component tasks always block finalize — no silent deletion, even when empty
**Q:** v1's design→tasks redraft rule: an orphaned (component-removed) tasks_doc with zero items is silently deleted, one with content blocks finalize. Carry that over as-is, or always block regardless of content?
**A:** Always block, never silently delete. Removing a design component that has any associated :TasksDoc/task items — even an empty one — blocks design's finalize_stage until explicitly acknowledged/cleaned up. A behavior change from v1: no silent deletion path at all.

### 11. Task atomicity: researched Kiro CLI's actual system prompt for precedent
Before deciding task-atomicity constraints, researched how Kiro (AWS's spec-driven agent CLI) enforces this, per the user's request to mimic what works well there. Found via a leaked Kiro system prompt gist (https://gist.github.com/notdp/19822831b54190bd9c6b34f6b69fadeb) and kiro.dev docs:
- Max 2 levels of hierarchy: top-level tasks + decimal-numbered subtasks (1.1, 1.2), nothing deeper. Top-level items used "only when needed" — flat preferred.
- Mandatory granular requirement references per task — specific acceptance-criteria numbers (e.g. "1.1, 1.5, 3.2"), not just user-story-level references.
- Code-only scope with an explicit exclusion list: a task must be writable/modifiable/testable code; may NOT be UAT, deployment, docs/training, org changes, marketing, or manual e2e testing.
- No orphaned code — every task's output must be wired into the system by plan's end; no big complexity jumps between consecutive tasks.
- TDD-oriented ordering where appropriate.
This is combined with prior candidate ideas (cap files-touched per task, require non-empty concrete acceptance_check, cap title/description length) to form the final atomicity constraint set below.

### 12. Hard 2-level hierarchy cap on :TaskItem, replacing v1's unlimited nesting
**Q:** Adopt Kiro's hard 2-level cap (top-level task + decimal subtasks, nothing deeper), a higher depth cap, or a fan-out limit instead?
**A:** Hard 2-level cap, matching Kiro exactly. A :TaskItem may have a parent, but a subtask cannot itself have children — enforced as a graph constraint (reject add_task_item if its declared parent already has a parent). A task needing 3+ levels is a signal it should be split into multiple top-level tasks. Additional requirement: the tasks-drafter agent's own instructions/prompt must be updated so it default-frames its task breakdown to fit within this 2-level limit from the start, not discover the limit via rejected calls.

### 13. Traceability becomes a required real graph edge to :AcceptanceCriterion, not free text
**Q:** Replace v1's free-text `task_items.traceability` with a real relationship to specific :AcceptanceCriterion node(s), at least one required per task — matching Kiro's requirement to cite granular criteria numbers, not just story-level references?
**A:** Yes. New relationship, e.g. (:TaskItem)-[:SATISFIES]->(:AcceptanceCriterion), one or more per top-level task. `add_task_item` requires at least one target acceptance-criterion id; `finalize_stage` (tasks) rejects any top-level task item with zero SATISFIES edges. This makes traceability queryable/enforceable (walk from a criterion to every task implementing it) instead of a vague text blurb.

### 14. Hard cap of 5 files-touched per task item; code-only scope stays prompt guidance, not schema
**Q:** What files-touched cap, and does Kiro's code-only exclusion list (no UAT/deployment/docs/marketing/org-change tasks) become a schema-enforced field or stay prompt-level guidance?
**A:** Cap at 5 — `add_task_file_touched` rejects a 6th file for a single task item, a hard DB-enforced split signal. The code-only exclusion list is NOT a schema field (not mechanically checkable) — it's added to the tasks-drafter agent's instructions as explicit guidance instead.

### 15. Final task-atomicity constraint set (summary)
Combining decisions 12-14 plus v1's existing carryover rule, the full set of atomicity constraints for :TaskItem:
1. Max 2-level hierarchy (decision 12) — DB-enforced.
2. At least one required SATISFIES edge to a granular :AcceptanceCriterion per top-level task (decision 13) — DB-enforced at finalize_stage.
3. Max 5 :FileTouched per task item (decision 14) — DB-enforced.
4. Non-empty, concrete `acceptance_check` property required (carried over from v1's NOT NULL) — DB-enforced.
5. Code-only scope, no orphaned/unintegrated code, incremental/no-big-jumps ordering, TDD-oriented ordering where appropriate — all prompt-level guidance for the tasks-drafter agent, not schema constraints (inherently judgment-based).
