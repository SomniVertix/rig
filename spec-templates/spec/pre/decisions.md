# Grilling Session: ai-spec-template-development

- Session name: ai-spec-template-development
- Start date: 2026-07-12T22:03:36.856462+00:00
- Last updated date: 2026-07-13T01:05:15.089444+00:00
- Status: complete

## Initial Prompt

```text
/grilling I want your help building a set of template documents for an AI to build off of when creating a spec
```

## Decisions

_Record resolved questions and decisions here as the interview progresses._

### Q1: What kind of specs are these templates for?
- **Resolution:** Software feature/technical specs (the kind an engineering team writes before implementing a feature) — not PRDs, API specs, or RFCs.
- **Rationale:** Fits the dev-tooling context; most common use case for "AI drafts a spec before building."

### Q2: Structure of the work
- **Resolution:** Split into two distinct parts: (A) spec creation — the process/templates for producing a spec, and (B) spec consumption — how a (possibly different) AI reads and builds off the finished spec. These will be designed separately since their needs differ.

### Q3: Is the consuming AI a cold session or the same session that authored the spec?
- **Resolution:** Design for the cold-start case — a fresh AI session with zero prior context must be able to correctly implement from the spec alone.
- **Rationale:** Harder constraint that degrades gracefully to the warm/same-session case; spec must be fully self-contained (no implicit "as discussed above" context).

### Q4: What does a "spec" consist of, and how does consumption work?
- **Resolution:** A spec is decomposed into three sequential stage documents: **requirements**, **design**, and **tasks**. Each stage produces its own separate document. Stages are sequential (requirements -> design -> tasks) but each stage may be executed by a completely different agent with a clean (cold) context. The combination of the three documents together IS "the spec." Once all three are complete, the whole spec is handed off to yet another clean-context agent for implementation.
- **Rationale:** Matches the cold-start requirement from Q3 — every stage boundary is itself a context handoff, so each document must be self-contained enough for a fresh agent to pick up without the prior conversation.

### Q5: Where do the three stage documents live?
- **Resolution:** `.relentless/specs/<feature-slug>/` in the current workspace directory, containing `requirements.md`, `design.md`, `tasks.md` (one folder per spec, grouping all three stage docs together).
- **Rationale:** Predictable, discoverable location so a cold-context agent can find "the spec" for a feature without being told exactly where it lives. Confirms `.relentless/` is this project's convention root (already used for grilling `specs/`).

### Q6: Does the session skill write requirements.md directly, or hand off to a separate step?
- **Resolution:** Session-type skills (e.g. `grilling`) only ever produce a `decisions.md`. A separate downstream step in the spec workflow reads that `decisions.md` and produces the formal `requirements.md`.
- **Rationale:** Keeps the interactive interview mechanism (session skills) decoupled from spec-document authoring; `decisions.md` is the raw input artifact, `requirements.md` is the compiled/formal output artifact.

### Q7: Is the decisions.md -> requirements.md compile step interactive or mechanical?
- **Resolution:** Mostly mechanical (reformats decisions.md into proper requirements structure — user stories / acceptance criteria / non-goals) with permission to flag gaps back to the user rather than silently inventing answers when something required is missing from the decisions log.
- **Rationale:** Keeps the step fast and non-interactive in the common case while remaining safe against silently fabricated requirements.

### Q8: Acceptance criteria format in requirements.md
- **Resolution:** EARS notation for acceptance criteria, with these countermeasures baked into the template to offset EARS's known drawbacks:
  1. Group EARS criteria under each user story (not one flat list) — preserves big-picture legibility.
  2. Each user story gets a short plain-prose rationale, so intent/why lives at the story level even though individual criteria are strict.
  3. Use EARS's full pattern set (ubiquitous, event-driven, state-driven, unwanted-behavior, complex) rather than only "WHEN...SHALL," so sequencing/multi-condition cases have a proper home instead of ad hoc chaining.
  4. Non-functional requirements must include measurable thresholds (e.g. "WHILE under 1000 concurrent users, THE SYSTEM SHALL respond within 200ms"); unmeasurable ones get rejected during the compile step.
  5. Explicit non-goals section so absence-of-coverage is at least deliberate where considered.

### Q9: Full section list for requirements.md
- **Resolution:**
  1. Overview — 2-4 sentence plain-prose summary of the feature and its purpose.
  2. User Stories — each with a short rationale, then EARS acceptance criteria grouped underneath.
  3. Non-Goals — explicitly out of scope.
  4. Assumptions / Open Questions — gaps the compile step flagged rather than silently dropped (per Q7), surfaced for downstream stages or a human to resolve.
  5. Glossary — domain terms introduced, if any (may link out to the `domain-modeling` skill rather than duplicate).

### Q10: How do the design and tasks stages get authored?
- **Resolution:** The requirements stage (via the session-type `grilling` skill) is the LAST point of deep human interaction in the pipeline. Every stage after that — design, tasks, and implementation — is autonomous AI work. The human's only involvement in those later stages is a quick approve/deny review gate at the end of each stage, not an interview.
- **Rationale:** User wants human interaction concentrated at the front (requirements gathering via grilling) rather than repeated interviews at every stage; downstream stages should be fast, AI-driven drafting passes gated by lightweight human approval.

### Q11: What happens when the human denies at a review gate?
- **Resolution:** Deny includes a short freeform reason (one or two sentences, not a Q&A interview). The AI redrafts that stage's document incorporating the feedback, then re-presents it for approval.
- **Rationale:** Preserves the "no interview past requirements" constraint (Q10) while still giving the AI enough signal to actually fix the problem, rather than blind retries or dumping manual editing on the human.

### Q12: Full section list for design.md
- **Resolution:**
  1. Overview — approach summary in plain prose, referencing which requirements it addresses.
  2. Architecture — components/modules involved and how they interact.
  3. Data Model / Interfaces — schemas, types, API contracts, concrete enough to implement against directly.
  4. Requirement Traceability — explicit mapping of each user story/requirement to the design element that satisfies it, so nothing is silently dropped between stages.
  5. Alternatives Considered — options weighed and rejected, with why (substitutes for the missing interview transcript at this stage).
  6. Open Risks / Tradeoffs — known weaknesses or deferred concerns, surfaced rather than hidden.

### Q13: tasks.md additions beyond the base task list
- **Resolution:** Two additions to the tasks.md structure:
  1. A mandatory **Order** section defining the execution order of tasks, explicitly identifying which tasks can run concurrently without risk of conflicting changes — required so concurrent agents can be run efficiently against the task list.
  2. A **suggested agent** field on each task (and possibly subtasks), naming which agent type is best suited to complete it. The tasks-authoring agent takes inventory of the agents it currently has access to and assigns the best-suited one per task; if none fits, the field is set to `none` and the implementing agent falls back to its default agent.
- **Rationale:** Enables efficient concurrent execution during implementation and routes each task to the most capable agent available, rather than treating implementation as one undifferentiated agent doing everything serially.

### Q14: Format of the Order section
- **Resolution:** Precomputed concurrency waves/batches (e.g. "Batch 1: tasks 2, 3, 5 — safe in parallel; Batch 2: task 4 — depends on 2"), computed by the tasks-authoring agent — not a raw dependency graph left for the implementer to resolve.
- **Rationale:** Centralizes conflict analysis (which files/modules each task touches) at the point with the most context (tasks-authoring agent has just read the full design.md); makes the section directly actionable for an orchestrator with zero additional inference.

### Q15: Per-task field schema in tasks.md
- **Resolution:** Each task has: ID (stable identifier referenced by Order section and other tasks' dependencies), Description, Traceability (requirement(s) + design section(s) it implements), Files/areas touched (auditable basis for the wave-conflict analysis in Q14), Suggested agent (per Q13), Depends on (explicit task-ID list — the raw edges the Order section's waves were computed from, kept for single-task inspection), Acceptance check (derived from relevant EARS criteria/design details).
- **Rationale:** Completes the traceability chain from requirements through design into concrete, independently-inspectable, conflict-auditable units of work.

Also confirmed (uncontested carryover from the original Tasks-stage proposal): tasks.md includes a top-level **Definition of Done** checklist for the whole spec (tests pass, all tasks checked off, no open risks from design.md left unaddressed).

### Q16: How does an agent know which stage to run next?
- **Resolution:** A single entry-point mechanism inspects `.relentless/specs/<feature-slug>/` and infers pipeline state, always doing "the next correct thing" when invoked repeatedly. Advancing to the next stage requires the current stage's document to be in `approved` status (Q11 gate) — an unapproved document blocks progression.
- Approval state is tracked via a separate `.relentless/specs/<slug>/status.json` (not frontmatter embedded in each doc) — e.g. `{"stage": "design", "requirements": "approved", "design": "in_review", "tasks": "not_started"}`.
- **Rationale:** Keeps the markdown stage docs as pure, standalone-readable content with no pipeline metadata mixed in; gives the entry-point skill one small file to check instead of parsing frontmatter out of three separate docs.

### Q17: Implementation handoff — single agent vs orchestrator
- **Resolution:** Orchestrator pattern. The implementer reads tasks.md and, for each batch in the Order section, dispatches all tasks in that batch concurrently as subagents (per the suggested-agent field, or itself if `none`), waits for the batch to complete, then proceeds to the next batch — repeating until the Definition of Done is satisfied.
- **Rationale:** Anything less (serial single-agent execution ignoring suggested-agent/batching) would make the Q13/Q14 design investment pointless. The orchestrator just mechanically follows the precomputed plan rather than needing its own judgment.

### Q18: Delivery mechanism — CORRECTED
- **Resolution:** NOT built as executable Claude Code skills in this pass. Instead, deliver as a set of documents: (1) one umbrella document explaining the entire spec template system and its workflows (pipeline stages, gates, status tracking, orchestration), and (2) one template document per artifact (requirements.md template, design.md template, tasks.md template) that an AI fills in when authoring a spec.
- **Rationale:** Matches the original request scope ("template documents for an AI to build off of when creating a spec") — the deliverable is documentation/templates, not implemented skill logic. (Supersedes the skills-based breakdown proposed as the initial Q18 recommendation.)

### Q19: Umbrella doc scope — process instructions included
- **Resolution:** The umbrella document includes process instructions (how an AI should behave at each stage — which template to use, what gate to check, what to do on deny, how to compute Order waves, etc.), not just a descriptive overview of file layout. The three per-artifact template documents stay narrower: target structure only, with inline placeholder guidance, no process logic.
- **Rationale:** Consistent with the cold-start principle (Q3) — an AI reading the umbrella doc cold must know exactly what to do at each stage, not just what the system looks like.

### Q20: Where do the umbrella doc + templates live?
- **Resolution:** Templates (umbrella doc + 3 per-artifact templates) live in the `relentless` project root itself (checked-in project assets), NOT under `.relentless/`. `.relentless/` is reserved for runtime/workspace state only: sessions (`.relentless/specs/`) and generated spec instances (`.relentless/specs/<feature-slug>/requirements.md`, `design.md`, `tasks.md`, per Q5). Templates are the source an agent copies/reads from; `.relentless/specs/...` is where the real, filled-in spec gets generated at runtime.

### Q21: Exact template folder/file naming
- **Resolution:**
```
relentless/
  templates/
    spec/
      README.md                  (umbrella document)
      requirements.template.md
      design.template.md
      tasks.template.md
```

### Q22: Is decisions.md retained after compiling requirements.md?
- **Resolution:** Retained. `decisions.md` (from the grilling session) is copied/moved into `.relentless/specs/<feature-slug>/decisions.md` alongside the three stage docs, as a provenance record. Never read by downstream stages (design/tasks/implementation only read the compiled docs) — it exists purely for human/audit traceability of *why* a requirement exists.
- **Rationale:** Consistent with the cold-start/auditability theme already present in design.md's "Alternatives Considered" and the compile step's "flag gaps rather than invent" behavior — discarding the one artifact that captures human rationale in their own words would contradict that theme.

### Q23: How is <feature-slug> derived?
- **Resolution:** Auto-derived as a short kebab-case slug from the feature's working title/idea as stated at the start of the interview (e.g. "dark mode toggle" -> `dark-mode-toggle`), sanitized to filesystem-safe characters, with a numeric suffix (`-2`, `-3`, ...) appended on collision with an existing folder under `.relentless/specs/`.
- **Rationale:** Mirrors the existing collision-avoidance convention already used for grilling session names.

### Q24: How do autonomous stages (design/tasks) surface insufficient-upstream-info concerns?
- **Resolution:** A new, dedicated **Flags** section is added to both `design.md` and `tasks.md` (additive to design.md's existing "Alternatives Considered"/"Open Risks / Tradeoffs" from Q12, and new to tasks.md, which had no equivalent section before). The autonomous stage AI always drafts its best-effort output and records any concerns/gaps/assumptions it hit while creating the document in this Flags section, rather than halting outside the approve/deny gate. The human reviews Flags as part of that stage's approve/deny review.
- **Rationale:** Resolves the "insufficient upstream info" edge case without violating the no-interview-past-requirements rule (Q10) — the approve/deny gate (Q11) remains the sole checkpoint, and Flags is the explicit, reviewable surface for concerns rather than silent guessing or an out-of-band blocking question. Distinct from "Open Risks / Tradeoffs" in design.md, which covers deliberate, known tradeoffs in the chosen approach rather than gaps/uncertainty from missing upstream information.

## Terminology

_Definitions of terms introduced during this session._

- **Session skill (skill type: `session`):** A skill that takes over the active agent session and usually functions as the detailed information-gathering step for an upcoming spec (e.g. `grilling`). The requirements stage happens directly after a session-type skill runs.
