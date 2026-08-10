# Task Completion Tracking Fix

## Problem

RIG had a critical gap in task completion tracking that broke crash recovery:

```
┌─────────────────┐
│  Orchestrator   │
└────────┬────────┘
         │ delegates task
         ▼
┌─────────────────┐
│  Implementer    │  ← does work, returns
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Orchestrator   │  ← SHOULD mark task complete
└─────────────────┘  ← ❌ BUT if it crashes here,
                        task stays unmarked!
```

**The flaw**: The orchestrator delegates work to implementer agents (`code-implementer`, 
`test-writer`, `code-reviewer`), they complete the work and return, then the orchestrator 
is *supposed* to call `mcp__rig__update_task_item` to mark the task complete. But if the 
orchestrator crashes or errors after the implementer returns but before marking complete, 
the task stays unmarked forever - breaking the guarantee that another agent can pick up 
exactly where things left off.

## The Fix

**Have implementers mark their own tasks complete** before returning, rather than relying 
on the orchestrator to do it post-facto.

### Changes Made

#### 1. `code-implementer.md`
- Added `mcp__rig__update_task_item` to tools
- Added instruction to call it with `isChecked: true` before returning
- Emphasized this must happen **before return** for crash recovery

#### 2. `test-writer.md`
- Added `mcp__rig__update_task_item` to tools
- Added instruction to call it with `isChecked: true` before returning
- Same crash-recovery emphasis

#### 3. `code-reviewer.md`
- Added `mcp__rig__update_task_item` to tools
- Added instruction to mark review task complete before returning
- Note: `code-reviewer` is special - it's a task itself when assigned by `tasks-drafter`

#### 4. `spec-implementation-orchestrator.md`
- Updated procedure step 4 to reflect that implementers mark themselves complete
- Changed orchestrator's role from "mark complete" to "verify completion happened"
- Orchestrator now checks via `list_task_items` that tasks were actually marked
- Falls back to marking if implementer forgot (with bug report)

### New Execution Flow

```
┌─────────────────┐
│  Orchestrator   │
└────────┬────────┘
         │ delegates task
         ▼
┌─────────────────┐
│  Implementer    │  ← does work
│                 │  ← calls update_task_item ✓
│                 │  ← returns
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Orchestrator   │  ← verifies task is marked
└─────────────────┘  ← crash here is safe! ✓
```

## Why This Matters

This is **critical for RIG's core value proposition**: guaranteeing that if an agent crashes 
for any reason, the next agent can pick up exactly where it left off. The task checklist 
is the resumption state - it must be accurate **during** execution, not just after.

### Before (broken)
- Tasks unmarked until orchestrator processed returns
- Crash = lost work tracking
- Manual reconciliation required

### After (fixed)
- Each task marked complete by the agent that did it
- Crash-safe at every step
- Next agent sees accurate state always

## Testing Checklist

- [ ] Spawn `code-implementer` for a task, verify it calls `update_task_item`
- [ ] Spawn `test-writer` for a task, verify it calls `update_task_item`
- [ ] Spawn `code-reviewer` for a review task, verify it calls `update_task_item`
- [ ] Kill orchestrator mid-run, verify already-completed tasks stay marked
- [ ] Restart orchestrator after crash, verify it skips already-completed tasks
- [ ] Verify orchestrator's fallback marking works if implementer forgets

## Migration Notes

**Backward compatibility**: This is forward-only. Old implementers won't mark tasks 
complete, but the orchestrator's new fallback marking handles them. Future runs will use 
the new pattern automatically.

**For v1 backport**: If v1 needs this fix, the same pattern applies - give implementers 
access to the completion tool and update their prompts. Check v1's orchestrator prompt and 
adjust similarly.
