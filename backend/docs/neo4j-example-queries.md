# Neo4j Example Queries for Rig Specs

## Getting Started

### 1. List All Specs
```cypher
MATCH (s:Spec)
RETURN s.slug, s.featureName, s.status, 
       s.requirementsStatus, s.designStatus,
       s.createdAt, s.updatedAt
ORDER BY s.createdAt DESC
```

### 2. Get Full Spec Details by Slug
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})
RETURN s
```

---

## Requirements Stage

### 3. View All User Stories for a Spec
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_USER_STORY]->(us:UserStory)
RETURN us.storyNumber, us.title, us.role, us.capability, us.benefit
ORDER BY us.storyNumber
```

### 4. View User Stories with Their Acceptance Criteria
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_USER_STORY]->(us:UserStory)
OPTIONAL MATCH (us)-[:HAS_ACCEPTANCE_CRITERION]->(ac:AcceptanceCriterion)
RETURN us.storyNumber, us.title,
       collect({
         criterionNumber: ac.criterionNumber,
         earsPattern: ac.earsPattern,
         fullText: ac.fullText
       }) AS acceptanceCriteria
ORDER BY us.storyNumber
```

### 5. Count Requirements Artifacts
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})
OPTIONAL MATCH (s)-[:HAS_USER_STORY]->(us:UserStory)
OPTIONAL MATCH (us)-[:HAS_ACCEPTANCE_CRITERION]->(ac:AcceptanceCriterion)
OPTIONAL MATCH (s)-[:HAS_NON_GOAL]->(ng:NonGoal)
OPTIONAL MATCH (s)-[:HAS_GLOSSARY_TERM]->(gt:GlossaryTerm)
RETURN 
  count(DISTINCT us) AS userStoryCount,
  count(DISTINCT ac) AS acceptanceCriteriaCount,
  count(DISTINCT ng) AS nonGoalCount,
  count(DISTINCT gt) AS glossaryTermCount
```

---

## Design Stage

### 6. View All Design Components
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_COMPONENT]->(dc:DesignComponent)
RETURN dc.slug, dc.displayName, dc.createdAt
ORDER BY dc.slug
```

### 7. View Design Components with Their Tasks Docs
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_COMPONENT]->(dc:DesignComponent)
OPTIONAL MATCH (dc)-[:HAS_TASKS_DOC]->(td:TasksDoc)
RETURN dc.slug, dc.displayName,
       td.id AS tasksDocId,
       td.status AS tasksDocStatus,
       td.componentName
ORDER BY dc.slug
```

### 8. View Data Model Entries
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_DATA_MODEL_ENTRY]->(dme:DataModelEntry)
RETURN dme.name, dme.kind, dme.content
ORDER BY dme.name
```

### 9. View Traceability (Requirements → Design)
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_TRACEABILITY_ENTRY]->(te:TraceabilityEntry)
OPTIONAL MATCH (te)-[:TRACES_TO]->(us:UserStory)
RETURN te.requirementLabel, us.title AS userStoryTitle, te.addressedBy
ORDER BY te.requirementLabel
```

---

## Tasks Stage

### 10. View All Task Items for a Spec
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_COMPONENT]->(dc:DesignComponent)
      -[:HAS_TASKS_DOC]->(td:TasksDoc)-[:HAS_TASK_ITEM]->(ti:TaskItem)
WHERE ti.parentItemId IS NULL  // Top-level tasks only
RETURN td.componentSlug, ti.itemId, ti.title, ti.isChecked, ti.suggestedAgent
ORDER BY td.componentSlug, ti.executionOrder
```

### 11. View Tasks with Their Subtasks
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_COMPONENT]->(dc:DesignComponent)
      -[:HAS_TASKS_DOC]->(td:TasksDoc)-[:HAS_TASK_ITEM]->(parent:TaskItem)
WHERE parent.parentItemId IS NULL
OPTIONAL MATCH (parent)-[:HAS_SUBTASK]->(child:TaskItem)
RETURN td.componentSlug, 
       parent.itemId AS parentItemId,
       parent.title AS parentTitle,
       parent.isChecked AS parentChecked,
       collect({
         itemId: child.itemId,
         title: child.title,
         isChecked: child.isChecked
       }) AS subtasks
ORDER BY td.componentSlug, parent.executionOrder
```

### 12. View Task Progress by Component
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_COMPONENT]->(dc:DesignComponent)
      -[:HAS_TASKS_DOC]->(td:TasksDoc)
OPTIONAL MATCH (td)-[:HAS_TASK_ITEM]->(ti:TaskItem)
RETURN td.componentSlug,
       td.status AS tasksDocStatus,
       count(ti) AS totalTasks,
       sum(CASE WHEN ti.isChecked THEN 1 ELSE 0 END) AS completedTasks,
       round(100.0 * sum(CASE WHEN ti.isChecked THEN 1 ELSE 0 END) / count(ti), 1) AS percentComplete
ORDER BY td.componentSlug
```

### 13. View Task Traceability to Acceptance Criteria
```cypher
MATCH (ti:TaskItem {id: 'task-item-id'})-[:SATISFIES]->(ac:AcceptanceCriterion)
      <-[:HAS_ACCEPTANCE_CRITERION]-(us:UserStory)
RETURN ti.title AS taskTitle,
       us.storyNumber, us.title AS userStoryTitle,
       ac.criterionNumber, ac.fullText AS criterion
```

### 14. View Cross-Component Task Dependencies
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})
MATCH (from:TaskItem)-[r:BLOCKS {specId: s.id}]->(to:TaskItem)
MATCH (from)<-[:HAS_TASK_ITEM|HAS_SUBTASK*]-(fromDoc:TasksDoc)
MATCH (to)<-[:HAS_TASK_ITEM|HAS_SUBTASK*]-(toDoc:TasksDoc)
RETURN fromDoc.componentSlug AS blockerComponent,
       from.itemId AS blockerTask,
       from.title AS blockerTitle,
       toDoc.componentSlug AS blockedComponent,
       to.itemId AS blockedTask,
       to.title AS blockedTitle,
       r.createdAt
ORDER BY fromDoc.componentSlug, from.itemId
```

### 15. Find Task Items Touching Specific Files
```cypher
MATCH (ti:TaskItem)-[:HAS_FILE_TOUCHED]->(ft:FileTouched)
WHERE ft.filePath CONTAINS 'service'
MATCH (ti)<-[:HAS_TASK_ITEM|HAS_SUBTASK*]-(td:TasksDoc)
RETURN td.componentSlug, ti.itemId, ti.title,
       collect(ft.filePath) AS filesTouched
ORDER BY td.componentSlug, ti.itemId
```

### 16. View Parallel Execution Batches
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_COMPONENT]->(dc:DesignComponent)
      -[:HAS_TASKS_DOC]->(td:TasksDoc)-[:HAS_BATCH]->(pb:ParallelBatch)
OPTIONAL MATCH (pb)-[:HAS_MEMBER]->(ti:TaskItem)
RETURN td.componentSlug,
       pb.batchLabel,
       pb.batchOrder,
       collect(ti.itemId + ': ' + ti.title) AS batchMembers
ORDER BY td.componentSlug, pb.batchOrder
```

---

## Open Questions & Issues

### 17. View All Open Questions for a Spec
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_OPEN_QUESTION]->(oq:OpenQuestion)
WHERE oq.resolvedAt IS NULL
RETURN oq.stage, oq.description, oq.createdAt
ORDER BY oq.stage, oq.createdAt
```

### 18. View Open Questions by Stage
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_OPEN_QUESTION]->(oq:OpenQuestion)
WHERE oq.resolvedAt IS NULL
WITH oq.stage AS stage, count(*) AS openCount
RETURN stage, openCount
ORDER BY stage
```

### 19. View All Open Risks
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_OPEN_RISK]->(risk:OpenRisk)
RETURN risk.description, risk.createdAt, risk.updatedAt
ORDER BY risk.createdAt
```

---

## Comprehensive Status Overview

### 20. Spec Status Dashboard
```cypher
MATCH (s:Spec {slug: 'your-spec-slug'})
OPTIONAL MATCH (s)-[:HAS_USER_STORY]->(us:UserStory)
OPTIONAL MATCH (us)-[:HAS_ACCEPTANCE_CRITERION]->(ac:AcceptanceCriterion)
OPTIONAL MATCH (s)-[:HAS_COMPONENT]->(dc:DesignComponent)
OPTIONAL MATCH (dc)-[:HAS_TASKS_DOC]->(td:TasksDoc)
OPTIONAL MATCH (td)-[:HAS_TASK_ITEM]->(ti:TaskItem)
OPTIONAL MATCH (s)-[:HAS_OPEN_QUESTION]->(oq:OpenQuestion)
WHERE oq.resolvedAt IS NULL
OPTIONAL MATCH (s)-[:HAS_OPEN_RISK]->(risk:OpenRisk)
RETURN 
  s.slug,
  s.featureName,
  s.status AS overallStatus,
  s.requirementsStatus,
  s.designStatus,
  count(DISTINCT us) AS userStories,
  count(DISTINCT ac) AS acceptanceCriteria,
  count(DISTINCT dc) AS components,
  count(DISTINCT td) AS tasksDocs,
  count(DISTINCT ti) AS totalTasks,
  sum(CASE WHEN ti.isChecked THEN 1 ELSE 0 END) AS completedTasks,
  count(DISTINCT oq) AS openQuestions,
  count(DISTINCT risk) AS openRisks
```

### 21. Definition of Done Checklist
```cypler
MATCH (s:Spec {slug: 'your-spec-slug'})-[:HAS_DOD_ITEM]->(dod:DefinitionOfDoneItem)
RETURN dod.ordinal, dod.description, dod.isChecked
ORDER BY dod.ordinal
```

### 22. Find Orphaned Tasks Docs (blocks finalize)
```cypher
MATCH (td:TasksDoc {specId: 'spec-id'})
WHERE NOT EXISTS { (:DesignComponent)-[:HAS_TASKS_DOC]->(td) }
RETURN td.componentSlug, td.componentName, td.id
```

### 23. Check for Task Dependency Cycles
```cypher
MATCH (t:TaskItem)-[:BLOCKS* {specId: 'spec-id'}]->(t)
RETURN DISTINCT t.itemId, t.title
LIMIT 10
```

---

## Tips for Usage

1. **Replace placeholders**: Change `'your-spec-slug'` or `'spec-id'` with actual values
2. **Get spec IDs**: Use query #2 to get the internal ID if needed
3. **Combine queries**: Use `UNION` to combine multiple result sets
4. **Add filters**: Use `WHERE` clauses to filter by status, dates, etc.
5. **Performance**: Add `LIMIT` clauses when exploring large datasets

## Common WHERE Filters

```cypher
// Filter by date range
WHERE s.createdAt > datetime('2024-01-01')

// Filter by status
WHERE td.status = 'approved'

// Filter by checked/unchecked
WHERE ti.isChecked = true

// Filter unresolved items
WHERE item.resolvedAt IS NULL

// Filter by agent
WHERE ti.suggestedAgent <> 'none'
```
