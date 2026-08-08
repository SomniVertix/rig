---
name: wayfinder
description: Plan a huge chunk of work — more than one agent session can hold — as a shared expedition of waypoints on the rig MCP server, and resolve them one at a time until the way to the destination is clear.
disable-model-invocation: true
---

A loose idea has arrived — too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as an **expedition** — a shared map of **waypoints**, each one question driven to a decision — and works them one at a time until the route is clear.

The destination varies per effort, and naming it is the first act of charting — it shapes every waypoint. It might be a spec to hand off and iterate on, a decision to lock before planning starts, or a change made in place like a data-structure migration. The expedition is domain-agnostic — engineering work, course content, whatever fits the shape.

## Storage: the rig MCP server, or nothing

**All expedition data lives in the `rig` MCP server. There is no local file store; never create, read, or write one, and never improvise a substitute.**

**Resolve the workspace, before anything else:** call the `resolve_workspace_id` tool with the current working directory — it holds the allowed list of workspace files and which folders map to each, and returns the `workspaceId` that directory belongs to. Every repo listed in one workspace file resolves to the same `workspaceId` automatically, with no per-repo config to keep in sync by hand.

**Preflight:** make one cheap call — `mcp__rig__list_expeditions` — to prove the server is reachable. If it fails or the tools aren't available, **stop immediately** and tell the user the `rig` MCP server isn't connected for this workspace. There is no fallback.

**Stamp a session, once per invocation:** immediately after preflight, call `start_session` (optional `label`, e.g. the expedition slug or idea being charted) and hold the returned `sessionId` for the rest of the conversation. Use this same value everywhere provenance is recorded — `create_expedition`'s `sessionId`, `claim_waypoint`'s `claimedBy`, `reach_waypoint`/`spur_waypoint`'s `reachedIn` — never an ad-hoc label: downstream readers (e.g. the Session transcript page) match on the real `sessionId`, and a free-text stand-in like `"wayfinder-6927bafd-W12"` breaks that lookup. Call it exactly once per invocation regardless of mode, even if the invocation ends up making no other write — it's the provenance marker for the invocation itself, not conditioned on what follows.

All calls are scoped to the resolved `workspaceId`. Surface any write failure and stop rather than continuing without persistence.

## No branches. No worktrees. Ever.

Everything happens **on main, always** — including prototypes and any task-type work. Never create a git branch or worktree for expedition work. Prototype code is committed to main and attached to its waypoint by reference: `add_waypoint_asset` with `repoPath` + `commitSha`. Documents (research summaries, outlines) are stored whole in the server via `contentMarkdown`. A waypoint asset carries one or the other, never both.

## Plan, don't do

Wayfinder is **planning** by default: each waypoint resolves a decision, and the expedition is done when the way is clear — nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **notes** — carrying execution into the expedition itself — but absent that, produce decisions, not deliverables.

## Refer by name

Every waypoint has a number and a title. In everything the human reads — narration, decision recaps, frontier listings — refer to a waypoint as **`W<number> <title>`** (e.g. `W3 Pick the queue backend`), never by its UUID. A wall of UUIDs is illegible; names read at a glance. The UUIDs don't vanish — they're what the tools take — but they ride *behind* the name, never stand in for it.

## Handoff commands

Whenever the user asks for a command or prompt to hand a waypoint — one, several, or the whole expedition — over to another agent, answer in one fixed shape: a fenced code block, one line per waypoint, `/wayfinder <expedition-slug> W<number> — <title>`, noting inline what a not-yet-frontier waypoint is waiting on:

```
/wayfinder <expedition-slug> W1 — <title>
/wayfinder <expedition-slug> W2 — <title>
/wayfinder <expedition-slug> W4 — <title>   (after W1, W2)
```

For the whole expedition — the full charted walk order (Chart step 6) or a reprint after the marked/rehydrating set changes (Walk step 5) — call `render_walk_order` and print its `markdown` verbatim; it already produces this exact shape, sorted and annotated, sighted (fog) waypoints left out. Build it by hand, in the same shape, only for a one-off ask about a single waypoint or a hand-picked subset. Either way, this is the one form a wayfinder handoff takes — never paraphrase it into prose, describe it as instructions instead of showing it, or invent a different format.

## The map

The map is computed, never stored — `get_expedition` returns the expedition (title, destination, notes) plus its live view: `origin` (the session that chartered this expedition, or the waypoint that spurred it — `null` for an expedition with neither), `decisions` (reached waypoints, gist-indexed), `frontier` (what's workable now), `rehydrating` (redos pending — see "Redoing a decision: rehydrate" below), `fog` (sighted waypoints), `outOfScope` (bypassed), `spurs` (waypoints in this expedition that spun off a child expedition), `claimed`, `terms`, `flags` (unresolved flags targeting this expedition's waypoints — see "Cross-expedition flags" below), and `edges`. `list_expeditions` carries the same per-expedition `origin` on every row, so the lineage tree is browsable without a `get_expedition` per expedition. Load it once per session; it can't drift, because there's nothing to drift from.

Each waypoint is one question, sized to one agent session. Its lifecycle: `sighted` (fog) → `marked` (sharp question) → `claimed` (a session is on it) → `reached` (resolved) or `bypassed` (ruled out of scope). `reached` and `bypassed` are both terminal and **both unblock dependents** — a scope ruling never deadlocks the frontier. Either can be redone via `rehydrate_waypoint`, which moves the waypoint to `rehydrating` — workable again exactly like `marked`, but visually distinct as a redo rather than a fresh waypoint (see "Redoing a decision: rehydrate" below).

Dependencies are edges: `add_waypoint_dependency(fromWaypointId, toWaypointId)` means "from" blocks "to". Edges stay within one expedition. **There is no cycle detection** — the server accepts a dependency graph that loops, matching v1's behavior — so a cycle is a silent deadlock (every waypoint in the loop stays permanently blocked) rather than a rejected call; wire edges carefully and don't rely on the server to catch a mistake here. The **frontier** — `get_frontier` — is the marked or rehydrating waypoints whose blockers have all terminated: the edge of the known. Being `claimed` doesn't remove a waypoint from the frontier — claiming is a courtesy marker, not a lock (see Walk step 2).

## Waypoint approaches

`approach` is a hint, not a contract: `grilling`, `research`, `prototype`, or `task`. Every waypoint is either **HITL** — human in the loop, worked *with* a human who speaks for themselves — or **AFK**, driven by the agent alone. A HITL waypoint only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- **research** (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases. Attach the markdown summary via `add_waypoint_asset` (`contentMarkdown`). Use when knowledge outside the current working directory is required.
- **prototype** (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to — an outline, a rough take, a stub, or UI/logic code via the /prototype skill. Commit code to **main** and attach it via `add_waypoint_asset` (`repoPath` + `commitSha`). Use when "how should it look" or "how should it behave" is the key question.
- **grilling** (HITL): Conversation via the /grilling skill, one question at a time. The default case.
- **task** (HITL or AFK): Manual work that must happen before a *decision* can be made — nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one approach that *does* rather than decides — and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Reached when the work is done; the resolution records what was done and any resulting facts (credentials location, new URLs, row counts) later waypoints depend on.

## Fog of war

The expedition is *deliberately* incomplete: don't chart what you can't yet see. Beyond the marked waypoints lies the **fog of war** — the dim view of decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. A fog patch is a waypoint added with `sighted: true`: the suspected question, the area to revisit later. Reaching a waypoint clears the fog ahead of it — graduate whatever's now specifiable with `update_waypoint` (`mark: true`, sharpening `title`/`question` in the same call), so it joins the frontier's feeder pool.

**Fog or marked?** The test is whether you can state the question precisely now — *not* whether you can answer it now.

- **Marked when** the question is already sharp — even if it's blocked and you can't act on it yet.
- **Sighted when** you can't yet phrase it that sharply. Don't pre-slice the fog into waypoint-sized pieces: a fog patch is coarser than a marked waypoint, and one patch may graduate into several, or none, once the frontier reaches it.

Fog excludes what's already reached, what's already marked, and what's out of scope.

## Out of scope

Fog only ever gathers *toward* the destination. The destination fixes the scope, so work beyond it is **out of scope** — it isn't fog. When a waypoint turns out to sit past the destination — mis-scoped in while charting, or exposed by a resolution — call `bypass_waypoint` with a `bypassReason`: the gist plus why it's beyond the destination. Bypassing is terminal and **unblocks its dependents**; any non-terminal waypoint can be bypassed, including sighted fog. Bypassed waypoints appear in the map's `outOfScope` section, not its `decisions` — a scope boundary isn't a step on the route walked.

A bypass made in error isn't a dead end: `unbypass_waypoint` restores the waypoint to its exact pre-bypass status (`marked`, `sighted`, or `rehydrating`) and clears the bypass reason. It requires a `reason` and reports (without blocking) any dependents that already progressed while the waypoint sat bypassed. Use it instead of manual database surgery when a bypass turns out wrong.

Out-of-scope work never graduates on its own — the frontier stops at the destination. It comes back one of two ways: the destination itself is redrawn, in which case it returns as a fresh expedition, not a resumption of this one; or a later decision pulls a specific bypassed waypoint back into scope without the destination changing, in which case use `rehydrate_waypoint` on it directly (see "Redoing a decision: rehydrate" below) rather than starting over.

**Bypass is not a handoff.** "Out of scope" means beyond the destination — not "still in scope, but a different vehicle will build it." A waypoint whose work is moving to a spec or someone outside the expedition *still serves this destination*; it belongs in `decisions`, not `outOfScope`. Record it with `reach_waypoint`, whose resolution states what's being handed off and where. Reach for `bypass_waypoint` only when the waypoint itself turns out to sit past the destination line — never as a way to close out a waypoint without counting it as "resolving" (see the one-terminal-action rule below).

**Spinning a waypoint off into its own expedition is a handoff too — use `spur_waypoint`, never a bare `reach_waypoint` that just names an expedition.** When a waypoint turns out to deserve a whole new expedition while this one keeps moving, don't `reach_waypoint` it with a resolution that points at an expedition you haven't created yet — that's a dangling "see expedition X" resolution pointing at an expedition that may not exist. `spur_waypoint` (`waypointId`, `slug`, `title`, `destination?`, `notes?`, `rationale?`, `reachedIn?`) does both steps — creating the child expedition, then reaching the origin waypoint with its lineage edge — in one call for convenience, legal from the same `marked`/`claimed`/`rehydrating` states as `reach_waypoint`, and it counts as this session's one terminal waypoint action (see the one-terminal-action rule below), same as any other `reach_waypoint`/`bypass_waypoint`. **It is not one atomic transaction** — the two steps happen in sequence, so a failure partway through can leave a partial result (child expedition created but the origin not yet reached, or vice versa). If the call errors, check `get_expedition` or `list_expeditions` before retrying to see what actually landed, and finish the other half by hand rather than assuming nothing happened. A spur made in error isn't a dead end: `unspur_waypoint` (`waypointId`, `reason`) restores the origin waypoint to `marked` and removes the lineage edge, reporting — without touching — the now-parentless child expedition.

**Only `complete_expedition` creates a spec.** Never call `create_spec` (or any other spec-pipeline creation tool) directly to perform an expedition→spec handoff. `complete_expedition(outcomeKind: "spec", specSlug, featureName)` is the one sanctioned path — it creates the spec and then sets the expedition's `outcome_spec_id`. **It is not one atomic transaction** — same shape as `spur_waypoint` above — so a failure partway through can leave a partial result (spec created but the expedition's `outcome_spec_id` not yet set, or vice versa). A spec created any other way, or left dangling by a partial failure, is invisible to `get_expedition_by_spec` (the requirements-compiler's read path finds no expedition, no decisions, nothing), and there is no tool to retroactively attach it — it's stuck as an empty shell exactly like a hand-created one would be. If the call errors, check `get_expedition` and `list_specs` before retrying to see what actually landed, rather than assuming nothing happened. Before calling `complete_expedition` with a given `specSlug`, a quick `list_specs` check is cheap insurance regardless: if that slug already exists, stop and flag it to the user rather than proceeding — it means an earlier handoff broke partway through and needs a human-directed fix, not another automated attempt.

## Redoing a decision: rehydrate

A decision reached well into an expedition can invalidate one already made earlier — the answer to W7 turns out to rule out what W2 settled. Redoing a decision never deletes the old one: `rehydrate_waypoint` snapshots the current resolution (or bypass reason) into an append-only history record first, then moves the waypoint to `rehydrating` — workable again exactly like `marked`, but its own bucket in `get_expedition`'s map so it's visibly a redo, not a fresh question. Legal from `reached` or `bypassed` — one mechanism for two narratives: "this decision needs to be redone" and "this was correctly out of scope then, but a later decision brings it back in." Nothing about the prior resolution is lost — the full history is visible via `get_waypoint`'s `history` field, oldest first.

`rehydrate_waypoint` only ever runs on an **active** expedition — call `reopen_expedition` first if it's complete or abandoned. Reopening the expedition is always a separate, deliberate step; it never happens as a side effect of rehydrating a waypoint.

**Automatic trigger:** right after `reach_waypoint` resolves a decision, walk the downstream `BLOCKS` graph (from `get_expedition`'s `edges`) for waypoints already `reached`/`bypassed`. Judge whether the new decision actually invalidates them — zoom into each candidate's full resolution via `get_waypoint`, since the map's `decisions` bucket only carries a gist. A **full** rehydrate treats every downstream terminated waypoint as invalidated; a **partial** rehydrate is your judged subset. Either way, call `flag_waypoint` on each candidate first — with a `note` explaining why and `sourceWaypointId` set to the waypoint just reached — then **propose** rehydrating them to the user and wait for go-ahead before calling `rehydrate_waypoint`, reusing the existing one-terminal-action "propose a cascade, wait for go-ahead" rule below rather than a new consent mechanism. `rehydrate_waypoint` counts as a terminal-adjacent action toward that same one-per-session budget.

**Manual trigger:** the user can hand-pick specific waypoints for direct `rehydrate_waypoint` calls, or ask to redo the whole expedition — in which case, loop `rehydrate_waypoint` over every currently `reached`/`bypassed` waypoint in it. This is a client-side loop; there's no bulk server tool for it.

If a rehydrated waypoint had already spurred a child expedition, its `spurredToExpeditionId` pointer isn't cleared automatically — call `unspur_waypoint` first if the redo shouldn't still claim to have spurred that child, or accept that the field will look stale until it does.

There's no "un-rehydrate": the history record it creates *is* the undo trail, so moving forward with a preserved past is the point, not being reversible itself.

## Cross-expedition flags

`flag_waypoint` (`targetWaypointId`, `note`, `sourceWaypointId?`) raises a non-mutating marker that a waypoint's decision may need reconsidering. It works regardless of the target waypoint's status or its expedition's active/complete/abandoned state — this is what lets a live decision flag a waypoint sitting in an already-completed expedition without forcing an immediate reopen. `sourceWaypointId` is optional: a flag can be raised narratively (a human or agent observation), not only by another waypoint's decision.

`get_expedition`'s `flags` bucket surfaces unresolved flags targeting *that expedition's* waypoints — incoming only, not flags its own waypoints raised elsewhere. `resolve_waypoint_flag` (`flagId`, `reason`) closes one out, either because `rehydrate_waypoint` was subsequently called on its target, or because on inspection no rework was actually needed — either way the flag is never deleted, just marked resolved, and stays visible via `get_waypoint`'s `flags` field.

## Invocation

Three modes. Chart and Walk each **take at most one terminal waypoint action per session** — one `reach_waypoint`, one `bypass_waypoint`, one `spur_waypoint`, *or* one `rehydrate_waypoint` on the waypoint you claimed; `bypass_waypoint`, `spur_waypoint`, and `rehydrate_waypoint` count as terminal here too, so chaining a run of bypasses (or a `complete_expedition`) right after is the same overreach wearing a technicality. If working the one waypoint reveals that others should terminate too — bypassed as newly out of scope, reached as handoff decisions, spurred into their own expeditions, rehydrated as redos, or the whole expedition ready to `complete_expedition` — stop and propose that to the user with the reasoning, and wait for their go-ahead before executing it: a cascade they didn't get to weigh in on happened without them, even if each call was defensible alone. `unbypass_waypoint`, `unspur_waypoint`, and `reopen_expedition` can undo a cascade that happens anyway (rehydrate has no dedicated undo — its history record is the audit trail, not a reversible step), but that only caps the cost — getting the go-ahead first is still the point. Status (below) sits outside this rule entirely — it takes no terminal action and never needs the user's go-ahead to run.

A `resolution` records what has already happened, not a plan for what happens next. Don't narrate bypassing other waypoints or calling `complete_expedition` as accomplished fact if those are still just proposed pending the user's go-ahead — say so as a proposal, and only describe them as done once the corresponding tool calls have actually landed.

### Chart the expedition

User invokes with a loose idea.

1. **Name the destination.** Run a `/grilling` session to pin down what this expedition is finding its way to — the spec, decision, or change. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first** this time: fan out across the whole space rather than deep on any one thread, surfacing the open decisions and the first steps takeable now. **If this surfaces no fog** — the way to the destination is already clear, the whole journey small enough for one session — you don't need an expedition. Stop and ask the user how they'd like to proceed.
3. **Create the expedition**: `create_expedition` (`slug`, `title`, `sessionId` — this invocation's `start_session` id, from Preflight) with `destination` — what reaching the end looks like, one or two lines every session orients to — and `notes` — domain, skills every session should consult, standing preferences for this effort.
4. **Add the waypoints you can specify now**: `add_waypoint` for each sharp question, with an `approach` hint; `sighted: true` for each fog patch you can sense but can't phrase. Then wire blockers in a **second pass** with `add_waypoint_dependency` (a waypoint must exist before an edge can reference it). Wiring sorts them into the frontier and the blocked.
5. Pin any terminology settled while charting via `add_expedition_term`. If a definition needs fixing later, `update_expedition_term` corrects it in place rather than adding a duplicate entry.
6. **Hand back a walk order.** Call `render_walk_order` and print its `markdown` verbatim (see "Handoff commands" above). Then stop — charting is one session's work; do not also resolve waypoints.

### Walk the expedition

User invokes with an expedition (title or slug — find it via `list_expeditions`). A waypoint is **optional** — without one, you pick the next decision, not the user.

1. Load the map: `get_expedition` — the low-res view, once.
2. Choose the waypoint. If the user named one, use it. Otherwise call `get_frontier` and take the first, in waypoint-number order. **Claim it before any work**: `claim_waypoint` (`claimedBy`: this invocation's `sessionId` from Preflight). Claim **exactly one waypoint per session**. The claim is a courtesy marker, not a lock: it isn't atomic and doesn't expire, so there's no `already_claimed` error and nothing to reclaim. It just tells other sessions someone's on it — if a waypoint you want is already marked `claimed`, use judgment (check with whoever's on it, or just proceed if it looks abandoned) rather than expecting the server to arbitrate.
3. Resolve it — **zoom as needed**: `get_expedition`'s decisions carry gists; the full resolution lives on each reached waypoint. Invoke the skills the expedition's notes name; if in doubt, use `/grilling`.
4. Record the outcome: `reach_waypoint` with `resolution` (the full answer, buildable-from without re-reading the conversation), `resolutionGist` (the one-line index entry), optional `rationale`, and `reachedIn` (this invocation's `sessionId` from Preflight — the same value used for `claimedBy` above). Attach what the work produced via `add_waypoint_asset` — documents whole via `contentMarkdown`; prototype code committed to main and referenced via `repoPath` + `commitSha`.
5. Add newly-surfaced waypoints (add-then-wire); graduate any fog the answer has made specifiable (`update_waypoint` with `mark: true`). If the answer reveals a waypoint — this one or another — sits beyond the destination, `bypass_waypoint` it rather than resolving it on the route; but if it's still in scope and just moving to a different vehicle, that's a handoff, not a bypass (see "Bypass is not a handoff" above) — a plain `reach_waypoint` for a spec or someone outside the expedition, `spur_waypoint` for a whole new expedition. If the decision invalidates other waypoints — including already-`reached`/`bypassed` ones — see "Redoing a decision: rehydrate" above rather than editing their question text; propose it and get the user's go-ahead first if it means terminating more than the one waypoint you claimed (see the one-terminal-action rule above). If any of this changed the marked/rehydrating set, reprint the walk order (`render_walk_order` again, per Chart step 6) so the user's copy-paste list stays current.
6. **If you must stop without resolving**, `release_waypoint` so the claim marker doesn't sit stale and mislead the next session.

When the way is clear — nothing left to decide — end the expedition: `complete_expedition` (`outcomeKind: "spec"` with `specSlug` + `featureName` creates and links the spec — see "Only `complete_expedition` creates a spec" above for why that's not atomic; `"decision"` or `"change"` with an `outcomeSummary` otherwise), or `abandon_expedition` if the effort is dropped.

Either is reversible if it turns out premature: `reopen_expedition` restores a `complete` or `abandoned` expedition to `active`, leaving `outcomeKind`/`outcomeSpecId` in place as a record of the prior completion and clearing only `outcomeSummary`. `complete_expedition` can then be called again, correctly overwriting the outcome — including re-linking the same spec, a different one, or none. Requires a `reason`; reports (without blocking) the linked spec's current stage if one exists. Use it instead of manual database surgery when a completion or abandonment turns out wrong.

Expect other sessions to be walking this expedition concurrently — claiming is just a courtesy signal between them, not a lock, so coordinate by checking who's claimed what rather than relying on the server to prevent overlap.

### Status

User invokes with `status` — no idea to chart, no expedition to walk; a request for the map of the whole workspace rather than one effort.

1. Preflight and session stamp as usual (see Storage above) — Status still calls `start_session` once, even though nothing else in this mode writes.
2. Pull everything in one call: `get_workspace_status`. It returns every expedition in the workspace, each row already carrying its origin lineage the same way `list_expeditions` does — pre-joined and ready to render. This step is a single call, not a fan-out: don't also call `list_expeditions`, `list_specs`, or `get_spec` here. The skill's job in Status mode is formatting this one response, not assembling it.
3. Render a `## Status` heading with the Expeditions table, most-recently-active expedition first:

   **Expeditions**

   | Expedition | Status | Destination | Outcome |
   |---|---|---|---|
   | `<slug>` — <title> | active / complete / abandoned | <destination, or "—" if not yet named> | <outcomeKind, or "—" if none> |

4. Below the Expeditions table, render the **Handoffs** table from `get_workspace_status.handoffs`, containing both inbound and outbound pending/read handoffs:

   **Handoffs**

   | Direction | From/To | Title | Type | Status | Sent | Conversation |
   |---|---|---|---|---|---|---|
   | inbound / outbound | <counterpartyWorkspaceId> | <title> | <type> | pending / read | <sentAt, relative time> | yes / no |

   **Note:** The Handoffs table is read-only in Status mode. Do not call `get_handoff` to browse the detail, since that tool has the side effect of marking a pending handoff as read. If the user wants to see a handoff's full body or transcript, direct them to use the console's Wayfinder view instead.

   If the Handoffs table would be empty, omit it and render: "No open handoffs in this workspace."

   Disambiguate this Handoffs table from other references to "handoff" in the skill: Handoff is a document being sent/received between workspaces (core primitive, **Handoffs** table); handoff is a generic synonym for "transfer" used elsewhere in the skill (e.g., "Marking the expedition-to-spec handoff"); Bypass is not a handoff.

5. Below the tables, render the response's `specsNote` as a line of prose instead of a Specs table — `get_workspace_status` is expeditions-only today (the spec pipeline itself is real and Neo4j-backed; this one tool just doesn't aggregate spec rows into its response yet), and `specsNote` says so. Render whatever it says rather than hardcoding today's wording — once `get_workspace_status` grows real spec rows, this step will pick that up from the tool's shape rather than needing a skill rewrite.
6. Status is read-only front to back: it claims no waypoint, reaches nothing, mutates no state. Don't fold a Chart or Walk step into the same turn as a Status report — if the user wants to act on something the table surfaced, that's a fresh Chart or Walk invocation.

## Downshift

If this is really a quick interview, /grilling walks the same expedition resolving inline.
