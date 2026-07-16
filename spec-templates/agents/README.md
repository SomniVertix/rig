# Spec Pipeline Agents

Seven Claude Code subagent definitions that work alongside `spec-templates/spec/` — see
`spec-templates/spec/README.md` for the pipeline they implement. These files are **staged
here for review, not live**. To activate one, copy it into `.claude/agents/` in the target
project.

All seven are **manual-only**: none is written to auto-trigger from context. You (or an
orchestrator) invoke them explicitly by name.

All spec data is managed entirely through the `relentless` MCP server
(`mcp__relentless__*` tools), never the local filesystem. There is no `.relentless/specs/`
directory, no `status.json`, no `requirements.md`/`design.md`/`tasks.md` — every read is
`get_spec` / `get_next_stage` / `render_document`, and every write is one of the typed
`add_*` / `update_*` / `delete_*` / `set_*` / `finalize_stage` tools.

## Pipeline-stage agents

One per autonomous/mechanical step in the spec pipeline. Each checks its own precondition
by calling `mcp__relentless__get_spec` before acting — there is no separate
router/dispatcher agent.

| Agent | Stage | Reads | Writes | Model | Why this model |
|---|---|---|---|---|---|
| `requirements-compiler` | 1 | decisions Q&A (in-context, handed in — no MCP tool stores it) | requirements, via `mcp__relentless__*` | Sonnet | Reliable structured reformatting (EARS notation) on a foundational document; Opus is overkill, Haiku risks sloppy output. |
| `design-drafter` | 2 | requirements (`render_document`) + codebase | design, via `mcp__relentless__*` | Opus | Highest-stakes stage — real architectural decisions and alternatives, no human in the loop until approve/deny. Worth the cost. |
| `tasks-drafter` | 3 | design (`render_document`) | tasks, via `mcp__relentless__*` | Sonnet | Correctness-critical linear decomposition and execution ordering; more careful decomposition than creative judgment. |
| `spec-implementation-orchestrator` | 4 | tasks (`render_document`) | task/DoD checkbox state, via `update_task_item`/`update_definition_of_done_item` | Haiku | Purely mechanical dispatch loop — all the hard reasoning already happened in `tasks-drafter`'s ordering and parallel grouping. |

Each drafting agent (`requirements-compiler`, `design-drafter`, `tasks-drafter`) never halts
mid-task to ask the human a clarifying question — subagents invoked via the Agent tool
return a single final message and can't hold a back-and-forth. Instead, each drafts
best-effort and records any gap inline (Assumptions / Open Questions, or Flags) for the
human to see at that stage's approve/deny review, via the corresponding
`add_assumption_open_question` / `add_design_flag` / `add_tasks_flag` tool call.

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
