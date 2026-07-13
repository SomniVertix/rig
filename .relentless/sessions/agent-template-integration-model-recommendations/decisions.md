# Grilling Session: agent-template-integration-model-recommendations

- Session name: agent-template-integration-model-recommendations
- Start date: 2026-07-13T02:07:05.426681+00:00
- Last updated date: 2026-07-13T02:07:05.426681+00:00
- Status: active

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
