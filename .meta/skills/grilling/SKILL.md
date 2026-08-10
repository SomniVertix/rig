---
name: grilling
description: Interview the user relentlessly about a plan or design. Use when the user wants to stress-test a plan before building, or uses any 'grill' trigger phrases. Walks an expedition on the rig MCP server, reaching one waypoint per settled question.
disable-model-invocation: true
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a question can be answered by exploring the codebase, explore the codebase instead.

A grilling session is an **expedition**: one effort to turn a loose idea into a destination. Each settled question is a **waypoint** reached on that expedition. A grill walks fast — it adds a waypoint and reaches it in the same breath.

## Storage: the rig MCP server, or nothing

**All expedition data lives in the `rig` MCP server. There is no local file store — never create, read, or write one, and never improvise a substitute.**

**Resolve the workspace, before anything else:** call the `resolve_workspace_id` tool with the current working directory — it returns the `workspaceId` that directory belongs to. Hold it for `create_expedition`'s `workspaceId` below.

**Preflight, before asking the first question:** make one cheap call — `mcp__rig__list_expeditions` — to prove the server is reachable. If it fails or the tools aren't available, **stop immediately** and tell the user the `rig` MCP server isn't connected for this workspace. There is no fallback. Do not conduct the interview unpersisted.

**Stamp a session, once per invocation:** immediately after preflight, call `start_session` (optional `label` — a short note on the topic being grilled). Hold the returned `sessionId` for the rest of the conversation — it is this invocation's one canonical identifier, threaded into `create_expedition`'s `sessionId` (Starting, below) and every `add_waypoint`'s `reachedIn` (Each settled question, below), never an ad-hoc label invented on the spot. Call it exactly once per invocation, even a resumed interview that reaches zero new waypoints. Downstream readers (e.g. the Session transcript page's waypoint-derived fallback, scoped by matching `reached_in` to a session id) depend on this being the real `sessionId` — a free-text label like `"wayfinder-6927bafd-W12"` breaks that lookup.

All calls are scoped to the resolved `workspaceId`. Surface any write failure and stop rather than continuing without persistence.

## Starting: create the expedition

- **Fresh interview:** call `create_expedition` — `workspaceId` from Preflight, `slug` a short kebab-case slug derived from the topic, `title` a destination-oriented title, `briefingPrompt` = the user's initial ask (largely verbatim), `sessionId` = this invocation's id from Preflight. Keep the returned `expeditionId` for the rest of the interview.
- **Resuming:** if an `expeditionId` is already known (carried earlier in this conversation, or supplied in the invocation), call `get_expedition` to confirm it exists and read its map — `decisions` is what's already settled; don't re-ask it. Pick up where it left off rather than creating a new expedition.

## Each settled question: one reached waypoint

The moment a question resolves, call `add_waypoint` with the resolution inline — one call inserts the waypoint directly at `reached`. Do not batch these to the end.

- `expeditionId`, `title` — a short name for the decision
- `question` — the question as posed to the user
- `resolution` — the concrete outcome, stated plainly enough that a downstream reader (e.g. the requirements-compiler stage) can build from it without re-reading the conversation. If the user's answer introduces an option you didn't propose, record that as the resolution rather than retrofitting it into something you'd suggested.
- `resolutionGist` — a one-line gist; this is the index line the expedition's Decisions-so-far view shows, so make it legible at a glance.
- `rationale` (optional) — use this to preserve what was actually on the table and in the user's own words when it isn't obvious from `resolution` alone: what you proposed (noting which option, if any, was your recommendation) and the substance of their raw response. Trim only obvious filler, not substance — a downstream reader should be able to tell what they actually said versus what you inferred from it. Don't fill this by default; only when it carries real signal beyond the plain resolution.
- `reachedIn` — this invocation's `sessionId` from Preflight, the same value on every waypoint you reach in it. Never an ad-hoc label — see Preflight above for why.

Numbering is automatic — just call in resolution order.

**A question you can't settle now** is still a waypoint: call `add_waypoint` with the question but **without** `resolution` — it lands at `marked` and waits for a later session. That's fine; leaving it marked is correct, not a failure, and it's the seed of the upgrade path below.

## Terminology

When domain vocabulary gets pinned down mid-interview, call `add_expedition_term` (`expeditionId`, `term`, `definition`) the moment it's nailed down rather than losing it in the Q&A prose. Prefer routing genuinely reusable terminology into a project's `CONTEXT.md` instead (see the domain-modeling skill) when that skill is in use.

## Ending: complete the expedition

When the interview concludes, call `complete_expedition` (`expeditionId`) with the outcome:

- **Heading into the spec pipeline:** `outcomeKind: "spec"` with `specSlug` and `featureName` (both required). This creates the spec AND links it to the expedition in one transaction. Tell the user that `requirements-compiler` reads the expedition automatically through the spec link — **do not paste the transcript to it**.
- **A decision locked, nothing to build:** `outcomeKind: "decision"`, with `outcomeSummary`.
- **A change made in place:** `outcomeKind: "change"`, with `outcomeSummary`.

If the user cancels the effort, call `abandon_expedition` instead.

## Upgrade path

If this grill is turning into a campaign — too many questions, work needed between answers — stop resolving inline: leave waypoints marked, add sighted fog entries, wire dependencies, and hand off to /wayfinder. Same expedition, no migration.
