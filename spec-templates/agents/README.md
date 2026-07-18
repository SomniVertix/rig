# Spec Pipeline Agents

Seven Claude Code agent definitions that work alongside `spec-templates/spec/` — see
`spec-templates/spec/README.md` for the pipeline they implement. These files are the
**authoring/staging source of truth**, kept here for reviewable history in this repo's git —
they are not live and the relentless server never reads this directory directly. To deploy
one, copy it into `~/.claude/skills/<name>/SKILL.md`, converting frontmatter per "Deploying
an agent" below. The relentless server's `known_actors` registry (Story 11.5's boot sync)
scans that skills directory, not this one — see
`packages/server/src/mcp/guardrails/actor-registry.ts`.

`grilling`, the interview skill that resolves decisions into a grilling session before a
spec exists, already lives at `~/.claude/skills/grilling/SKILL.md` and needs no counterpart
here — it's registered as a known actor the same way every other skill is, by the directory
scan.

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
| `requirements-compiler` | 1 | the spec's linked trail via `mcp__relentless__get_trail_by_spec` — reached waypoints as the decisions transcript, bypassed waypoints as out-of-scope rulings, trail terms as glossary (nothing is handed in-context) | requirements, via `mcp__relentless__*` | Sonnet | Reliable structured reformatting (EARS notation) on a foundational document; Opus is overkill, Haiku risks sloppy output. |
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

## Deploying an agent

Copy each `<name>.md` here into `~/.claude/skills/<name>/SKILL.md` (skills are always named
`SKILL.md`, inside a directory named after the skill). This is a global, user-level location,
not project-scoped like the old `.claude/agents/` copy step was — each agent already gates on
`mcp__relentless__get_spec`/stage-approval preconditions in its own body before acting, so
cross-project accidental triggering is self-limiting.

**Deploying to `~/.claude/skills/` alone does not register the agent as a known actor.**
Agents and Claude Code skills are separate concepts — the relentless server's boot sync
(`syncKnownActorsFromActorsDirectory`, `packages/server/src/mcp/guardrails/actor-registry.ts`)
scans a curated `relentless-actors` directory, not the general skills directory, so that
unrelated personal skills never become valid actors just by being installed. To finish
deploying an agent, also symlink it into that curated directory (a relative symlink, so it
survives Docker's bind-mount boundary — see `docker-compose.yml`):

```
ln -s ../skills/<name> ~/.claude/relentless-actors/<name>
```

This applies to every one of the seven agents below, plus the discovery-stage skills that
write directly to relentless (`grilling`, and `wayfinder` if present) even though those
aren't "agents" in the subagent-definition sense.

The frontmatter needs converting — subagents (`tools:`, `model:`) and skills
(`allowed-tools:`, `context:`, `agent:`, `model:`) aren't quite the same shape:

| Agent | `allowed-tools:` | `context:` / `agent:` | `model:` |
|---|---|---|---|
| `requirements-compiler` | same list as `tools:` here | — (manual-only, runs inline) | sonnet |
| `design-drafter` | same list, **keep `Agent`** (still spawns the built-in `Explore` subagent type exactly as before) | — | opus |
| `tasks-drafter` | same list, **keep `Agent`** (same reasoning) | — | sonnet |
| `spec-implementation-orchestrator` | swap `Agent` → `Skill`; dispatch `code-implementer`/`test-writer`/`code-reviewer` via `Skill(skill: <name>)` instead of `Agent(subagent_type: <name>)` | — (stays inline to keep its own `TodoWrite` state across dispatches) | haiku |
| `code-implementer` | same list minus `Agent` | `context: fork`, `agent: general-purpose` | sonnet |
| `test-writer` | same list | `context: fork`, `agent: general-purpose` | haiku |
| `code-reviewer` | same list | `context: fork`, `agent: general-purpose` (the base type doesn't itself restrict the toolset — `allowed-tools` is what enforces "no Write/Edit") | sonnet |

One confirmed behavior change from the migration: `code-implementer`/`test-writer`/
`code-reviewer` dispatches via `Skill(context: fork)` run **sequentially**, not concurrently
— unlike the old `Agent`-tool parallel/background dispatch. `spec-implementation-orchestrator`
still executes tasks within a "parallel" batch one at a time; only the checklist-state
bookkeeping is unaffected, not the wall-clock speed-up.
