# Grilling Session: agent-template-integration-model-recommendations

- Session name: agent-template-integration-model-recommendations
- Start date: 2026-07-13T02:07:05.426681+00:00
- Last updated date: 2026-07-13T03:00:00.000000+00:00
- Status: complete

## Initial Prompt

```text
/grilling lets build a set of agents to work alongside the spec template documents that we just made. I want specialized agents to handle each of these tasks. I also want you to recommend models that these agents should use based on what they're doing
```

## Decisions

_Record resolved questions and decisions here as the interview progresses._

### Q1: What exactly should "an agent" mean in this deliverable?
- **Resolution:** Real Claude Code subagents (`.claude/agents/*.md`-style files: frontmatter with name/description/tools/model plus a system-prompt body), not just documentation and not skills. Directly invokable via the Agent tool and referenceable by name in tasks.md's Suggested agent field.
- **Additional note:** Place them in the current working directory (not live-deployed to `.claude/agents/`) so the user can review before activating them.

### Q2: Where should the staged agent definition files live for review?
- **Resolution:** `spec-templates/agents/` — nested under the existing spec-templates folder, since these agents exist specifically to work the spec pipeline. User will manually copy/move approved ones into `.claude/agents/` to activate.

### Q3: Which pipeline stages should get a dedicated specialized agent?
- **Resolution:** All four: `requirements-compiler`, `design-drafter`, `tasks-drafter`, `spec-implementation-orchestrator` — one per autonomous/mechanical step defined in spec-templates/spec/README.md. Grilling (Stage 0) stays a skill, not an agent, since it's an interactive human interview.

### Q4: Should status.json routing be a separate 5th agent, or built into each of the 4 stage agents?
- **Resolution:** Built into each agent. No separate router/dispatcher agent. Each stage agent checks status.json on invocation, verifies its own precondition (e.g. design-drafter requires requirements: approved), and refuses/no-ops with a clear message if not met.
- **Rationale:** Avoids a coordination layer that's really just an if-statement; keeps each agent self-sufficient for cold-context invocation, consistent with the pipeline's cold-start philosophy.

### Q5: How should requirements-compiler handle missing info from decisions.md, given a subagent can't interactively ask the human mid-task?
- **Resolution:** Draft with inline flags. requirements-compiler always writes requirements.md, best-effort, recording any gap in the Assumptions / Open Questions section instead of halting.
- **Rationale:** Subagents invoked via the Agent tool run non-interactively and return one final message — they cannot pause for a human Q&A turn. This makes requirements-compiler consistent with the best-effort-and-flag pattern design-drafter/tasks-drafter already use.
- **Follow-up:** This supersedes spec-templates/spec/README.md Stage 1 wording ("stop and ask the human directly for that one piece of missing information, then continue") — README needs a corresponding edit when agents are built.

### Q6: What tool access should requirements-compiler have?
- **Resolution:** Read, Write, Edit, Glob, Grep. Grep included so it can lightly verify decisions.md references against existing code/patterns if needed. No Bash, no broad codebase exploration beyond that — this stage is primarily a reformat of decisions.md.

### Q7: What tool access should design-drafter have?
- **Resolution:** Read, Grep, Glob, Bash, Write, Edit, Agent. Full codebase exploration plus Bash for structural checks (package manifests, directory trees). Agent tool included so it can spawn an Explore subagent for large/unfamiliar codebases, keeping its own context focused on synthesis rather than raw searching.

### Q8: What tool access should tasks-drafter have?
- **Resolution:** Read, Write, Edit, Glob, Grep, Bash, Agent. Bash for reliably enumerating installed agent definitions and inspecting real file layout for wave/conflict analysis. Agent tool for spawning an Explore subagent on large designs touching many unfamiliar areas.

### Q9: What tool access should spec-implementation-orchestrator have?
- **Resolution:** Read, Agent, Edit, Bash, TodoWrite, Grep, Glob. Agent for wave dispatch (core function), Edit for status.json/tasks.md checkbox updates, Bash for running tests/build to verify Definition of Done, TodoWrite for wave-by-wave progress tracking, Grep/Glob so the orchestrator can independently verify files/areas touched match what a dispatched task claimed.

### Q10: Which model should requirements-compiler use?
- **Resolution:** Sonnet. Balanced choice: reliable structured reformatting and EARS notation without Opus's cost/latency; this document is foundational to the whole pipeline so Haiku's sloppy-output risk isn't worth the savings.

### Q11: Which model should design-drafter use?
- **Resolution:** Opus. Highest-stakes autonomous stage — real architectural decisions and alternatives weighed, must be grounded in actual code with no human in the loop until the approve/deny gate. Worth the extra cost/latency.

### Q12: Which model should tasks-drafter use?
- **Resolution:** Sonnet. Strong enough for correct dependency-graph/wave analysis; less creative judgment than design-drafter — more about careful, correct decomposition, which Sonnet handles well.

### Q13: Which model should spec-implementation-orchestrator use?
- **Resolution:** Haiku. Fast/cheap dispatch loop — README explicitly frames this stage as needing no deep judgment since all the hard reasoning already happened in tasks-drafter's wave computation.

### Q14: Should spec-templates/spec/README.md be updated now to reference the new agents by name and fix the Q5 inconsistency?
- **Resolution:** No. Leave README as-is for this session; scope stays limited to the new agent files. README update (including the Q5 Stage-1 wording fix) is deferred to a later pass.

### Q15: Should this session also build implementation-task specialist agents, or stop at the 4 pipeline-stage agents?
- **Resolution:** Also add implementation specialists (expands scope beyond the 4 pipeline agents).

### Q16: What set of implementation specialist agents should be added?
- **Resolution:** Three: `code-implementer`, `test-writer`, `code-reviewer`. Lean, stack-agnostic split covering implement → test → verify, since spec-templates/ is meant to be reusable across project types rather than tied to one stack.

### Q17: How does code-reviewer get invoked?
- **Resolution:** Per-task, assigned by tasks-drafter like any other Suggested-agent choice — not automatically run by the orchestrator after every wave. Keeps spec-implementation-orchestrator purely mechanical (no judgment calls about when review is warranted); tasks-drafter decides review granularity per task/wave based on actual risk.

### Q18: What tool access should code-implementer have?
- **Resolution:** Read, Write, Edit, Bash, Grep, Glob, Agent. Standard implementation toolkit plus Agent tool for spawning an Explore subagent on tasks needing unfamiliar-codebase search before editing.

### Q19: Which model should code-implementer use?
- **Resolution:** Sonnet. Tuned for general coding work — the bulk of implementation tasks. Opus is overhead for routine changes; Haiku risks quality on nontrivial ones.

### Q20: What tool access should test-writer have?
- **Resolution:** Read, Write, Edit, Bash, Grep, Glob. Bash included so it can run the tests it writes and confirm they pass/fail as expected rather than authoring them blind.

### Q21: Which model should test-writer use?
- **Resolution:** Haiku. Cheaper/faster — treat test-writing as comparatively mechanical, especially for straightforward acceptance checks.

### Q22: What tool access should code-reviewer have?
- **Resolution:** Read, Grep, Glob, Bash, ReportFindings. No Write/Edit — a reviewer inspects and runs verification (tests/lint) but never modifies the code it's reviewing. Uses the environment's purpose-built ReportFindings tool for structured, severity-ranked output instead of prose.

### Q23: Which model should code-reviewer use?
- **Resolution:** Sonnet. Catching real bugs and judging acceptance-criteria compliance needs more than Haiku, but doesn't require Opus-level architectural judgment.

### Q24: Should agent descriptions support auto-invocation, or be manual-only?
- **Resolution:** All manual-only. Every one of the 7 agents requires explicit invocation by name — no auto-triggering, to keep behavior fully predictable and avoid surprise invocations (e.g. tasks-drafter firing on an unrelated mention of "tasks").
