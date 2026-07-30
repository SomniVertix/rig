package mcpserver

import (
	"time"

	"github.com/somnivertix/rig/internal/graph/domain"
)

type specOut struct {
	ID                           string     `json:"id"`
	WorkspaceID                    string     `json:"workspaceId"`
	Slug                         string     `json:"slug"`
	FeatureName                  string     `json:"featureName"`
	RequirementsOverview         string     `json:"requirementsOverview"`
	RequirementsStageStatus      string     `json:"requirementsStageStatus"`
	RequirementsDeniedAt         *time.Time `json:"requirementsDeniedAt,omitempty"`
	RequirementsLastDenialReason *string    `json:"requirementsLastDenialReason,omitempty"`
	DesignOverview               string     `json:"designOverview"`
	DesignArchitecture           string     `json:"designArchitecture"`
	DesignDataModelOverview      *string    `json:"designDataModelOverview,omitempty"`
	DesignStageStatus            string     `json:"designStageStatus"`
	DesignDeniedAt               *time.Time `json:"designDeniedAt,omitempty"`
	DesignLastDenialReason       *string    `json:"designLastDenialReason,omitempty"`
	TasksStageStatus             string     `json:"tasksStageStatus" jsonschema:"derived live from every component's TasksDoc — never stored"`
}

func newSpecOut(s *domain.Spec, tasksStatus domain.SpecStageStatus) specOut {
	return specOut{
		ID: s.ID, WorkspaceID: s.WorkspaceID, Slug: s.Slug, FeatureName: s.FeatureName,
		RequirementsOverview:         s.RequirementsOverview,
		RequirementsStageStatus:      string(s.RequirementsStageStatus),
		RequirementsDeniedAt:         s.RequirementsDeniedAt,
		RequirementsLastDenialReason: s.RequirementsLastDenialReason,
		DesignOverview:               s.DesignOverview,
		DesignArchitecture:           s.DesignArchitecture,
		DesignDataModelOverview:      s.DesignDataModelOverview,
		DesignStageStatus:            string(s.DesignStageStatus),
		DesignDeniedAt:               s.DesignDeniedAt,
		DesignLastDenialReason:       s.DesignLastDenialReason,
		TasksStageStatus:             string(tasksStatus),
	}
}

func newSpecOuts(specs []*domain.Spec, tasksStatuses []domain.SpecStageStatus) []specOut {
	outs := make([]specOut, len(specs))
	for i, s := range specs {
		outs[i] = newSpecOut(s, tasksStatuses[i])
	}
	return outs
}

type userStoryOut struct {
	ID          string `json:"id"`
	SpecID      string `json:"specId"`
	StoryNumber int    `json:"storyNumber"`
	Title       string `json:"title"`
	Role        string `json:"role"`
	Capability  string `json:"capability"`
	Benefit     string `json:"benefit"`
	Rationale   string `json:"rationale"`
}

func newUserStoryOut(u *domain.UserStory) userStoryOut {
	return userStoryOut{
		ID: u.ID, SpecID: u.SpecID, StoryNumber: u.StoryNumber, Title: u.Title,
		Role: u.Role, Capability: u.Capability, Benefit: u.Benefit, Rationale: u.Rationale,
	}
}

func newUserStoryOuts(us []*domain.UserStory) []userStoryOut {
	outs := make([]userStoryOut, len(us))
	for i, u := range us {
		outs[i] = newUserStoryOut(u)
	}
	return outs
}

type acceptanceCriterionOut struct {
	ID              string  `json:"id"`
	UserStoryID     string  `json:"userStoryId"`
	CriterionNumber int     `json:"criterionNumber"`
	EarsPattern     string  `json:"earsPattern"`
	TriggerClause   *string `json:"triggerClause,omitempty"`
	ConditionClause *string `json:"conditionClause,omitempty"`
	StateClause     *string `json:"stateClause,omitempty"`
	ResponseClause  string  `json:"responseClause"`
	FullText        string  `json:"fullText"`
}

func newAcceptanceCriterionOut(c *domain.AcceptanceCriterion) acceptanceCriterionOut {
	return acceptanceCriterionOut{
		ID: c.ID, UserStoryID: c.UserStoryID, CriterionNumber: c.CriterionNumber,
		EarsPattern: string(c.EarsPattern), TriggerClause: c.TriggerClause,
		ConditionClause: c.ConditionClause, StateClause: c.StateClause,
		ResponseClause: c.ResponseClause, FullText: c.FullText,
	}
}

func newAcceptanceCriterionOuts(cs []*domain.AcceptanceCriterion) []acceptanceCriterionOut {
	outs := make([]acceptanceCriterionOut, len(cs))
	for i, c := range cs {
		outs[i] = newAcceptanceCriterionOut(c)
	}
	return outs
}

type nonGoalOut struct {
	ID          string `json:"id"`
	SpecID      string `json:"specId"`
	Ordinal     int    `json:"ordinal"`
	Description string `json:"description"`
}

func newNonGoalOut(n *domain.NonGoal) nonGoalOut {
	return nonGoalOut{ID: n.ID, SpecID: n.SpecID, Ordinal: n.Ordinal, Description: n.Description}
}

func newNonGoalOuts(ns []*domain.NonGoal) []nonGoalOut {
	outs := make([]nonGoalOut, len(ns))
	for i, n := range ns {
		outs[i] = newNonGoalOut(n)
	}
	return outs
}

type glossaryTermOut struct {
	ID                string  `json:"id"`
	SpecID            string  `json:"specId"`
	Term              string  `json:"term"`
	Definition        *string `json:"definition,omitempty"`
	ExternalReference *string `json:"externalReference,omitempty"`
}

func newGlossaryTermOut(g *domain.GlossaryTerm) glossaryTermOut {
	return glossaryTermOut{ID: g.ID, SpecID: g.SpecID, Term: g.Term, Definition: g.Definition, ExternalReference: g.ExternalReference}
}

func newGlossaryTermOuts(gs []*domain.GlossaryTerm) []glossaryTermOut {
	outs := make([]glossaryTermOut, len(gs))
	for i, g := range gs {
		outs[i] = newGlossaryTermOut(g)
	}
	return outs
}

// openQuestionOut unifies v1's assumptions_open_questions/design_flags/
// tasks_flags — see spec-pipeline-graph.md decision 5.
type openQuestionOut struct {
	ID             string     `json:"id"`
	SpecID         string     `json:"specId"`
	Stage          string     `json:"stage"`
	TargetID       *string    `json:"targetId,omitempty"`
	Description    string     `json:"description"`
	RaisedAt       time.Time  `json:"raisedAt"`
	Resolved       bool       `json:"resolved"`
	ResolvedAt     *time.Time `json:"resolvedAt,omitempty"`
	ResolvedBy     *string    `json:"resolvedBy,omitempty"`
	ResolvedReason *string    `json:"resolvedReason,omitempty"`
}

func newOpenQuestionOut(q *domain.OpenQuestion) openQuestionOut {
	return openQuestionOut{
		ID: q.ID, SpecID: q.SpecID, Stage: string(q.Stage), TargetID: q.TargetID,
		Description: q.Description, RaisedAt: q.RaisedAt, Resolved: q.Resolved,
		ResolvedAt: q.ResolvedAt, ResolvedBy: q.ResolvedBy, ResolvedReason: q.ResolvedReason,
	}
}

func newOpenQuestionOuts(qs []*domain.OpenQuestion) []openQuestionOut {
	outs := make([]openQuestionOut, len(qs))
	for i, q := range qs {
		outs[i] = newOpenQuestionOut(q)
	}
	return outs
}

type designComponentOut struct {
	ID          string    `json:"id"`
	SpecID      string    `json:"specId"`
	Slug        string    `json:"slug"`
	DisplayName string    `json:"displayName"`
	Ordinal     int       `json:"ordinal"`
	CreatedAt   time.Time `json:"createdAt"`
}

func newDesignComponentOut(c *domain.DesignComponent) designComponentOut {
	return designComponentOut{ID: c.ID, SpecID: c.SpecID, Slug: c.Slug, DisplayName: c.DisplayName, Ordinal: c.Ordinal, CreatedAt: c.CreatedAt}
}

func newDesignComponentOuts(cs []*domain.DesignComponent) []designComponentOut {
	outs := make([]designComponentOut, len(cs))
	for i, c := range cs {
		outs[i] = newDesignComponentOut(c)
	}
	return outs
}

type dataModelEntryOut struct {
	ID      string `json:"id"`
	SpecID  string `json:"specId"`
	Ordinal int    `json:"ordinal"`
	Name    string `json:"name"`
	Kind    string `json:"kind"`
	Content string `json:"content"`
}

func newDataModelEntryOut(e *domain.DataModelEntry) dataModelEntryOut {
	return dataModelEntryOut{ID: e.ID, SpecID: e.SpecID, Ordinal: e.Ordinal, Name: e.Name, Kind: e.Kind, Content: e.Content}
}

func newDataModelEntryOuts(es []*domain.DataModelEntry) []dataModelEntryOut {
	outs := make([]dataModelEntryOut, len(es))
	for i, e := range es {
		outs[i] = newDataModelEntryOut(e)
	}
	return outs
}

type traceabilityEntryOut struct {
	ID               string  `json:"id"`
	SpecID           string  `json:"specId"`
	UserStoryID      *string `json:"userStoryId,omitempty"`
	RequirementLabel string  `json:"requirementLabel"`
	AddressedBy      string  `json:"addressedBy"`
	Ordinal          int     `json:"ordinal"`
}

func newTraceabilityEntryOut(t *domain.TraceabilityEntry) traceabilityEntryOut {
	return traceabilityEntryOut{ID: t.ID, SpecID: t.SpecID, UserStoryID: t.UserStoryID, RequirementLabel: t.RequirementLabel, AddressedBy: t.AddressedBy, Ordinal: t.Ordinal}
}

func newTraceabilityEntryOuts(ts []*domain.TraceabilityEntry) []traceabilityEntryOut {
	outs := make([]traceabilityEntryOut, len(ts))
	for i, t := range ts {
		outs[i] = newTraceabilityEntryOut(t)
	}
	return outs
}

type alternativeOut struct {
	ID          string `json:"id"`
	SpecID      string `json:"specId"`
	Ordinal     int    `json:"ordinal"`
	Description string `json:"description"`
}

func newAlternativeOut(a *domain.Alternative) alternativeOut {
	return alternativeOut{ID: a.ID, SpecID: a.SpecID, Ordinal: a.Ordinal, Description: a.Description}
}

func newAlternativeOuts(as []*domain.Alternative) []alternativeOut {
	outs := make([]alternativeOut, len(as))
	for i, a := range as {
		outs[i] = newAlternativeOut(a)
	}
	return outs
}

type openRiskOut struct {
	ID          string `json:"id"`
	SpecID      string `json:"specId"`
	Ordinal     int    `json:"ordinal"`
	Description string `json:"description"`
}

func newOpenRiskOut(r *domain.OpenRisk) openRiskOut {
	return openRiskOut{ID: r.ID, SpecID: r.SpecID, Ordinal: r.Ordinal, Description: r.Description}
}

func newOpenRiskOuts(rs []*domain.OpenRisk) []openRiskOut {
	outs := make([]openRiskOut, len(rs))
	for i, r := range rs {
		outs[i] = newOpenRiskOut(r)
	}
	return outs
}

type tasksDocOut struct {
	ID                string     `json:"id"`
	SpecID            string     `json:"specId"`
	DesignComponentID string     `json:"designComponentId"`
	ComponentSlug     string     `json:"componentSlug"`
	ComponentName     string     `json:"componentName"`
	Status            string     `json:"status"`
	DeniedAt          *time.Time `json:"deniedAt,omitempty"`
	LastDenialReason  *string    `json:"lastDenialReason,omitempty"`
}

func newTasksDocOut(t *domain.TasksDoc) tasksDocOut {
	return tasksDocOut{
		ID: t.ID, SpecID: t.SpecID, DesignComponentID: t.DesignComponentID,
		ComponentSlug: t.ComponentSlug, ComponentName: t.ComponentName,
		Status: string(t.Status), DeniedAt: t.DeniedAt, LastDenialReason: t.LastDenialReason,
	}
}

func newTasksDocOuts(ts []*domain.TasksDoc) []tasksDocOut {
	outs := make([]tasksDocOut, len(ts))
	for i, t := range ts {
		outs[i] = newTasksDocOut(t)
	}
	return outs
}

type taskItemOut struct {
	ID                    string   `json:"id"`
	TasksDocID            string   `json:"tasksDocId"`
	ItemID                string   `json:"itemId"`
	ParentItemID          *string  `json:"parentItemId,omitempty"`
	ExecutionOrder        int      `json:"executionOrder"`
	Title                 string   `json:"title"`
	Description           string   `json:"description"`
	SuggestedAgent        string   `json:"suggestedAgent"`
	AcceptanceCheck       string   `json:"acceptanceCheck"`
	IsChecked             bool     `json:"isChecked"`
	SatisfiesCriterionIDs []string `json:"satisfiesCriterionIds,omitempty"`
}

func newTaskItemOut(t *domain.TaskItem, criteria []*domain.AcceptanceCriterion) taskItemOut {
	ids := make([]string, len(criteria))
	for i, c := range criteria {
		ids[i] = c.ID
	}
	return taskItemOut{
		ID: t.ID, TasksDocID: t.TasksDocID, ItemID: t.ItemID, ParentItemID: t.ParentItemID,
		ExecutionOrder: t.ExecutionOrder, Title: t.Title, Description: t.Description,
		SuggestedAgent: t.SuggestedAgent, AcceptanceCheck: t.AcceptanceCheck, IsChecked: t.IsChecked,
		SatisfiesCriterionIDs: ids,
	}
}

type fileTouchedOut struct {
	ID         string `json:"id"`
	TaskItemID string `json:"taskItemId"`
	Ordinal    int    `json:"ordinal"`
	FilePath   string `json:"filePath"`
}

func newFileTouchedOut(f *domain.FileTouched) fileTouchedOut {
	return fileTouchedOut{ID: f.ID, TaskItemID: f.TaskItemID, Ordinal: f.Ordinal, FilePath: f.FilePath}
}

func newFileTouchedOuts(fs []*domain.FileTouched) []fileTouchedOut {
	outs := make([]fileTouchedOut, len(fs))
	for i, f := range fs {
		outs[i] = newFileTouchedOut(f)
	}
	return outs
}

type taskDependencyEdgeOut struct {
	FromTaskItemID string    `json:"fromTaskItemId"`
	ToTaskItemID   string    `json:"toTaskItemId"`
	CreatedAt      time.Time `json:"createdAt"`
}

func newTaskDependencyEdgeOuts(es []domain.TaskDependencyEdge) []taskDependencyEdgeOut {
	outs := make([]taskDependencyEdgeOut, len(es))
	for i, e := range es {
		outs[i] = taskDependencyEdgeOut{FromTaskItemID: e.FromTaskItemID, ToTaskItemID: e.ToTaskItemID, CreatedAt: e.CreatedAt}
	}
	return outs
}

type parallelBatchOut struct {
	ID         string `json:"id"`
	TasksDocID string `json:"tasksDocId"`
	BatchLabel string `json:"batchLabel"`
	BatchOrder int    `json:"batchOrder"`
}

func newParallelBatchOut(p *domain.ParallelBatch) parallelBatchOut {
	return parallelBatchOut{ID: p.ID, TasksDocID: p.TasksDocID, BatchLabel: p.BatchLabel, BatchOrder: p.BatchOrder}
}

func newParallelBatchOuts(ps []*domain.ParallelBatch) []parallelBatchOut {
	outs := make([]parallelBatchOut, len(ps))
	for i, p := range ps {
		outs[i] = newParallelBatchOut(p)
	}
	return outs
}

type definitionOfDoneItemOut struct {
	ID          string `json:"id"`
	SpecID      string `json:"specId"`
	Ordinal     int    `json:"ordinal"`
	Description string `json:"description"`
	IsChecked   bool   `json:"isChecked"`
}

func newDefinitionOfDoneItemOut(d *domain.DefinitionOfDoneItem) definitionOfDoneItemOut {
	return definitionOfDoneItemOut{ID: d.ID, SpecID: d.SpecID, Ordinal: d.Ordinal, Description: d.Description, IsChecked: d.IsChecked}
}

func newDefinitionOfDoneItemOuts(ds []*domain.DefinitionOfDoneItem) []definitionOfDoneItemOut {
	outs := make([]definitionOfDoneItemOut, len(ds))
	for i, d := range ds {
		outs[i] = newDefinitionOfDoneItemOut(d)
	}
	return outs
}

type nextStageInfoOut struct {
	NextStage         string   `json:"nextStage"`
	LaggingComponents []string `json:"laggingComponents,omitempty"`
}

func newNextStageInfoOut(n *domain.NextStageInfo) nextStageInfoOut {
	return nextStageInfoOut{NextStage: string(n.NextStage), LaggingComponents: n.LaggingComponents}
}
