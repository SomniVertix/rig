# Spec Pipeline Agents

Seven Claude Code subagent definitions that work alongside `spec-templates/spec/` — see
`spec-templates/spec/README.md` for the pipeline they implement. These files are **staged
here for review, not live**. To activate one, copy it into `.claude/agents/` in the target
project.

All seven are **manual-only**: none is written to auto-trigger from context. You (or an
orchestrator) invoke them explicitly by name.

## Pipeline-stage agents

One per autonomous/mechanical step in the spec pipeline. Each checks its own precondition
against `.relentless/specs/<slug>/status.json` before acting — there is no separate
router/dispatcher agent.

| Agent | Stage | Reads | Writes | Model | Why this model |
|---|---|---|---|---|---|
| `requirements-compiler` | 1 | `decisions.md` | `requirements.md` | Sonnet | Reliable structured reformatting (EARS notation) on a foundational document; Opus is overkill, Haiku risks sloppy output. |
| `design-drafter` | 2 | `requirements.md` + codebase | `design.md` | Opus | Highest-stakes stage — real architectural decisions and alternatives, no human in the loop until approve/deny. Worth the cost. |
| `tasks-drafter` | 3 | `design.md` | `tasks.md` | Sonnet | Correctness-critical linear decomposition and execution ordering; more careful decomposition than creative judgment. |
| `spec-implementation-orchestrator` | 4 | `tasks.md` | executes ordered checklist (linear or parallel-schema mode) | Haiku | Purely mechanical dispatch loop — all the hard reasoning already happened in `tasks-drafter`'s ordering and parallel grouping. |

Each drafting agent (`requirements-compiler`, `design-drafter`, `tasks-drafter`) never halts
mid-task to ask the human a clarifying question — subagents invoked via the Agent tool
return a single final message and can't hold a back-and-forth. Instead, each drafts
best-effort and records any gap inline (Assumptions / Open Questions, or Flags) for the
human to see at that stage's approve/deny review. **Note:** this means
`spec-templates/spec/README.md`'s Stage 1 text ("stop and ask the human directly") is now
stale and should be updated to match when convenient — not yet done, tracked as a follow-up.

## Implementation specialists

Dispatched by `spec-implementation-orchestrator` per-task, according to the `Suggested
agent` field `tasks-drafter` assigned — never auto-run. Generic, stack-agnostic roles so
they hold up across projects.

| Agent | Role | Tools include | Model | Why this model |
|---|---|---|---|---|
| `code-implementer` | Implements a task, staying within its declared Files/areas touched | Write/Edit/Bash | Sonnet | General coding work — Sonnet's sweet spot. |
| `test-writer` | Writes/updates and runs tests proving a task's Acceptance check | Write/Edit/Bash | Haiku | Comparatively mechanical for most acceptance checks. |
| `code-reviewer` | Independent verification pass, no code changes | Read-only + Bash + `ReportFindings` | Sonnet | Needs real bug-catching judgment; not the pipeline's highest-stakes stage. |

`code-reviewer` is opt-in per task — `tasks-drafter` assigns it explicitly to tasks/subtasks
that warrant a verification pass; the orchestrator does not run it automatically for every
task.

## Activating an agent

```
cp spec-templates/agents/<name>.md .claude/agents/<name>.md
```

Each file's frontmatter (`name`, `description`, `tools`, `model`) and body are ready to use
as-is — nothing else to fill in.
