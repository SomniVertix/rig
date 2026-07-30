package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/somnivertix/rig/internal/graph/domain"
)

// RenderDocument renders one stage's markdown from live graph state —
// there is no stored document anywhere; requirements.md/design.md/tasks.md
// are always regenerated on demand, matching v1's render-on-read model.
// For stage "tasks", component "all" renders an index (every component's
// status) and a specific component slug renders that component's full
// tasks.md; component is ignored for the other two stages.
func (svc *Service) RenderDocument(ctx context.Context, specID, stage, component string) (string, error) {
	switch domain.SpecStage(stage) {
	case domain.SpecStageRequirements:
		return svc.renderRequirements(ctx, specID)
	case domain.SpecStageDesign:
		return svc.renderDesign(ctx, specID)
	case domain.SpecStageTasks:
		return svc.renderTasks(ctx, specID, component)
	default:
		return "", fmt.Errorf("service: render_document: unknown stage %q", stage)
	}
}

func (svc *Service) renderRequirements(ctx context.Context, specID string) (string, error) {
	spec, err := svc.store.GetSpec(ctx, specID)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# Requirements: %s\n\n", spec.FeatureName)
	fmt.Fprintf(&b, "## Overview\n\n%s\n\n", spec.RequirementsOverview)

	stories, err := svc.store.ListUserStories(ctx, specID)
	if err != nil {
		return "", err
	}
	b.WriteString("## User Stories\n\n")
	for _, story := range stories {
		fmt.Fprintf(&b, "### Story %d: %s\n\n", story.StoryNumber, story.Title)
		fmt.Fprintf(&b, "As a %s, I want %s, so that %s.\n\n", story.Role, story.Capability, story.Benefit)
		if story.Rationale != "" {
			fmt.Fprintf(&b, "%s\n\n", story.Rationale)
		}
		criteria, err := svc.store.ListAcceptanceCriteria(ctx, story.ID)
		if err != nil {
			return "", err
		}
		b.WriteString("#### Acceptance Criteria\n\n")
		for _, c := range criteria {
			fmt.Fprintf(&b, "%d. %s\n", c.CriterionNumber, c.FullText)
		}
		b.WriteString("\n")
	}

	nonGoals, err := svc.store.ListNonGoals(ctx, specID)
	if err != nil {
		return "", err
	}
	b.WriteString("## Non-Goals\n\n")
	for _, g := range nonGoals {
		fmt.Fprintf(&b, "- %s\n", g.Description)
	}
	b.WriteString("\n")

	unresolved, err := svc.store.ListUnresolvedOpenQuestions(ctx, specID, domain.SpecStageRequirements)
	if err != nil {
		return "", err
	}
	all, err := svc.store.ListOpenQuestions(ctx, specID)
	if err != nil {
		return "", err
	}
	b.WriteString("## Assumptions / Open Questions\n\n")
	for _, q := range all {
		if q.Stage != domain.SpecStageRequirements {
			continue
		}
		writeOpenQuestionLine(&b, q)
	}
	_ = unresolved // gate logic lives in checkNoUnresolvedOpenQuestions; rendering shows all, resolved or not
	b.WriteString("\n")

	terms, err := svc.store.ListGlossaryTerms(ctx, specID)
	if err != nil {
		return "", err
	}
	b.WriteString("## Glossary\n\n")
	for _, t := range terms {
		if t.Definition != nil {
			fmt.Fprintf(&b, "- **%s**: %s\n", t.Term, *t.Definition)
		} else if t.ExternalReference != nil {
			fmt.Fprintf(&b, "- **%s**: see %s\n", t.Term, *t.ExternalReference)
		}
	}
	return b.String(), nil
}

func (svc *Service) renderDesign(ctx context.Context, specID string) (string, error) {
	spec, err := svc.store.GetSpec(ctx, specID)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	fmt.Fprintf(&b, "# Design: %s\n\n", spec.FeatureName)
	fmt.Fprintf(&b, "## Overview\n\n%s\n\n", spec.DesignOverview)
	fmt.Fprintf(&b, "## Architecture\n\n%s\n\n", spec.DesignArchitecture)

	components, err := svc.store.ListDesignComponents(ctx, specID)
	if err != nil {
		return "", err
	}
	b.WriteString("## Components\n\n| Slug | Display Name |\n|---|---|\n")
	for _, c := range components {
		fmt.Fprintf(&b, "| %s | %s |\n", c.Slug, c.DisplayName)
	}
	b.WriteString("\n")

	if spec.DesignDataModelOverview != nil {
		fmt.Fprintf(&b, "%s\n\n", *spec.DesignDataModelOverview)
	}
	entries, err := svc.store.ListDataModelEntries(ctx, specID)
	if err != nil {
		return "", err
	}
	b.WriteString("## Data Model / Interfaces\n\n")
	for _, e := range entries {
		fmt.Fprintf(&b, "### %s (%s)\n\n```\n%s\n```\n\n", e.Name, e.Kind, e.Content)
	}

	traceability, err := svc.store.ListTraceabilityEntries(ctx, specID)
	if err != nil {
		return "", err
	}
	b.WriteString("## Requirement Traceability\n\n| Requirement | Addressed By |\n|---|---|\n")
	for _, t := range traceability {
		fmt.Fprintf(&b, "| %s | %s |\n", t.RequirementLabel, t.AddressedBy)
	}
	b.WriteString("\n")

	alternatives, err := svc.store.ListAlternatives(ctx, specID)
	if err != nil {
		return "", err
	}
	b.WriteString("## Alternatives Considered\n\n")
	for _, a := range alternatives {
		fmt.Fprintf(&b, "- %s\n", a.Description)
	}
	b.WriteString("\n")

	risks, err := svc.store.ListOpenRisks(ctx, specID)
	if err != nil {
		return "", err
	}
	b.WriteString("## Open Risks / Tradeoffs\n\n")
	for _, r := range risks {
		fmt.Fprintf(&b, "- %s\n", r.Description)
	}
	b.WriteString("\n")

	all, err := svc.store.ListOpenQuestions(ctx, specID)
	if err != nil {
		return "", err
	}
	b.WriteString("## Open Questions\n\n")
	for _, q := range all {
		if q.Stage != domain.SpecStageDesign {
			continue
		}
		writeOpenQuestionLine(&b, q)
	}
	return b.String(), nil
}

func (svc *Service) renderTasks(ctx context.Context, specID, component string) (string, error) {
	docs, err := svc.store.ListTasksDocs(ctx, specID)
	if err != nil {
		return "", err
	}

	if component == "" || component == "all" {
		var b strings.Builder
		b.WriteString("# Tasks — Component Index\n\n| Component | Status |\n|---|---|\n")
		for _, d := range docs {
			fmt.Fprintf(&b, "| %s | %s |\n", d.ComponentSlug, d.Status)
		}
		b.WriteString("\n## Definition of Done\n\n")
		dod, err := svc.store.ListDefinitionOfDoneItems(ctx, specID)
		if err != nil {
			return "", err
		}
		for _, item := range dod {
			checkbox := " "
			if item.IsChecked {
				checkbox = "x"
			}
			fmt.Fprintf(&b, "- [%s] %s\n", checkbox, item.Description)
		}
		return b.String(), nil
	}

	var doc *domain.TasksDoc
	for _, d := range docs {
		if d.ComponentSlug == component {
			doc = d
			break
		}
	}
	if doc == nil {
		return "", fmt.Errorf("service: render_document: component %q not found", component)
	}

	var b strings.Builder
	fmt.Fprintf(&b, "# Tasks: %s\n\n", doc.ComponentName)

	items, err := svc.store.ListTaskItems(ctx, doc.ID)
	if err != nil {
		return "", err
	}

	b.WriteString("## Order\n\n")
	for _, item := range items {
		checkbox := " "
		if item.IsChecked {
			checkbox = "x"
		}
		fmt.Fprintf(&b, "- [%s] %s. %s\n", checkbox, item.ItemID, item.Title)
	}
	b.WriteString("\n## Task List\n\n")
	for _, item := range items {
		fmt.Fprintf(&b, "### %s. %s\n\n%s\n\n", item.ItemID, item.Title, item.Description)
		criteria, err := svc.store.ListSatisfiedCriteria(ctx, item.ID)
		if err != nil {
			return "", err
		}
		refs := make([]string, 0, len(criteria))
		for _, c := range criteria {
			story, err := svc.store.GetUserStory(ctx, c.UserStoryID)
			if err != nil {
				return "", err
			}
			refs = append(refs, fmt.Sprintf("%d.%d", story.StoryNumber, c.CriterionNumber))
		}
		fmt.Fprintf(&b, "Traceability: %s\n\n", strings.Join(refs, ", "))
		fmt.Fprintf(&b, "Suggested agent: %s\n\n", item.SuggestedAgent)
		fmt.Fprintf(&b, "Acceptance check: %s\n\n", item.AcceptanceCheck)
		files, err := svc.store.ListFilesTouched(ctx, item.ID)
		if err != nil {
			return "", err
		}
		b.WriteString("Files/areas touched:\n")
		for _, f := range files {
			fmt.Fprintf(&b, "- %s\n", f.FilePath)
		}
		b.WriteString("\n")
	}

	batches, err := svc.store.ListParallelBatches(ctx, doc.ID)
	if err != nil {
		return "", err
	}
	b.WriteString("## Parallel Execution Schema\n\n")
	for _, batch := range batches {
		members, err := svc.store.ListParallelBatchMembers(ctx, batch.ID)
		if err != nil {
			return "", err
		}
		ids := make([]string, 0, len(members))
		for _, m := range members {
			ids = append(ids, m.ItemID)
		}
		fmt.Fprintf(&b, "- %s: %s\n", batch.BatchLabel, strings.Join(ids, ", "))
	}
	b.WriteString("\n")

	all, err := svc.store.ListOpenQuestions(ctx, specID)
	if err != nil {
		return "", err
	}
	b.WriteString("## Flags / Open Questions\n\n")
	for _, q := range all {
		if q.Stage != domain.SpecStageTasks {
			continue
		}
		if q.TargetID != nil && *q.TargetID != doc.ID {
			continue
		}
		writeOpenQuestionLine(&b, q)
	}
	return b.String(), nil
}

func writeOpenQuestionLine(b *strings.Builder, q *domain.OpenQuestion) {
	status := "open"
	if q.Resolved {
		status = "resolved"
	}
	fmt.Fprintf(b, "- [%s] %s\n", status, q.Description)
}
