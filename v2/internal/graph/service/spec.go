package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// Gate errors — the bounded rules worked out in the design interview
// (spec-pipeline-graph.md at the repo root). Each wraps store.ErrConflict
// where the underlying condition is itself a conflict, so callers can still
// errors.Is(err, store.ErrConflict) if they only care about that broad
// category.

// ErrUnresolvedOpenQuestions blocks BOTH finalize_stage and approve
// (decision 6) — a deliberate behavior change from v1, where flags never
// gated anything.
var ErrUnresolvedOpenQuestions = errors.New("service: unresolved open questions must be resolved before this action")

// ErrRequirementsIncomplete mirrors v1's zero_top_level_items/
// zero_acceptance_criteria finalize gates.
var ErrRequirementsIncomplete = errors.New("service: requirements needs at least one user story, each with at least one acceptance criterion")

// ErrDesignIncomplete mirrors v1's zero_components finalize gate.
var ErrDesignIncomplete = errors.New("service: design needs at least one component")

// ErrOrphanedTasksDocs is stricter than v1 (decision 10): ANY orphaned
// TasksDoc blocks design's finalize, even an empty one — no silent delete.
var ErrOrphanedTasksDocs = errors.New("service: a removed design component still has a tasks doc — resolve before finalizing design")

// ErrTasksIncomplete mirrors v1's zero_task_files_touched finalize gate
// (zero top-level items and zero SATISFIES edges are already impossible —
// enforced by the store at insert time).
var ErrTasksIncomplete = errors.New("service: each top-level task item needs at least one file touched")

// ErrTaskDependencyCycle mirrors v1's cycle_detected finalize gate.
var ErrTaskDependencyCycle = errors.New("service: task dependency edges contain a cycle")

func (svc *Service) CreateSpec(ctx context.Context, params store.CreateSpecParams) (*domain.Spec, error) {
	if !slugPattern.MatchString(params.Slug) {
		return nil, ErrInvalidSlug
	}
	if strings.TrimSpace(params.FeatureName) == "" {
		return nil, fmt.Errorf("service: create_spec requires a non-empty feature name")
	}
	return svc.store.CreateSpec(ctx, params)
}

func (svc *Service) GetSpec(ctx context.Context, id string) (*domain.Spec, error) {
	return svc.store.GetSpec(ctx, id)
}

func (svc *Service) GetSpecBySlug(ctx context.Context, workspaceID, slug string) (*domain.Spec, error) {
	return svc.store.GetSpecBySlug(ctx, workspaceID, slug)
}

func (svc *Service) ListSpecs(ctx context.Context, workspaceID string) ([]*domain.Spec, error) {
	return svc.store.ListSpecs(ctx, workspaceID)
}

// DeriveTasksStageStatus computes the tasks stage's spec-wide aggregate
// status live from its TasksDoc nodes — there is no stored aggregate,
// mirroring v1's deriveTasksAggregateStatus.
func (svc *Service) DeriveTasksStageStatus(ctx context.Context, specID string) (domain.SpecStageStatus, error) {
	return svc.store.DeriveTasksStageStatus(ctx, specID)
}

func (svc *Service) SetRequirementsOverview(ctx context.Context, specID, overview string) (*domain.Spec, error) {
	return svc.store.UpdateSpecStageText(ctx, specID, store.UpdateSpecStageTextParams{RequirementsOverview: &overview})
}

func (svc *Service) SetDesignOverview(ctx context.Context, specID, overview string) (*domain.Spec, error) {
	return svc.store.UpdateSpecStageText(ctx, specID, store.UpdateSpecStageTextParams{DesignOverview: &overview})
}

func (svc *Service) SetDesignArchitecture(ctx context.Context, specID, architecture string) (*domain.Spec, error) {
	return svc.store.UpdateSpecStageText(ctx, specID, store.UpdateSpecStageTextParams{DesignArchitecture: &architecture})
}

func (svc *Service) SetDesignDataModelOverview(ctx context.Context, specID, overview string) (*domain.Spec, error) {
	return svc.store.UpdateSpecStageText(ctx, specID, store.UpdateSpecStageTextParams{DesignDataModelOverview: &overview})
}

// --- Requirements artifacts ---------------------------------------------

func (svc *Service) AddUserStory(ctx context.Context, params store.AddUserStoryParams) (*domain.UserStory, error) {
	return svc.store.AddUserStory(ctx, params)
}

func (svc *Service) GetUserStory(ctx context.Context, id string) (*domain.UserStory, error) {
	return svc.store.GetUserStory(ctx, id)
}

func (svc *Service) ListUserStories(ctx context.Context, specID string) ([]*domain.UserStory, error) {
	return svc.store.ListUserStories(ctx, specID)
}

func (svc *Service) UpdateUserStory(ctx context.Context, id string, params store.UpdateUserStoryParams) (*domain.UserStory, error) {
	return svc.store.UpdateUserStory(ctx, id, params)
}

func (svc *Service) DeleteUserStory(ctx context.Context, id string) error {
	return svc.store.DeleteUserStory(ctx, id)
}

func (svc *Service) AddAcceptanceCriterion(ctx context.Context, params store.AddAcceptanceCriterionParams) (*domain.AcceptanceCriterion, error) {
	return svc.store.AddAcceptanceCriterion(ctx, params)
}

func (svc *Service) GetAcceptanceCriterion(ctx context.Context, id string) (*domain.AcceptanceCriterion, error) {
	return svc.store.GetAcceptanceCriterion(ctx, id)
}

func (svc *Service) ListAcceptanceCriteria(ctx context.Context, userStoryID string) ([]*domain.AcceptanceCriterion, error) {
	return svc.store.ListAcceptanceCriteria(ctx, userStoryID)
}

func (svc *Service) UpdateAcceptanceCriterion(ctx context.Context, id string, params store.UpdateAcceptanceCriterionParams) (*domain.AcceptanceCriterion, error) {
	return svc.store.UpdateAcceptanceCriterion(ctx, id, params)
}

func (svc *Service) DeleteAcceptanceCriterion(ctx context.Context, id string) error {
	return svc.store.DeleteAcceptanceCriterion(ctx, id)
}

func (svc *Service) AddNonGoal(ctx context.Context, specID, description string) (*domain.NonGoal, error) {
	if strings.TrimSpace(description) == "" {
		return nil, fmt.Errorf("service: add_non_goal requires a non-empty description")
	}
	return svc.store.AddNonGoal(ctx, specID, description)
}

func (svc *Service) UpdateNonGoal(ctx context.Context, id, description string) (*domain.NonGoal, error) {
	return svc.store.UpdateNonGoal(ctx, id, description)
}

func (svc *Service) DeleteNonGoal(ctx context.Context, id string) error {
	return svc.store.DeleteNonGoal(ctx, id)
}

func (svc *Service) ListNonGoals(ctx context.Context, specID string) ([]*domain.NonGoal, error) {
	return svc.store.ListNonGoals(ctx, specID)
}

func (svc *Service) AddGlossaryTerm(ctx context.Context, params store.AddGlossaryTermParams) (*domain.GlossaryTerm, error) {
	hasDef := params.Definition != nil
	hasRef := params.ExternalReference != nil
	if hasDef == hasRef {
		return nil, fmt.Errorf("service: glossary term requires exactly one of definition or externalReference")
	}
	return svc.store.AddGlossaryTerm(ctx, params)
}

func (svc *Service) UpdateGlossaryTerm(ctx context.Context, id string, params store.UpdateGlossaryTermParams) (*domain.GlossaryTerm, error) {
	return svc.store.UpdateGlossaryTerm(ctx, id, params)
}

func (svc *Service) DeleteGlossaryTerm(ctx context.Context, id string) error {
	return svc.store.DeleteGlossaryTerm(ctx, id)
}

func (svc *Service) ListGlossaryTerms(ctx context.Context, specID string) ([]*domain.GlossaryTerm, error) {
	return svc.store.ListGlossaryTerms(ctx, specID)
}

// --- Open questions (unified across all three stages, decision 5) -------

func (svc *Service) AddOpenQuestion(ctx context.Context, params store.AddOpenQuestionParams) (*domain.OpenQuestion, error) {
	if strings.TrimSpace(params.Description) == "" {
		return nil, fmt.Errorf("service: add_open_question requires a non-empty description")
	}
	return svc.store.AddOpenQuestion(ctx, params)
}

func (svc *Service) UpdateOpenQuestion(ctx context.Context, id, description string) (*domain.OpenQuestion, error) {
	return svc.store.UpdateOpenQuestion(ctx, id, description)
}

func (svc *Service) ResolveOpenQuestion(ctx context.Context, id string, params store.ResolveOpenQuestionParams) (*domain.OpenQuestion, error) {
	if strings.TrimSpace(params.ResolvedBy) == "" {
		return nil, fmt.Errorf("service: resolve_open_question requires a non-empty resolvedBy")
	}
	if strings.TrimSpace(params.ResolvedReason) == "" {
		return nil, fmt.Errorf("service: resolve_open_question requires a non-empty resolvedReason")
	}
	return svc.store.ResolveOpenQuestion(ctx, id, params)
}

func (svc *Service) DeleteOpenQuestion(ctx context.Context, id string) error {
	return svc.store.DeleteOpenQuestion(ctx, id)
}

func (svc *Service) ListOpenQuestions(ctx context.Context, specID string) ([]*domain.OpenQuestion, error) {
	return svc.store.ListOpenQuestions(ctx, specID)
}

// --- Design artifacts -----------------------------------------------------

func (svc *Service) AddDesignComponent(ctx context.Context, params store.AddDesignComponentParams) (*domain.DesignComponent, error) {
	if !slugPattern.MatchString(params.Slug) {
		return nil, ErrInvalidSlug
	}
	return svc.store.AddDesignComponent(ctx, params)
}

func (svc *Service) UpdateDesignComponent(ctx context.Context, id string, params store.UpdateDesignComponentParams) (*domain.DesignComponent, error) {
	return svc.store.UpdateDesignComponent(ctx, id, params)
}

func (svc *Service) DeleteDesignComponent(ctx context.Context, id string) error {
	return svc.store.DeleteDesignComponent(ctx, id)
}

func (svc *Service) ListDesignComponents(ctx context.Context, specID string) ([]*domain.DesignComponent, error) {
	return svc.store.ListDesignComponents(ctx, specID)
}

func (svc *Service) AddDataModelEntry(ctx context.Context, params store.AddDataModelEntryParams) (*domain.DataModelEntry, error) {
	return svc.store.AddDataModelEntry(ctx, params)
}

func (svc *Service) UpdateDataModelEntry(ctx context.Context, id string, params store.UpdateDataModelEntryParams) (*domain.DataModelEntry, error) {
	return svc.store.UpdateDataModelEntry(ctx, id, params)
}

func (svc *Service) DeleteDataModelEntry(ctx context.Context, id string) error {
	return svc.store.DeleteDataModelEntry(ctx, id)
}

func (svc *Service) ListDataModelEntries(ctx context.Context, specID string) ([]*domain.DataModelEntry, error) {
	return svc.store.ListDataModelEntries(ctx, specID)
}

func (svc *Service) AddTraceabilityEntry(ctx context.Context, params store.AddTraceabilityEntryParams) (*domain.TraceabilityEntry, error) {
	return svc.store.AddTraceabilityEntry(ctx, params)
}

func (svc *Service) UpdateTraceabilityEntry(ctx context.Context, id string, params store.UpdateTraceabilityEntryParams) (*domain.TraceabilityEntry, error) {
	return svc.store.UpdateTraceabilityEntry(ctx, id, params)
}

func (svc *Service) DeleteTraceabilityEntry(ctx context.Context, id string) error {
	return svc.store.DeleteTraceabilityEntry(ctx, id)
}

func (svc *Service) ListTraceabilityEntries(ctx context.Context, specID string) ([]*domain.TraceabilityEntry, error) {
	return svc.store.ListTraceabilityEntries(ctx, specID)
}

func (svc *Service) AddAlternative(ctx context.Context, params store.AddAlternativeParams) (*domain.Alternative, error) {
	return svc.store.AddAlternative(ctx, params)
}

func (svc *Service) UpdateAlternative(ctx context.Context, id, description string) (*domain.Alternative, error) {
	return svc.store.UpdateAlternative(ctx, id, description)
}

func (svc *Service) DeleteAlternative(ctx context.Context, id string) error {
	return svc.store.DeleteAlternative(ctx, id)
}

func (svc *Service) ListAlternatives(ctx context.Context, specID string) ([]*domain.Alternative, error) {
	return svc.store.ListAlternatives(ctx, specID)
}

func (svc *Service) AddOpenRisk(ctx context.Context, params store.AddOpenRiskParams) (*domain.OpenRisk, error) {
	return svc.store.AddOpenRisk(ctx, params)
}

func (svc *Service) UpdateOpenRisk(ctx context.Context, id, description string) (*domain.OpenRisk, error) {
	return svc.store.UpdateOpenRisk(ctx, id, description)
}

func (svc *Service) DeleteOpenRisk(ctx context.Context, id string) error {
	return svc.store.DeleteOpenRisk(ctx, id)
}

func (svc *Service) ListOpenRisks(ctx context.Context, specID string) ([]*domain.OpenRisk, error) {
	return svc.store.ListOpenRisks(ctx, specID)
}

// --- Tasks artifacts -------------------------------------------------------

func (svc *Service) ListTasksDocs(ctx context.Context, specID string) ([]*domain.TasksDoc, error) {
	return svc.store.ListTasksDocs(ctx, specID)
}

func (svc *Service) GetTasksDoc(ctx context.Context, id string) (*domain.TasksDoc, error) {
	return svc.store.GetTasksDoc(ctx, id)
}

func (svc *Service) GetTasksDocByComponent(ctx context.Context, designComponentID string) (*domain.TasksDoc, error) {
	return svc.store.GetTasksDocByComponent(ctx, designComponentID)
}

// ErrComponentNotFound is returned by ResolveTasksDocIDBySlug when no
// component with the given slug exists on the spec.
var ErrComponentNotFound = errors.New("service: component not found")

// ResolveTasksDocIDBySlug resolves a design component's slug — the
// argument shape both the MCP and REST layers naturally have on hand — to
// its TasksDoc id, which every tasks-stage transition is keyed on.
func (svc *Service) ResolveTasksDocIDBySlug(ctx context.Context, specID, slug string) (string, error) {
	docs, err := svc.store.ListTasksDocs(ctx, specID)
	if err != nil {
		return "", err
	}
	for _, d := range docs {
		if d.ComponentSlug == slug {
			return d.ID, nil
		}
	}
	return "", fmt.Errorf("%w: %q", ErrComponentNotFound, slug)
}

// AddTaskItem passes straight through — the 2-level cap and SATISFIES
// requirement (decisions 12-13) are enforced at the store layer, since
// they're insert-time structural checks, not stage-transition gates.
func (svc *Service) AddTaskItem(ctx context.Context, params store.AddTaskItemParams) (*domain.TaskItem, error) {
	return svc.store.AddTaskItem(ctx, params)
}

func (svc *Service) GetTaskItem(ctx context.Context, id string) (*domain.TaskItem, error) {
	return svc.store.GetTaskItem(ctx, id)
}

func (svc *Service) ListTaskItems(ctx context.Context, tasksDocID string) ([]*domain.TaskItem, error) {
	return svc.store.ListTaskItems(ctx, tasksDocID)
}

func (svc *Service) UpdateTaskItem(ctx context.Context, id string, params store.UpdateTaskItemParams) (*domain.TaskItem, error) {
	return svc.store.UpdateTaskItem(ctx, id, params)
}

func (svc *Service) DeleteTaskItem(ctx context.Context, id string) error {
	return svc.store.DeleteTaskItem(ctx, id)
}

func (svc *Service) ListSatisfiedCriteria(ctx context.Context, taskItemID string) ([]*domain.AcceptanceCriterion, error) {
	return svc.store.ListSatisfiedCriteria(ctx, taskItemID)
}

// AddFileTouched passes straight through — the 5-file cap (decision 14) is
// enforced at the store layer.
func (svc *Service) AddFileTouched(ctx context.Context, params store.AddFileTouchedParams) (*domain.FileTouched, error) {
	return svc.store.AddFileTouched(ctx, params)
}

func (svc *Service) DeleteFileTouched(ctx context.Context, id string) error {
	return svc.store.DeleteFileTouched(ctx, id)
}

func (svc *Service) ListFilesTouched(ctx context.Context, taskItemID string) ([]*domain.FileTouched, error) {
	return svc.store.ListFilesTouched(ctx, taskItemID)
}

func (svc *Service) AddTaskDependencyEdge(ctx context.Context, specID, fromTaskItemID, toTaskItemID string) error {
	return svc.store.AddTaskDependencyEdge(ctx, specID, fromTaskItemID, toTaskItemID)
}

func (svc *Service) DeleteTaskDependencyEdge(ctx context.Context, fromTaskItemID, toTaskItemID string) error {
	return svc.store.DeleteTaskDependencyEdge(ctx, fromTaskItemID, toTaskItemID)
}

func (svc *Service) ListTaskDependencyEdges(ctx context.Context, specID string) ([]domain.TaskDependencyEdge, error) {
	return svc.store.ListTaskDependencyEdges(ctx, specID)
}

func (svc *Service) AddParallelBatch(ctx context.Context, params store.AddParallelBatchParams) (*domain.ParallelBatch, error) {
	return svc.store.AddParallelBatch(ctx, params)
}

func (svc *Service) ListParallelBatches(ctx context.Context, tasksDocID string) ([]*domain.ParallelBatch, error) {
	return svc.store.ListParallelBatches(ctx, tasksDocID)
}

func (svc *Service) DeleteParallelBatch(ctx context.Context, id string) error {
	return svc.store.DeleteParallelBatch(ctx, id)
}

func (svc *Service) AddParallelBatchMember(ctx context.Context, batchID, taskItemID string) error {
	return svc.store.AddParallelBatchMember(ctx, batchID, taskItemID)
}

func (svc *Service) RemoveParallelBatchMember(ctx context.Context, batchID, taskItemID string) error {
	return svc.store.RemoveParallelBatchMember(ctx, batchID, taskItemID)
}

func (svc *Service) ListParallelBatchMembers(ctx context.Context, batchID string) ([]*domain.TaskItem, error) {
	return svc.store.ListParallelBatchMembers(ctx, batchID)
}

func (svc *Service) AddDefinitionOfDoneItem(ctx context.Context, params store.AddDefinitionOfDoneItemParams) (*domain.DefinitionOfDoneItem, error) {
	if strings.TrimSpace(params.Description) == "" {
		return nil, fmt.Errorf("service: add_definition_of_done_item requires a non-empty description")
	}
	return svc.store.AddDefinitionOfDoneItem(ctx, params)
}

func (svc *Service) UpdateDefinitionOfDoneItem(ctx context.Context, id string, params store.UpdateDefinitionOfDoneItemParams) (*domain.DefinitionOfDoneItem, error) {
	return svc.store.UpdateDefinitionOfDoneItem(ctx, id, params)
}

func (svc *Service) DeleteDefinitionOfDoneItem(ctx context.Context, id string) error {
	return svc.store.DeleteDefinitionOfDoneItem(ctx, id)
}

func (svc *Service) ListDefinitionOfDoneItems(ctx context.Context, specID string) ([]*domain.DefinitionOfDoneItem, error) {
	return svc.store.ListDefinitionOfDoneItems(ctx, specID)
}

// --- Stage gates ------------------------------------------------------
//
// finalize_stage is agent-facing (submit a draft for review); approve/deny
// are human-only actions (not exposed via any MCP tool — see
// .meta/spec/README.md). Both gates check ErrUnresolvedOpenQuestions
// (decision 6); finalize additionally checks the stage's own completeness
// gate; deny requires a reason and is otherwise ungated (matching v1 and
// decision 9 — destructive, no history, content untouched).

func (svc *Service) FinalizeRequirementsStage(ctx context.Context, specID string) (*domain.Spec, error) {
	if err := svc.checkNoUnresolvedOpenQuestions(ctx, specID, domain.SpecStageRequirements); err != nil {
		return nil, err
	}
	stories, err := svc.store.ListUserStories(ctx, specID)
	if err != nil {
		return nil, err
	}
	if len(stories) == 0 {
		return nil, ErrRequirementsIncomplete
	}
	for _, story := range stories {
		criteria, err := svc.store.ListAcceptanceCriteria(ctx, story.ID)
		if err != nil {
			return nil, err
		}
		if len(criteria) == 0 {
			return nil, ErrRequirementsIncomplete
		}
	}
	return svc.store.FinalizeRequirementsStage(ctx, specID)
}

func (svc *Service) ApproveRequirementsStage(ctx context.Context, specID string) (*domain.Spec, error) {
	if err := svc.checkNoUnresolvedOpenQuestions(ctx, specID, domain.SpecStageRequirements); err != nil {
		return nil, err
	}
	return svc.store.ApproveRequirementsStage(ctx, specID)
}

func (svc *Service) DenyRequirementsStage(ctx context.Context, specID, reason string) (*domain.Spec, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, fmt.Errorf("service: deny_stage requires a non-empty reason")
	}
	return svc.store.DenyRequirementsStage(ctx, specID, reason)
}

func (svc *Service) FinalizeDesignStage(ctx context.Context, specID string) (*domain.Spec, error) {
	if err := svc.checkNoUnresolvedOpenQuestions(ctx, specID, domain.SpecStageDesign); err != nil {
		return nil, err
	}
	components, err := svc.store.ListDesignComponents(ctx, specID)
	if err != nil {
		return nil, err
	}
	if len(components) == 0 {
		return nil, ErrDesignIncomplete
	}
	orphaned, err := svc.store.ListOrphanedTasksDocs(ctx, specID)
	if err != nil {
		return nil, err
	}
	if len(orphaned) > 0 {
		return nil, ErrOrphanedTasksDocs
	}
	return svc.store.FinalizeDesignStage(ctx, specID)
}

func (svc *Service) ApproveDesignStage(ctx context.Context, specID string) (*domain.Spec, error) {
	if err := svc.checkNoUnresolvedOpenQuestions(ctx, specID, domain.SpecStageDesign); err != nil {
		return nil, err
	}
	return svc.store.ApproveDesignStage(ctx, specID)
}

func (svc *Service) DenyDesignStage(ctx context.Context, specID, reason string) (*domain.Spec, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, fmt.Errorf("service: deny_stage requires a non-empty reason")
	}
	return svc.store.DenyDesignStage(ctx, specID, reason)
}

func (svc *Service) FinalizeImplementationStage(ctx context.Context, specID string) (*domain.Spec, error) {
	return svc.store.FinalizeImplementationStage(ctx, specID)
}

func (svc *Service) ApproveImplementationStage(ctx context.Context, specID string) (*domain.Spec, error) {
	return svc.store.ApproveImplementationStage(ctx, specID)
}

func (svc *Service) DenyImplementationStage(ctx context.Context, specID, reason string) (*domain.Spec, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, fmt.Errorf("service: deny_stage requires a non-empty reason")
	}
	return svc.store.DenyImplementationStage(ctx, specID, reason)
}

// FinalizeTasksStage finalizes one component's TasksDoc. Beyond its own
// zero_task_files_touched gate, it also runs the whole spec's
// HasTaskDependencyCycle check — v1 does the same: cycle detection walks
// every edge belonging to the spec, not just this component's, since a
// cross-component BLOCKS edge added anywhere can create a cycle touching
// components finalized earlier.
func (svc *Service) FinalizeTasksStage(ctx context.Context, tasksDocID string) (*domain.TasksDoc, error) {
	doc, err := svc.store.GetTasksDoc(ctx, tasksDocID)
	if err != nil {
		return nil, err
	}
	if err := svc.checkNoUnresolvedOpenQuestionsForTarget(ctx, doc.SpecID, domain.SpecStageTasks, tasksDocID); err != nil {
		return nil, err
	}

	items, err := svc.store.ListTaskItems(ctx, tasksDocID)
	if err != nil {
		return nil, err
	}
	topLevelCount := 0
	for _, item := range items {
		if item.ParentItemID != nil {
			continue
		}
		topLevelCount++
		files, err := svc.store.ListFilesTouched(ctx, item.ID)
		if err != nil {
			return nil, err
		}
		if len(files) == 0 {
			return nil, ErrTasksIncomplete
		}
	}
	if topLevelCount == 0 {
		return nil, ErrTasksIncomplete
	}

	hasCycle, err := svc.store.HasTaskDependencyCycle(ctx, doc.SpecID)
	if err != nil {
		return nil, err
	}
	if hasCycle {
		return nil, ErrTaskDependencyCycle
	}

	return svc.store.FinalizeTasksStage(ctx, tasksDocID)
}

func (svc *Service) ApproveTasksStage(ctx context.Context, tasksDocID string) (*domain.TasksDoc, error) {
	doc, err := svc.store.GetTasksDoc(ctx, tasksDocID)
	if err != nil {
		return nil, err
	}
	if err := svc.checkNoUnresolvedOpenQuestionsForTarget(ctx, doc.SpecID, domain.SpecStageTasks, tasksDocID); err != nil {
		return nil, err
	}
	return svc.store.ApproveTasksStage(ctx, tasksDocID)
}

func (svc *Service) DenyTasksStage(ctx context.Context, tasksDocID, reason string) (*domain.TasksDoc, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, fmt.Errorf("service: deny_stage requires a non-empty reason")
	}
	return svc.store.DenyTasksStage(ctx, tasksDocID, reason)
}

// checkNoUnresolvedOpenQuestions blocks on any unresolved question raised
// against stage, spec-wide (decision 6).
func (svc *Service) checkNoUnresolvedOpenQuestions(ctx context.Context, specID string, stage domain.SpecStage) error {
	unresolved, err := svc.store.ListUnresolvedOpenQuestions(ctx, specID, stage)
	if err != nil {
		return err
	}
	if len(unresolved) > 0 {
		return ErrUnresolvedOpenQuestions
	}
	return nil
}

// checkNoUnresolvedOpenQuestionsForTarget scopes the tasks-stage gate to
// questions relevant to one component: either spec-wide (no TargetID) or
// targeting this specific tasksDocID — a question raised against a
// different component's TasksDoc doesn't block this one's finalize/approve.
func (svc *Service) checkNoUnresolvedOpenQuestionsForTarget(ctx context.Context, specID string, stage domain.SpecStage, targetID string) error {
	unresolved, err := svc.store.ListUnresolvedOpenQuestions(ctx, specID, stage)
	if err != nil {
		return err
	}
	for _, q := range unresolved {
		if q.TargetID == nil || *q.TargetID == targetID {
			return ErrUnresolvedOpenQuestions
		}
	}
	return nil
}

// GetNextStage mirrors v1's getNextStage: requirements -> design -> tasks
// predecessor-approved gating, with tasks reporting which components still
// aren't approved (laggingComponents) once it's the active stage.
func (svc *Service) GetNextStage(ctx context.Context, specID string) (*domain.NextStageInfo, error) {
	spec, err := svc.store.GetSpec(ctx, specID)
	if err != nil {
		return nil, err
	}
	if spec.RequirementsStageStatus != domain.SpecStageApproved {
		return &domain.NextStageInfo{NextStage: domain.NextStageRequirements}, nil
	}
	if spec.DesignStageStatus != domain.SpecStageApproved {
		return &domain.NextStageInfo{NextStage: domain.NextStageDesign}, nil
	}

	docs, err := svc.store.ListTasksDocs(ctx, specID)
	if err != nil {
		return nil, err
	}
	lagging := make([]string, 0, len(docs))
	for _, d := range docs {
		if d.Status != domain.SpecStageApproved {
			lagging = append(lagging, d.ComponentSlug)
		}
	}
	if len(lagging) > 0 {
		return &domain.NextStageInfo{NextStage: domain.NextStageTasks, LaggingComponents: lagging}, nil
	}
	if spec.ImplementationStageStatus != domain.SpecStageApproved {
		return &domain.NextStageInfo{NextStage: domain.NextStageImplementation}, nil
	}
	return &domain.NextStageInfo{NextStage: domain.NextStageComplete}, nil
}
