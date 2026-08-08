---
name: handoff-conversation
disable-model-invocation: true
description: |
  Orchestrate a structured, multi-turn handoff conversation between source and target workspaces.
  The arbiter is always the human's own session. Both subagents are spawned through a generic
  harness primitive (no product-specific dependency). The human arbitrates when both sides
  reach mutual agreement, when a side becomes unreachable/stalled, or at the 15-turn cap.
---

# Handoff Conversation: Arbiter Orchestration

## Harness Capability Contract

This skill requires three capabilities from the execution harness (generic, product-agnostic):

| Capability | Input | Output | Fallback |
|---|---|---|---|
| **spawn(brief, rootPath)** | Prose brief + filesystem binding | Subagent's final message | If harness has no native cwd parameter: carry absolute `rootPath` in the brief; require subagent's first action to be `resolve_workspace_id(rootPath)` echoing the workspaceId back (liveness + binding check) |
| **promptHuman(question)** | Prose question with options | Human's choice/text | None — this mode refuses to run without human prompt capability |
| **visible transcript** | (none) | Every turn appears in session chat | Automatic — the arbiter is the human's own session; no extra tooling needed |

The arbiter **is always the human's own session**. There is no separate arbiter spawn. The human sees every turn and every prompt inline in their transcript.

---

## Startup Sequence (Steps 1–4)

### Step 1: Validate the Handoff

Get the handoff: `get_handoff(handoffId)`.
- **Success:** Proceed to Step 2.
- **Handoff not found:** Stop and report "Handoff not found."
- **Handoff already actioned/dismissed:** Stop and report "Handoff is already [actioned/dismissed]; its conversation cannot be opened."

### Step 2: Resolve Both Workspaces

Call `list_workspaces()`.
- Extract `rootPath` for the handoff's `sourceWorkspaceId`.
- Extract `rootPath` for the handoff's `targetWorkspaceId`.
- **Either workspace not found:** Stop and report which workspace is unknown.

### Step 3: Reachability Probe (10 seconds each)

For both the source and target:
1. Perform `stat(rootPath)` to verify the local directory exists.
2. Call `resolve_workspace_id(rootPath)` and verify the returned id matches the expected workspaceId.
3. Both operations must complete within 10 seconds total.

**If any probe fails:**
- Stop immediately and report which side is unreachable and why (stat failed or workspaceId mismatch).
- Do not proceed to Step 4; do not call `start_handoff_conversation`.

**If both probes succeed:**
- Proceed to Step 4.

### Step 4: Start the Conversation

Call `start_handoff_conversation(handoffId, sourceRootPath, targetRootPath, arbiterSessionId?)`.
- This creates the server-side conversation state with status `active`, turnCap 15.
- Proceed to Step 5 (relay loop).

---

## Relay Loop (Step 5)

Alternate between source and target workspaces, relaying turns until the conversation reaches a terminal state or an escalation.

### Per-Iteration Sequence

#### 5a. Build the Spawn Brief

Construct a brief for the current side (source or target):

```
Role: [source|target] workspace
Workspace ID: [workspaceId]
Root Path: [absolute rootPath]  ← mandatory for handshake fallback

---

## Handoff Summary

[Full handoff document: title, type, body, attachments]

---

## Conversation Transcript So Far

[All turns in order: speaker (source/target/arbiter), verdict, content, timestamp]
[If empty, omit this section]

---

## Your Task

Reply with:
- **First action** (mandatory): Call `resolve_workspace_id([rootPath])` and echo your workspaceId back to confirm you are bound correctly. This is a liveness check and binding verification.
- **Next reply** (after binding confirmed): `content: "[your response prose]"` and `verdict: [action|dismiss|more_info|blocked]`

Do not call send_handoff, action_handoff, or dismiss_handoff yourself. Your only job is to analyze the handoff and propose a verdict (action/dismiss/more_info/blocked).
```

#### 5b. Mandatory Handshake: resolve_workspace_id

Spawn the subagent bound to `rootPath` with the brief above.

**The subagent must immediately reply with:**
```
resolve_workspace_id([rootPath])
```

Wait for this call to return. The returned workspaceId must match the expected id for this side.

**If the handshake fails** (see below: conditions a–f), escalate (Step 5c → Step 5e).

#### 5c. Wait for the Subagent's Turn

After the handshake succeeds, wait up to **180 seconds** for the subagent's final message containing `content` and `verdict`.

#### 5d. Parse the Reply

Examine the subagent's response for one of six conditions:

| Condition | How to Detect | Reason | Handler |
|---|---|---|---|
| **a) Spawn error** | Harness returns spawn error (process failed to start, crash, etc.) | `stalled_subagent` | → 5e |
| **b) stat(rootPath) fails** | Pre-dispatch filesystem check fails | `workspace_unreachable` | → 5e |
| **c) resolve_workspace_id wrong id** | Handshake returns a different workspaceId than expected | `workspace_unreachable` | → 5e |
| **d) No reply within 180s** | Timeout waiting for subagent final message | `stalled_subagent` | → 5e |
| **e) UNREACHABLE reply** | Subagent explicitly sends `UNREACHABLE` (fallback convention when no binding could occur) | `workspace_unreachable` | → 5e |
| **f) Unparseable twice** | Reply does not contain parseable `content`/`verdict`; ask for clarification; still unparseable on retry | `stalled_subagent` | → 5e |

#### 5e. Handle Valid Reply

If the reply is **valid** (contains `content` and `verdict` enum):

1. Call `record_handoff_turn(conversationId, speaker: [source|target], content, verdict)`.
2. Inspect the returned `HandoffConversationState`:
   - `status`: active | escalated | closed_agreed
   - `agreementReached`: boolean
   - `capReached`: boolean
   - `nextSpeaker`: [source|target|arbiter]

**Next action depends on status:**

- **status = `active`:** Loop back to Step 5a, switch speaker (source → target or target → source), and continue.
- **status = `escalated`:** The cap was reached (15 subagent turns) or both sides have unequal verdicts after reaching a max. Go to Step 5f (escalation).
- **status = `closed_agreed`:** Both sides reached mutual agreement (same terminal verdict). Go to Step 6 (closure).

#### 5f. Escalation Path (All 6 Conditions Converge Here)

🔴 **This is the unified path for all 6 failure/escalation conditions.** 🔴

Call `escalate_handoff_conversation(conversationId, reason: [stalled_subagent|workspace_unreachable])` with the reason determined in Step 5d.

Prompt the human:

```
The [source|target] workspace became unreachable/stalled ([reason detail]).
What would you like to do?

1) Retry this side (dispatch the same subagent again)
2) Decide yourself (action or dismiss with a note; resume with your ruling)
3) End the conversation (close without resolving; handoff stays open)
```

Human choice handler:

- **Choice 1 (Retry):**
  - Go back to Step 5a (or 5b if this was the handshake itself).
  - Retry the same side with the same brief.

- **Choice 2 (Decide Yourself):**
  - Prompt: "Action or dismiss? If action, provide a resolution note."
  - Human replies: action | dismiss, plus note text.
  - Call `resume_handoff_conversation(conversationId, verdict: [action|dismiss], note, raiseTurnCapBy: 0)` (optionally allow human to raise the cap 1–10 turns if they want more negotiation after their ruling).
  - Check the returned status:
    - If `active`: Back to loop (Step 5a), next speaker is the other side.
    - If any other terminal status: Follow that path (e.g., `closed_agreed` → Step 6).

- **Choice 3 (End):**
  - Call `close_handoff_conversation_by_human(conversationId)`.
  - Report: "Conversation closed. The handoff remains open and untouched in its current state."
  - Stop.

---

## Closure (Step 6)

When the conversation reaches `status = closed_agreed`:

### 6a. Draft the Resolution

Call `draft_handoff_resolution(conversationId, action: [action|dismiss], draftedNote: "[synthesized note from transcript]")`.

This records the proposed resolution on the conversation **without touching the Handoff's status**.

### 6b. Show the Drafted Resolution to the Human

Render:

```
Both sides agreed: [action|dismiss]

Proposed resolution note:
"[draftedNote]"

Proceed? (Yes to finalize / No to abandon)
```

### 6c. Human Confirmation (Critical Gate)

- **Yes:** Proceed to 6d.
- **No:** Stop. The draft remains on the conversation as an audit record of what was proposed but not accepted. The Handoff is untouched.

### 6d. Finalize (Only After Explicit Confirmation)

Human said "Yes". Now and only now call the terminal tool:

- If agreed verdict was `action`: `action_handoff(handoffId, resolutionNote: "[note]")`.
- If agreed verdict was `dismiss`: `dismiss_handoff(handoffId, resolutionNote: "[note]")`.

This is the **only path** by which a Handoff reaches a terminal status (`actioned` or `dismissed`) via the conversation flow.

Report to human: "Handoff [actioned|dismissed]. Conversation complete."

---

## Transcript Visibility

Every turn is visible to the human in their own session's transcript automatically. The arbiter prompt, the subagent replies, the human's choices, and the final resolution are all part of the same conversation thread. No extra tooling, no polling, no separate logging is needed.

---

## Summary of Critical Invariants

1. **Arbiter is the human.** There is no separate arbiter spawn. The human sees every prompt and turn inline.
2. **Harness is generic.** No product-specific agent names or capabilities; only spawn/promptHuman/visible-transcript.
3. **Reachability is strict.** If any probe in Step 3 fails, stop immediately; do not start the conversation.
4. **Escalation is unified.** All 6 failure/stall conditions converge on the same escalate+promptHuman flow.
5. **Confirmation is mandatory.** `action_handoff`/`dismiss_handoff` are called **only after explicit human confirmation** in Step 6c.
6. **DraftHandoffResolution is non-destructive.** It records on the conversation only; the Handoff is unchanged until the human confirms.

---

## Acceptance Criteria (Story 6/8)

- [ ] Arbiter is always the human's own session (no arbiter spawn mentioned anywhere).
- [ ] Harness requirements are generic and product-agnostic.
- [ ] Reachability probe refuses to start on any failure; reports which side failed.
- [ ] All 6 escalation conditions (spawn error, stat fail, wrong id, 180s timeout, UNREACHABLE, unparseable) use identical escalate+promptHuman path.
- [ ] Human choices (retry/decide/end) are offered for all 6 conditions uniformly.
- [ ] `action_handoff`/`dismiss_handoff` require explicit "Yes" confirmation after draft review.
- [ ] If human declines (says "No" in Step 6c), nothing is recorded on the Handoff; draft stays as audit trail.
- [ ] Transcript visibility is automatic; the skill prose acknowledges this explicitly.
