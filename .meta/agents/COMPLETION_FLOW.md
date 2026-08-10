# Task Completion Flow - Before and After

## Before (Broken)

```
┌─────────────────────────────────┐
│ spec-implementation-orchestrator│
└────────────┬────────────────────┘
             │
             │ 1. Agent(code-implementer, task_id=123)
             │
             ▼
        ┌─────────────────┐
        │ code-implementer│
        ├─────────────────┤
        │ • reads task    │
        │ • implements it │
        │ • returns       │
        └────────┬────────┘
                 │
                 │ 2. "Done!"
                 │
                 ▼
        ┌─────────────────────────┐
        │ orchestrator            │
        ├─────────────────────────┤
        │ 3. Should call:         │
        │    update_task_item(    │
        │      id: 123,           │
        │      isChecked: true)   │
        │                         │
        │ ❌ CRASH HERE =        │
        │    TASK STAYS UNMARKED! │
        └─────────────────────────┘
```

**Problem**: State update happens AFTER implementer returns. If orchestrator 
crashes between steps 2 and 3, task completion is lost forever.

## After (Fixed)

```
┌─────────────────────────────────┐
│ spec-implementation-orchestrator│
└────────────┬────────────────────┘
             │
             │ 1. Agent(code-implementer, task_id=123)
             │
             ▼
        ┌─────────────────────────┐
        │ code-implementer        │
        ├─────────────────────────┤
        │ • reads task            │
        │ • implements it         │
        │ • ✓ marks complete:     │
        │   update_task_item(     │
        │     id: 123,            │
        │     isChecked: true)    │
        │ • returns               │
        └────────┬────────────────┘
                 │
                 │ 2. "Done! (marked complete)"
                 │
                 ▼
        ┌─────────────────────────┐
        │ orchestrator            │
        ├─────────────────────────┤
        │ 3. Validates:           │
        │    list_task_items()    │
        │    → 123 is checked ✓   │
        │                         │
        │ 4. Updates TodoWrite    │
        │                         │
        │ ✓ CRASH HERE IS SAFE!  │
        │   Task already marked!  │
        └─────────────────────────┘
```

**Solution**: Implementer marks complete BEFORE returning. State is correct 
the moment work finishes. Orchestrator just validates.

## Key Invariant

**Task completion state must be accurate DURING execution, not just after.**

This is what enables the core RIG guarantee:

> If an agent crashes for any reason, the next agent can pick up exactly 
> where it left off.

### Before:
- State accurate only after orchestrator processes returns
- Crash window = all the time between implementer return and orchestrator marking
- Manual reconciliation required on crash

### After:
- State accurate the moment implementer finishes
- Crash window = none (state already persisted)
- Automatic recovery via reading current state

## Implementation Details

### Tools Each Agent Has

**code-implementer**:
- `mcp__rig__update_task_item` ✓ (NEW)
- Read, Write, Edit, Bash, Grep, Glob, Agent

**test-writer**:
- `mcp__rig__update_task_item` ✓ (NEW)
- Read, Write, Edit, Bash, Grep, Glob

**code-reviewer**:
- `mcp__rig__update_task_item` ✓ (NEW)
- Read, Grep, Glob, Bash, ReportFindings

**spec-implementation-orchestrator**:
- `mcp__rig__update_task_item` (already had it)
- `mcp__rig__list_task_items` ✓ (uses for validation)
- Agent, Bash, TodoWrite, Grep, Glob
- Various rig read tools

### Who Marks What

| Task Type | Marked By | Verified By |
|-----------|-----------|-------------|
| Leaf task (implement) | `code-implementer` | `orchestrator` |
| Leaf task (test) | `test-writer` | `orchestrator` |
| Leaf task (review) | `code-reviewer` | `orchestrator` |
| Parent task | `orchestrator` | — |
| Definition of Done | `orchestrator` | — |

### Orchestrator's New Role

**Before**: Mark tasks complete after dispatch
**After**: Validate tasks were marked complete during dispatch

```typescript
// After implementer returns:
const tasks = await list_task_items(componentSlug);
const thisTask = tasks.find(t => t.id === taskId);

if (!thisTask.isChecked) {
  // BUG: Implementer forgot to mark complete
  console.warn(`Task ${taskId} not marked by implementer - fallback marking`);
  await update_task_item({ id: taskId, isChecked: true, actor: "orchestrator-fallback" });
} else {
  // EXPECTED: Implementer marked it
  console.log(`Task ${taskId} correctly marked by implementer`);
}

// Update TodoWrite to reflect completion
todoWrite.check(taskId);
```

## Testing the Fix

### Test 1: Normal Flow
```bash
# Run orchestrator on a spec with one task
# Expected: task marked immediately when implementer returns
# Check: task_item.is_checked = true before orchestrator's next step
```

### Test 2: Crash Recovery
```bash
# Run orchestrator, kill it mid-execution after one task returns
# Restart orchestrator on same spec
# Expected: Already-completed task skipped, next task starts
# Check: No duplicate work, no lost completion
```

### Test 3: Implementer Forgets
```bash
# Temporarily break an implementer to not call update_task_item
# Run orchestrator
# Expected: Orchestrator's fallback catches it, marks complete, logs warning
# Check: Task still completes, warning appears in logs
```

### Test 4: Parent Task Marking
```bash
# Run spec with parent task + 3 subtasks
# Expected: Subtasks marked by implementers, parent marked by orchestrator
# Check: Parent can't be marked until all children done (guardrail)
```

## Migration Notes

### Backward Compatibility
- Old implementers (without update_task_item call) still work
- Orchestrator's fallback handles them
- No database migration needed
- Forward-compatible from first deploy

### Deployment
1. Deploy new agent skills (copy .md to ~/.claude/skills/)
2. No database changes required
3. Works immediately for new runs
4. Old in-progress runs use orchestrator fallback

### Monitoring
Watch for these log patterns:
- ✅ `correctly marked by implementer` - expected
- ⚠️  `fallback marking` - implementer forgot, but recovered
- ❌ Task unmarked after crash - should never happen now

## Related Files

- `.meta/agents/code-implementer.md` - Main implementer
- `.meta/agents/test-writer.md` - Test writing specific
- `.meta/agents/code-reviewer.md` - Review specific
- `.meta/agents/spec-implementation-orchestrator.md` - Orchestration logic
- `v1/packages/server/src/mcp/tools/tasks-tools.ts` - Tool implementation
- `v1/packages/server/src/mcp/guardrails/checkbox-rule.ts` - Parent/child validation
