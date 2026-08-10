# Missing MCP read tools block traceability lookups in the spec pipeline

## Status: investigated — fix is small, ready to implement

Original report below under "Background". This section is the actual fix plan,
written after reading the relevant code — it's smaller than the original
report guessed, because the store/service layers already fully support the
missing reads. Only the MCP transport (and one agent's tool grant) is
missing.

## Fix 1 — add `list_user_stories` and `list_acceptance_criteria` MCP tools

**The store and service layers already have this.** Confirmed in the code:

- `store.Store` interface (`internal/graph/store/store.go:384,390`) already
  declares `ListUserStories(ctx, specID)` and `ListAcceptanceCriteria(ctx, userStoryID)`.
- Both are fully implemented in `internal/graph/store/neo4jstore/requirements.go`
  (`ListUserStories` line 60, `ListAcceptanceCriteria` line 171).
- Both are wrapped one-to-one in `internal/graph/service/spec.go`:
  `Service.ListUserStories` (line 98) and `Service.ListAcceptanceCriteria`
  (line 118).

**What's missing is only the MCP registration**, in
`internal/graph/mcpserver/requirements.go`. That file already has
`registerRequirementsTools` registering `add_user_story`/`update_user_story`/
`delete_user_story` and the acceptance-criterion equivalents (lines 13-39) —
add two more tools to the same function, following the exact pattern
`listTasksDocs` uses in `internal/graph/mcpserver/tasks.go:128-136`:

```go
// in registerRequirementsTools, alongside the existing add/update/delete_user_story tools:
mcp.AddTool(server, &mcp.Tool{
	Name:        "list_user_stories",
	Description: "List a spec's user stories.",
}, listUserStories(svc))

// alongside the existing add/update/delete_acceptance_criterion tools:
mcp.AddTool(server, &mcp.Tool{
	Name:        "list_acceptance_criteria",
	Description: "List a user story's acceptance criteria.",
}, listAcceptanceCriteria(svc))
```

```go
type listUserStoriesOut struct {
	UserStories []userStoryOut `json:"userStories"`
}

func listUserStories(svc *service.Service) func(context.Context, *mcp.CallToolRequest, specIDIn) (*mcp.CallToolResult, listUserStoriesOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in specIDIn) (*mcp.CallToolResult, listUserStoriesOut, error) {
		stories, err := svc.ListUserStories(ctx, in.SpecID)
		if err != nil {
			return nil, listUserStoriesOut{}, err
		}
		return nil, listUserStoriesOut{UserStories: newUserStoryOuts(stories)}, nil
	}
}

type listAcceptanceCriteriaOut struct {
	AcceptanceCriteria []acceptanceCriterionOut `json:"acceptanceCriteria"`
}

func listAcceptanceCriteria(svc *service.Service) func(context.Context, *mcp.CallToolRequest, userStoryIDIn) (*mcp.CallToolResult, listAcceptanceCriteriaOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in userStoryIDIn) (*mcp.CallToolResult, listAcceptanceCriteriaOut, error) {
		criteria, err := svc.ListAcceptanceCriteria(ctx, in.UserStoryID)
		if err != nil {
			return nil, listAcceptanceCriteriaOut{}, err
		}
		return nil, listAcceptanceCriteriaOut{AcceptanceCriteria: newAcceptanceCriterionOuts(criteria)}, nil
	}
}
```

Everything referenced already exists and needs no new plumbing:
- `specIDIn` — defined in `internal/graph/mcpserver/expeditions.go:342`.
- `userStoryIDIn` — defined in `internal/graph/mcpserver/requirements.go:116`
  (already used by `deleteUserStory`).
- `newUserStoryOuts` / `newAcceptanceCriterionOuts` — batch converters already
  defined in `internal/graph/mcpserver/spectypes.go:70` and `:99`, built for
  exactly this.

No domain, store, service, schema, or REST changes needed for this fix. No
migration. This is purely additive at the MCP transport.

**Test coverage:** neither `ListUserStories`/`ListAcceptanceCriteria` at the
service/store layers nor `list_tasks_docs`/`list_task_items` at the MCP layer
currently have dedicated test coverage in this codebase (checked
`internal/graph/mcpserver/server_smoketest_test.go`, the only test file in
that package) — so there's no existing per-tool test pattern to mirror
exactly. Add whatever minimal coverage fits the surrounding code's actual
conventions rather than inventing a new test scaffold for just these two
tools.

## Fix 2 — grant `tasks-drafter` the tasks-doc read tools it's missing

`list_tasks_docs` and `get_tasks_doc_by_component` **already exist** as real
MCP tools (`internal/graph/mcpserver/tasks.go:14-21`) — this is a pure
tool-grant fix, no server code at all.

## Fix 3 — grant the new list tools (Fix 1) to the agents that need them

`design-drafter` needs `list_acceptance_criteria` (it's the one resolving
requirements-text contradictions during the design stage and has no way to
look up the criterion it's discussing). `tasks-drafter` needs both
`list_user_stories` and `list_acceptance_criteria` (it needs criterion UUIDs
for `add_task_item`'s `satisfiesCriterionIds`). `requirements-compiler`
should get them too for redraft consistency (it already creates these rows;
a redraft after a deny currently can't see what it created in a prior pass).

## Where the tool grants actually live — read this carefully

**The live agent definitions are NOT in this repo.** They're personal
Claude Code subagents at `~/.claude/agents/*.md` (this machine's home
directory, outside the `rig` git repo), with a `tools:` frontmatter field —
confirmed these are what's actually loaded (their tool lists match exactly
what the running session reports for each named agent).

This repo also has `.meta/skills/{tasks-drafter,design-drafter,requirements-compiler}/SKILL.md`,
each with its own `allowed-tools:` frontmatter — **these have already
drifted from the real `~/.claude/agents/*.md` files** and reference tool
names that don't exist anywhere in the actual MCP catalog at all (e.g.
`mcp__rig__update_task_file_touched`, `mcp__rig__add_tasks_flag`,
`mcp__rig__add_assumption_open_question`, `mcp__rig__add_design_flag` — none
of these are real registered tools; the real tools use `add_open_question`
uniformly across every stage). That drift is a separate, pre-existing
problem — **don't fix it as part of this task**, just don't mistake
`.meta/skills/*/SKILL.md` for the authoritative file. Edit
`~/.claude/agents/*.md` only.

Concretely, in `~/.claude/agents/tasks-drafter.md`'s `tools:` line, add:
`mcp__rig__list_user_stories, mcp__rig__list_acceptance_criteria, mcp__rig__list_tasks_docs, mcp__rig__get_tasks_doc_by_component`

In `~/.claude/agents/design-drafter.md`'s `tools:` line, add:
`mcp__rig__list_acceptance_criteria`

In `~/.claude/agents/requirements-compiler.md`'s `tools:` line, add:
`mcp__rig__list_user_stories, mcp__rig__list_acceptance_criteria`

## Suggested scope for the fix

Both fixes are small and low-risk — a good single task for one
`code-implementer` pass:
1. Add the two tool registrations + handlers to
   `internal/graph/mcpserver/requirements.go` (Fix 1).
2. Update the three `~/.claude/agents/*.md` files' `tools:` lines (Fixes 2 & 3).
3. `go build ./...` and `go vet ./...` to confirm the new file compiles and
   the tool registrations don't collide with anything.

Explicitly out of scope for this fix (don't do these unless asked):
- REST equivalents (`GET /specs/{id}/user-stories` etc.) — nothing in the
  pipeline currently needs them over HTTP; the gap that was actually hit is
  MCP-only.
- Cleaning up the `.meta/skills/*/SKILL.md` tool-list drift noted above —
  real, but unrelated to this gap and larger in scope.

## Background (original report)

Discovered during the `cross-workspace-handoffs` spec pipeline run,
2026-08-07, spec id `fe8646c2-02c4-4f5f-ba4d-0b091911af30`:

- During the **design** stage, an AC 1.6/AC 3.2 contradiction needed to be
  resolved by amending stored requirements text. There was no way to look up
  the acceptance criterion's ID to call `update_acceptance_criterion` on it —
  the resolution had to be recorded only in the design open question's
  `resolvedReason`, leaving `requirements.md`'s rendered text itself
  unamended and textually contradictory.
- During the **tasks** stage, `add_task_item`'s `satisfiesCriterionIds`
  required real `AcceptanceCriterion` UUIDs `tasks-drafter` had no tool to
  fetch, and no tool to fetch the per-component `TasksDoc` UUIDs either. The
  agent queried the local dev Neo4j instance's HTTP endpoint directly
  (read-only) to pull both sets of UUIDs — bypassing the MCP/REST surface
  entirely. That side-channel is disclosed, but it only works against a dev
  box with Neo4j reachable locally; it wouldn't work against a real
  deployment.
