---
name: handoff
disable-model-invocation: true
---

`/handoff` sends a message from this workspace to another one — a bug report, a question, an FYI, or a heads-up about a dependency change — optionally anchored back to the expedition, waypoint, commit, or session it arose from. A handoff is a cross-workspace postcard, not a hop into the target workspace's own planning machinery: it never starts an expedition there, never claims a waypoint there, and never assumes anything about what the target workspace is doing right now. Composing and sending one is quick, standalone work — it doesn't belong to any expedition or waypoint of its own, so nothing about sending it depends on being mid-session in either workspace.

## Storage: the rig MCP server, or nothing

**All handoff data lives in the `rig` MCP server. There is no local file store; never create, read, or write one, and never improvise a substitute.**

## Step 1: Preflight

Resolving a target and sending a handoff is a self-contained action, not a continuation of expedition or waypoint work — so this step deliberately skips machinery that other skills treat as mandatory:

- **No `start_session`.** A handoff isn't attributed to a session the way a waypoint resolution is; `sentBy` (Step 3 onward) can be filled from context without one.
- **No expedition precondition.** There is no requirement that an expedition be active, loaded, or even exist in either workspace.
- **No waypoint precondition.** There is no requirement that a waypoint be claimed, marked, or in any particular state — an origin waypoint is optional back-link data (see later steps), not a gate on whether this skill can run at all.

What this step *does* do:

1. **Resolve the source workspace:** call `resolve_workspace_id` with the current working directory. Hold the returned `workspaceId` — it's the handoff's `sourceWorkspaceId` in every later step.
2. **Prove the server is reachable:** make one cheap call — `list_handoffs` with `direction: outbound` against the resolved `workspaceId` — before doing anything else. This is a reachability check, not a real query; its result isn't used for anything beyond confirming the call succeeded.

If either call fails, or the tools aren't available at all, **stop immediately** and tell the user **the rig MCP server isn't connected for this workspace**. There is no fallback — do not draft, queue, or otherwise improvise a handoff outside the server.

## Step 2: Resolve the target workspace

A handoff needs a `targetWorkspaceId` before there's anything left to compose. Resolve it before moving on to the message itself:

1. Call `list_workspaces()` to get every workspace this MCP server knows about — id, slug, name, and root path for each.
2. Match the human's phrasing against that list client-side, by name or slug (case-insensitively; tolerate partial and fuzzy matches — "the console repo" or "console" should both be weighed against a workspace named "rig-console", for instance).
3. Judge the match:
   - **Exactly one plausible match:** proceed with it as the target — no need to make the human confirm the obvious.
   - **Zero plausible matches, or more than one:** stop and show the human the full enumerated list (name, slug, root path) from `list_workspaces()`, and ask them to pick. Never guess between close candidates, and never silently default to "the first one" or "the most recently seen one."

This step always ends one of two ways: a single confident match carried forward as `targetWorkspaceId`, or the human having explicitly picked one from the list. Never continue past this step on an ambiguous or unconfirmed guess.

## Step 3: Draft from context

Gather the essential message content from the current session context. Invoke any tools that let you introspect the session transcript, current task, or surrounding context:

- **Title:** a short summary (one line, <100 chars) of the issue or topic — derived from the session context (e.g., current task name, the human's stated problem, or a tag/label if visible).
- **Type:** one of `bug`, `question`, `fyi`, or `dependency-change`. If the session context makes it obvious (a known defect, an unanswered question, a heads-up announcement), choose it silently; if ambiguous, ask the human to pick.
- **Body:** full markdown describing the message. **Include every turn from the session transcript so far**, arranged chronologically under a `## Transcript` heading at the end (see format below). Before the transcript, include a 2–3 sentence summary of the handoff's main point or request.
- **`sentBy`** (required by `send_handoff`, not optional): the current session's identifier — the same ambient value used for `originSessionId` in Step 4. If no session identifier is available at all, use a short descriptive fallback like `"agent"` rather than leaving it blank; `send_handoff` rejects an empty `sentBy`.

### Transcript format in body

End the body with an ordered list of turns:

```
## Transcript

**Turn 1 — [Speaker]** (timestamp)
> Content of the turn

**Turn 2 — [Speaker]** (timestamp)
> Content of the turn
```

If there is no transcript (the session just started), omit the `## Transcript` heading and leave the body as just the summary.

## Step 4: Auto-fill origin fields (silent, no prompts)

Populate the handoff's optional back-link fields from the current session context **without asking the human**. Omit any that aren't available (don't prompt, don't error, just leave them unset):

- **`originCommitSha`:** `git rev-parse HEAD` in the current working directory (if it succeeds; if git fails or we're not in a repo, omit this field).
- **`originExpeditionId`:** from `context.expedition.id` if the session has an active expedition loaded (if not, omit).
- **`originWaypointId`:** from `context.waypoint.id` if the session has an active waypoint claimed (if not, omit).
- **`originSessionId`:** the current session's id (always available from session context).

This step is silent — no user interaction, no prompts, no "checking" messages. Just populate what you can and move on.

## Step 5: Confirm-and-edit (exactly one gate)

🔴 **CRITICAL: This step is ONE gate, not two. Edit loops back to the same gate. Never show a second independent confirmation.** 🔴

Render the complete draft to the human in this format:

```
**Target Workspace:** [name] ([slug])
**Title:** [title]
**Type:** [type]
**Body:**
[full body including transcript]

**Origin (optional back-links):**
  originCommitSha: [value or "(not available)"]
  originExpeditionId: [value or "(not set)"]
  originWaypointId: [value or "(not set)"]
  originSessionId: [value]

**Attachments:**
  [list any inline attachments, or "(none)"]
```

Then present exactly two options:

**Option A: "Confirm and send"**
→ Proceed to Step 6 (send the handoff).

**Option B: "Edit draft"**
→ Show a form (or series of prompts) allowing the human to edit any of: title, type, body, attachments.
→ After editing, re-render the complete draft in the same format as above.
→ Present the same two options again: "Confirm and send" or "Edit draft".
→ If the human picks "Edit draft" again, loop back to the form. **Never show a third option or a separate "Are you sure?" confirmation.**

The confirm-and-edit loop continues until the human either:

- Picks "Confirm and send" → go to Step 6.
- Declines at any point → go to Step 7 (decline).

## Step 6: Send

Call `send_handoff` with all fields:

```
send_handoff(
  sourceWorkspaceId: [from Step 1],
  targetWorkspaceId: [from Step 2],
  title: [from Step 3 or Step 5 edit],
  type: [from Step 3 or Step 5 edit],
  bodyMarkdown: [from Step 3 or Step 5 edit, including transcript],
  sentBy: [from Step 3],
  attachments: [from Step 5 edits, if any],
  originCommitSha: [from Step 4, if available],
  originExpeditionId: [from Step 4, if available],
  originWaypointId: [from Step 4, if available],
  originSessionId: [from Step 4]
)
```

On success (handoff created, returns `id`):

```
✅ Handoff sent!
ID: [returned id]

Reminder: A handoff is immutable after send. The target workspace can action it, dismiss it, or converse about it, but the message itself cannot be edited or deleted. If you need to clarify or correct something, send a follow-up handoff.
```

On failure (e.g., unknown targetWorkspaceId, validation error from the server):

```
❌ Failed to send: [error message from send_handoff]

Nothing has been persisted. You can edit and retry, or abandon this handoff.
```

If the user wishes to retry after a failure, return to Step 5 (confirm-and-edit) to let them review or change anything.

## Step 7: Decline

If the human declines the handoff at any point in the flow — whether during target selection (Step 2), while composing (Step 3–4), during confirmation (Step 5), or after a send failure (Step 6) — do not call `send_handoff` or persist anything:

```
Handoff declined. Nothing has been persisted.
```

End the skill cleanly. No fallback, no queue, no local draft — the only record is in the session transcript (if the human wants to refer back to what they were composing).
