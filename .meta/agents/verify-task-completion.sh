#!/bin/bash
# Verification script for task completion tracking fix

set -e

echo "=== Task Completion Tracking Verification ==="
echo

# Check that implementers have the tool
echo "1. Checking tool grants..."

for agent in code-implementer test-writer code-reviewer; do
    if grep -q "mcp__rig__update_task_item" "$agent.md"; then
        echo "  ✓ $agent has update_task_item tool"
    else
        echo "  ✗ $agent missing update_task_item tool"
        exit 1
    fi
done

echo

# Check that implementers have instructions to mark complete
echo "2. Checking completion instructions..."

for agent in code-implementer test-writer code-reviewer; do
    if grep -qi "mark.*task complete" "$agent.md" && grep -qi "update_task_item" "$agent.md" && grep -qi "isChecked.*true" "$agent.md"; then
        echo "  ✓ $agent has completion instructions"
    else
        echo "  ✗ $agent missing completion instructions"
        exit 1
    fi
done

echo

# Check that orchestrator validates completion
echo "3. Checking orchestrator validation..."

if grep -q "verify.*list_task_items.*actually marked itself" spec-implementation-orchestrator.md; then
    echo "  ✓ Orchestrator validates completion"
else
    echo "  ✗ Orchestrator missing validation logic"
    exit 1
fi

if grep -qi "fallback" spec-implementation-orchestrator.md && grep -qi "update_task_item.*yourself" spec-implementation-orchestrator.md; then
    echo "  ✓ Orchestrator has fallback marking"
else
    echo "  ✗ Orchestrator missing fallback marking"
    exit 1
fi

echo
echo "=== All checks passed! ==="
echo
echo "Next steps:"
echo "  1. Deploy agents: Copy .md files to ~/.claude/skills/*/SKILL.md"
echo "  2. Test with real spec: Run orchestrator on approved tasks"
echo "  3. Verify completion: Check task_item.is_checked updates immediately"
echo "  4. Test crash recovery: Kill orchestrator mid-run, restart, verify state"
