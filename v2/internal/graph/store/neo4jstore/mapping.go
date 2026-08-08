package neo4jstore

import (
	"fmt"
	"time"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/somnivertix/rig/internal/graph/domain"
)

func getStringProp(props map[string]any, key string) (string, error) {
	v, ok := props[key]
	if !ok || v == nil {
		return "", fmt.Errorf("neo4jstore: missing required property %q", key)
	}
	s, ok := v.(string)
	if !ok {
		return "", fmt.Errorf("neo4jstore: property %q is not a string (got %T)", key, v)
	}
	return s, nil
}

func getStringPtrProp(props map[string]any, key string) *string {
	v, ok := props[key]
	if !ok || v == nil {
		return nil
	}
	if s, ok := v.(string); ok {
		return &s
	}
	return nil
}

func getIntProp(props map[string]any, key string) (int, error) {
	v, ok := props[key]
	if !ok || v == nil {
		return 0, fmt.Errorf("neo4jstore: missing required property %q", key)
	}
	switch n := v.(type) {
	case int64:
		return int(n), nil
	case int:
		return n, nil
	}
	return 0, fmt.Errorf("neo4jstore: property %q is not an integer (got %T)", key, v)
}

func getTimeProp(props map[string]any, key string) (time.Time, error) {
	v, ok := props[key]
	if !ok || v == nil {
		return time.Time{}, fmt.Errorf("neo4jstore: missing required property %q", key)
	}
	t, ok := v.(time.Time)
	if !ok {
		return time.Time{}, fmt.Errorf("neo4jstore: property %q is not a datetime (got %T)", key, v)
	}
	return t, nil
}

func getTimePtrProp(props map[string]any, key string) *time.Time {
	v, ok := props[key]
	if !ok || v == nil {
		return nil
	}
	if t, ok := v.(time.Time); ok {
		return &t
	}
	return nil
}

func nodeToExpedition(n neo4j.Node) (*domain.Expedition, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	workspaceID, err := getStringProp(p, "workspaceId")
	if err != nil {
		return nil, err
	}
	slug, err := getStringProp(p, "slug")
	if err != nil {
		return nil, err
	}
	title, err := getStringProp(p, "title")
	if err != nil {
		return nil, err
	}
	briefingPrompt, err := getStringProp(p, "briefingPrompt")
	if err != nil {
		return nil, err
	}
	status, err := getStringProp(p, "status")
	if err != nil {
		return nil, err
	}
	createdAt, err := getTimeProp(p, "createdAt")
	if err != nil {
		return nil, err
	}
	updatedAt, err := getTimeProp(p, "updatedAt")
	if err != nil {
		return nil, err
	}

	e := &domain.Expedition{
		ID:             id,
		WorkspaceID:      workspaceID,
		Slug:           slug,
		Title:          title,
		BriefingPrompt: briefingPrompt,
		Destination:    getStringPtrProp(p, "destination"),
		Notes:          getStringPtrProp(p, "notes"),
		Status:         domain.ExpeditionStatus(status),
		OutcomeSpecID:  getStringPtrProp(p, "outcomeSpecId"),
		OutcomeSummary: getStringPtrProp(p, "outcomeSummary"),
		ReopenReason:   getStringPtrProp(p, "reopenReason"),
		SessionID:      getStringPtrProp(p, "sessionId"),
		CreatedAt:      createdAt,
		UpdatedAt:      updatedAt,
	}
	if ok := getStringPtrProp(p, "outcomeKind"); ok != nil {
		k := domain.ExpeditionOutcomeKind(*ok)
		e.OutcomeKind = &k
	}
	return e, nil
}

func nodeToWaypoint(n neo4j.Node) (*domain.Waypoint, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	expeditionID, err := getStringProp(p, "expeditionId")
	if err != nil {
		return nil, err
	}
	number, err := getIntProp(p, "waypointNumber")
	if err != nil {
		return nil, err
	}
	title, err := getStringProp(p, "title")
	if err != nil {
		return nil, err
	}
	question, err := getStringProp(p, "question")
	if err != nil {
		return nil, err
	}
	status, err := getStringProp(p, "status")
	if err != nil {
		return nil, err
	}
	createdAt, err := getTimeProp(p, "createdAt")
	if err != nil {
		return nil, err
	}
	updatedAt, err := getTimeProp(p, "updatedAt")
	if err != nil {
		return nil, err
	}

	w := &domain.Waypoint{
		ID:                    id,
		ExpeditionID:          expeditionID,
		WaypointNumber:        number,
		Title:                 title,
		Question:              question,
		Status:                domain.WaypointStatus(status),
		ClaimedBy:             getStringPtrProp(p, "claimedBy"),
		ClaimedAt:             getTimePtrProp(p, "claimedAt"),
		Resolution:            getStringPtrProp(p, "resolution"),
		ResolutionGist:        getStringPtrProp(p, "resolutionGist"),
		Rationale:             getStringPtrProp(p, "rationale"),
		BypassReason:          getStringPtrProp(p, "bypassReason"),
		UnbypassReason:        getStringPtrProp(p, "unbypassReason"),
		UnspurReason:          getStringPtrProp(p, "unspurReason"),
		ReachedIn:             getStringPtrProp(p, "reachedIn"),
		ReachedAt:             getTimePtrProp(p, "reachedAt"),
		SpurredToExpeditionID: getStringPtrProp(p, "spurredToExpeditionId"),
		CreatedAt:             createdAt,
		UpdatedAt:             updatedAt,
	}
	if a := getStringPtrProp(p, "approach"); a != nil {
		approach := domain.WaypointApproach(*a)
		w.Approach = &approach
	}
	if ps := getStringPtrProp(p, "previousStatus"); ps != nil {
		prev := domain.WaypointStatus(*ps)
		w.PreviousStatus = &prev
	}
	return w, nil
}

func nodeToWaypointHistoryEntry(n neo4j.Node) (*domain.WaypointHistoryEntry, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	waypointID, err := getStringProp(p, "waypointId")
	if err != nil {
		return nil, err
	}
	ordinal, err := getIntProp(p, "ordinal")
	if err != nil {
		return nil, err
	}
	sourceStatus, err := getStringProp(p, "sourceStatus")
	if err != nil {
		return nil, err
	}
	reason, err := getStringProp(p, "reason")
	if err != nil {
		return nil, err
	}
	supersededAt, err := getTimeProp(p, "supersededAt")
	if err != nil {
		return nil, err
	}
	createdAt, err := getTimeProp(p, "createdAt")
	if err != nil {
		return nil, err
	}

	return &domain.WaypointHistoryEntry{
		ID:             id,
		WaypointID:     waypointID,
		Ordinal:        ordinal,
		SourceStatus:   domain.WaypointStatus(sourceStatus),
		Resolution:     getStringPtrProp(p, "resolution"),
		ResolutionGist: getStringPtrProp(p, "resolutionGist"),
		Rationale:      getStringPtrProp(p, "rationale"),
		ReachedIn:      getStringPtrProp(p, "reachedIn"),
		ReachedAt:      getTimePtrProp(p, "reachedAt"),
		BypassReason:   getStringPtrProp(p, "bypassReason"),
		Reason:         reason,
		SupersededAt:   supersededAt,
		CreatedAt:      createdAt,
	}, nil
}

func nodeToWaypointFlag(n neo4j.Node) (*domain.WaypointFlag, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	targetWaypointID, err := getStringProp(p, "targetWaypointId")
	if err != nil {
		return nil, err
	}
	note, err := getStringProp(p, "note")
	if err != nil {
		return nil, err
	}
	raisedAt, err := getTimeProp(p, "raisedAt")
	if err != nil {
		return nil, err
	}
	resolved, _ := p["resolved"].(bool)

	return &domain.WaypointFlag{
		ID:               id,
		TargetWaypointID: targetWaypointID,
		SourceWaypointID: getStringPtrProp(p, "sourceWaypointId"),
		Note:             note,
		RaisedAt:         raisedAt,
		Resolved:         resolved,
		ResolvedAt:       getTimePtrProp(p, "resolvedAt"),
		ResolvedReason:   getStringPtrProp(p, "resolvedReason"),
	}, nil
}

func nodeToWaypointAsset(n neo4j.Node) (*domain.WaypointAsset, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	waypointID, err := getStringProp(p, "waypointId")
	if err != nil {
		return nil, err
	}
	ordinal, err := getIntProp(p, "ordinal")
	if err != nil {
		return nil, err
	}
	kind, err := getStringProp(p, "kind")
	if err != nil {
		return nil, err
	}
	title, err := getStringProp(p, "title")
	if err != nil {
		return nil, err
	}
	createdAt, err := getTimeProp(p, "createdAt")
	if err != nil {
		return nil, err
	}

	return &domain.WaypointAsset{
		ID:              id,
		WaypointID:      waypointID,
		Ordinal:         ordinal,
		Kind:            kind,
		Title:           title,
		ContentMarkdown: getStringPtrProp(p, "contentMarkdown"),
		RepoPath:        getStringPtrProp(p, "repoPath"),
		CommitSHA:       getStringPtrProp(p, "commitSha"),
		CreatedAt:       createdAt,
	}, nil
}

func nodeToExpeditionTerm(n neo4j.Node) (*domain.ExpeditionTerm, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	expeditionID, err := getStringProp(p, "expeditionId")
	if err != nil {
		return nil, err
	}
	term, err := getStringProp(p, "term")
	if err != nil {
		return nil, err
	}
	definition, err := getStringProp(p, "definition")
	if err != nil {
		return nil, err
	}
	createdAt, err := getTimeProp(p, "createdAt")
	if err != nil {
		return nil, err
	}
	updatedAt, err := getTimeProp(p, "updatedAt")
	if err != nil {
		return nil, err
	}

	return &domain.ExpeditionTerm{
		ID:           id,
		ExpeditionID: expeditionID,
		Term:         term,
		Definition:   definition,
		CreatedAt:    createdAt,
		UpdatedAt:    updatedAt,
	}, nil
}

func nodeToHandoff(n neo4j.Node) (*domain.Handoff, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	sourceWorkspaceID, err := getStringProp(p, "sourceWorkspaceId")
	if err != nil {
		return nil, err
	}
	targetWorkspaceID, err := getStringProp(p, "targetWorkspaceId")
	if err != nil {
		return nil, err
	}
	title, err := getStringProp(p, "title")
	if err != nil {
		return nil, err
	}
	bodyMarkdown, err := getStringProp(p, "bodyMarkdown")
	if err != nil {
		return nil, err
	}
	typ, err := getStringProp(p, "type")
	if err != nil {
		return nil, err
	}
	status, err := getStringProp(p, "status")
	if err != nil {
		return nil, err
	}
	sentBy, err := getStringProp(p, "sentBy")
	if err != nil {
		return nil, err
	}
	sentAt, err := getTimeProp(p, "sentAt")
	if err != nil {
		return nil, err
	}
	createdAt, err := getTimeProp(p, "createdAt")
	if err != nil {
		return nil, err
	}
	updatedAt, err := getTimeProp(p, "updatedAt")
	if err != nil {
		return nil, err
	}

	return &domain.Handoff{
		ID:                 id,
		SourceWorkspaceID:  sourceWorkspaceID,
		TargetWorkspaceID:  targetWorkspaceID,
		Title:              title,
		BodyMarkdown:       bodyMarkdown,
		Type:               typ,
		Status:             status,
		OriginExpeditionID: getStringPtrProp(p, "originExpeditionId"),
		OriginWaypointID:   getStringPtrProp(p, "originWaypointId"),
		OriginCommitSHA:    getStringPtrProp(p, "originCommitSha"),
		OriginSessionID:    getStringPtrProp(p, "originSessionId"),
		SentBy:             sentBy,
		SentAt:             sentAt,
		ReadAt:             getTimePtrProp(p, "readAt"),
		ResolutionNote:     getStringPtrProp(p, "resolutionNote"),
		ResolvedAt:         getTimePtrProp(p, "resolvedAt"),
		ResolvedBy:         getStringPtrProp(p, "resolvedBy"),
		CreatedAt:          createdAt,
		UpdatedAt:          updatedAt,
	}, nil
}

// singleNode extracts the node bound to key from a query result's single
// record, mapping "no rows" to store.ErrNotFound at the call site.
func singleNode(rec *neo4j.Record, key string) (neo4j.Node, bool) {
	v, ok := rec.Get(key)
	if !ok || v == nil {
		return neo4j.Node{}, false
	}
	n, ok := v.(neo4j.Node)
	return n, ok
}

func getBoolProp(props map[string]any, key string) bool {
	b, _ := props[key].(bool)
	return b
}

func nodeToSpec(n neo4j.Node) (*domain.Spec, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	workspaceID, err := getStringProp(p, "workspaceId")
	if err != nil {
		return nil, err
	}
	slug, err := getStringProp(p, "slug")
	if err != nil {
		return nil, err
	}
	featureName, err := getStringProp(p, "featureName")
	if err != nil {
		return nil, err
	}
	requirementsOverview, err := getStringProp(p, "requirementsOverview")
	if err != nil {
		return nil, err
	}
	requirementsStatus, err := getStringProp(p, "requirementsStageStatus")
	if err != nil {
		return nil, err
	}
	designOverview, err := getStringProp(p, "designOverview")
	if err != nil {
		return nil, err
	}
	designArchitecture, err := getStringProp(p, "designArchitecture")
	if err != nil {
		return nil, err
	}
	designStatus, err := getStringProp(p, "designStageStatus")
	if err != nil {
		return nil, err
	}
	createdAt, err := getTimeProp(p, "createdAt")
	if err != nil {
		return nil, err
	}
	updatedAt, err := getTimeProp(p, "updatedAt")
	if err != nil {
		return nil, err
	}

	return &domain.Spec{
		ID:                           id,
		WorkspaceID:                    workspaceID,
		Slug:                         slug,
		FeatureName:                  featureName,
		RequirementsOverview:         requirementsOverview,
		RequirementsStageStatus:      domain.SpecStageStatus(requirementsStatus),
		RequirementsDeniedAt:         getTimePtrProp(p, "requirementsDeniedAt"),
		RequirementsLastDenialReason: getStringPtrProp(p, "requirementsLastDenialReason"),
		DesignOverview:               designOverview,
		DesignArchitecture:           designArchitecture,
		DesignDataModelOverview:      getStringPtrProp(p, "designDataModelOverview"),
		DesignStageStatus:            domain.SpecStageStatus(designStatus),
		DesignDeniedAt:               getTimePtrProp(p, "designDeniedAt"),
		DesignLastDenialReason:       getStringPtrProp(p, "designLastDenialReason"),
		CreatedAt:                    createdAt,
		UpdatedAt:                    updatedAt,
	}, nil
}

func nodeToUserStory(n neo4j.Node) (*domain.UserStory, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	specID, err := getStringProp(p, "specId")
	if err != nil {
		return nil, err
	}
	number, err := getIntProp(p, "storyNumber")
	if err != nil {
		return nil, err
	}
	title, err := getStringProp(p, "title")
	if err != nil {
		return nil, err
	}
	role, err := getStringProp(p, "role")
	if err != nil {
		return nil, err
	}
	capability, err := getStringProp(p, "capability")
	if err != nil {
		return nil, err
	}
	benefit, err := getStringProp(p, "benefit")
	if err != nil {
		return nil, err
	}
	rationale, err := getStringProp(p, "rationale")
	if err != nil {
		return nil, err
	}

	return &domain.UserStory{
		ID:          id,
		SpecID:      specID,
		StoryNumber: number,
		Title:       title,
		Role:        role,
		Capability:  capability,
		Benefit:     benefit,
		Rationale:   rationale,
	}, nil
}

func nodeToAcceptanceCriterion(n neo4j.Node) (*domain.AcceptanceCriterion, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	userStoryID, err := getStringProp(p, "userStoryId")
	if err != nil {
		return nil, err
	}
	number, err := getIntProp(p, "criterionNumber")
	if err != nil {
		return nil, err
	}
	earsPattern, err := getStringProp(p, "earsPattern")
	if err != nil {
		return nil, err
	}
	responseClause, err := getStringProp(p, "responseClause")
	if err != nil {
		return nil, err
	}
	fullText, err := getStringProp(p, "fullText")
	if err != nil {
		return nil, err
	}

	return &domain.AcceptanceCriterion{
		ID:              id,
		UserStoryID:     userStoryID,
		CriterionNumber: number,
		EarsPattern:     domain.EarsPattern(earsPattern),
		TriggerClause:   getStringPtrProp(p, "triggerClause"),
		ConditionClause: getStringPtrProp(p, "conditionClause"),
		StateClause:     getStringPtrProp(p, "stateClause"),
		ResponseClause:  responseClause,
		FullText:        fullText,
	}, nil
}

func nodeToNonGoal(n neo4j.Node) (*domain.NonGoal, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	specID, err := getStringProp(p, "specId")
	if err != nil {
		return nil, err
	}
	ordinal, err := getIntProp(p, "ordinal")
	if err != nil {
		return nil, err
	}
	description, err := getStringProp(p, "description")
	if err != nil {
		return nil, err
	}
	return &domain.NonGoal{ID: id, SpecID: specID, Ordinal: ordinal, Description: description}, nil
}

func nodeToOpenQuestion(n neo4j.Node) (*domain.OpenQuestion, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	specID, err := getStringProp(p, "specId")
	if err != nil {
		return nil, err
	}
	stage, err := getStringProp(p, "stage")
	if err != nil {
		return nil, err
	}
	description, err := getStringProp(p, "description")
	if err != nil {
		return nil, err
	}
	raisedAt, err := getTimeProp(p, "raisedAt")
	if err != nil {
		return nil, err
	}

	return &domain.OpenQuestion{
		ID:             id,
		SpecID:         specID,
		Stage:          domain.SpecStage(stage),
		TargetID:       getStringPtrProp(p, "targetId"),
		Description:    description,
		RaisedAt:       raisedAt,
		Resolved:       getBoolProp(p, "resolved"),
		ResolvedAt:     getTimePtrProp(p, "resolvedAt"),
		ResolvedBy:     getStringPtrProp(p, "resolvedBy"),
		ResolvedReason: getStringPtrProp(p, "resolvedReason"),
	}, nil
}

func nodeToGlossaryTerm(n neo4j.Node) (*domain.GlossaryTerm, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	specID, err := getStringProp(p, "specId")
	if err != nil {
		return nil, err
	}
	term, err := getStringProp(p, "term")
	if err != nil {
		return nil, err
	}
	return &domain.GlossaryTerm{
		ID:                id,
		SpecID:            specID,
		Term:              term,
		Definition:        getStringPtrProp(p, "definition"),
		ExternalReference: getStringPtrProp(p, "externalReference"),
	}, nil
}

func nodeToDesignComponent(n neo4j.Node) (*domain.DesignComponent, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	specID, err := getStringProp(p, "specId")
	if err != nil {
		return nil, err
	}
	slug, err := getStringProp(p, "slug")
	if err != nil {
		return nil, err
	}
	displayName, err := getStringProp(p, "displayName")
	if err != nil {
		return nil, err
	}
	ordinal, err := getIntProp(p, "ordinal")
	if err != nil {
		return nil, err
	}
	createdAt, err := getTimeProp(p, "createdAt")
	if err != nil {
		return nil, err
	}
	return &domain.DesignComponent{
		ID: id, SpecID: specID, Slug: slug, DisplayName: displayName, Ordinal: ordinal, CreatedAt: createdAt,
	}, nil
}

func nodeToDataModelEntry(n neo4j.Node) (*domain.DataModelEntry, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	specID, err := getStringProp(p, "specId")
	if err != nil {
		return nil, err
	}
	ordinal, err := getIntProp(p, "ordinal")
	if err != nil {
		return nil, err
	}
	name, err := getStringProp(p, "name")
	if err != nil {
		return nil, err
	}
	kind, err := getStringProp(p, "kind")
	if err != nil {
		return nil, err
	}
	content, err := getStringProp(p, "content")
	if err != nil {
		return nil, err
	}
	return &domain.DataModelEntry{ID: id, SpecID: specID, Ordinal: ordinal, Name: name, Kind: kind, Content: content}, nil
}

func nodeToTraceabilityEntry(n neo4j.Node) (*domain.TraceabilityEntry, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	specID, err := getStringProp(p, "specId")
	if err != nil {
		return nil, err
	}
	requirementLabel, err := getStringProp(p, "requirementLabel")
	if err != nil {
		return nil, err
	}
	addressedBy, err := getStringProp(p, "addressedBy")
	if err != nil {
		return nil, err
	}
	ordinal, err := getIntProp(p, "ordinal")
	if err != nil {
		return nil, err
	}
	return &domain.TraceabilityEntry{
		ID: id, SpecID: specID, UserStoryID: getStringPtrProp(p, "userStoryId"),
		RequirementLabel: requirementLabel, AddressedBy: addressedBy, Ordinal: ordinal,
	}, nil
}

func nodeToAlternative(n neo4j.Node) (*domain.Alternative, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	specID, err := getStringProp(p, "specId")
	if err != nil {
		return nil, err
	}
	ordinal, err := getIntProp(p, "ordinal")
	if err != nil {
		return nil, err
	}
	description, err := getStringProp(p, "description")
	if err != nil {
		return nil, err
	}
	return &domain.Alternative{ID: id, SpecID: specID, Ordinal: ordinal, Description: description}, nil
}

func nodeToOpenRisk(n neo4j.Node) (*domain.OpenRisk, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	specID, err := getStringProp(p, "specId")
	if err != nil {
		return nil, err
	}
	ordinal, err := getIntProp(p, "ordinal")
	if err != nil {
		return nil, err
	}
	description, err := getStringProp(p, "description")
	if err != nil {
		return nil, err
	}
	return &domain.OpenRisk{ID: id, SpecID: specID, Ordinal: ordinal, Description: description}, nil
}

func nodeToTasksDoc(n neo4j.Node) (*domain.TasksDoc, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	specID, err := getStringProp(p, "specId")
	if err != nil {
		return nil, err
	}
	designComponentID, err := getStringProp(p, "designComponentId")
	if err != nil {
		return nil, err
	}
	componentSlug, err := getStringProp(p, "componentSlug")
	if err != nil {
		return nil, err
	}
	componentName, err := getStringProp(p, "componentName")
	if err != nil {
		return nil, err
	}
	status, err := getStringProp(p, "status")
	if err != nil {
		return nil, err
	}
	createdAt, err := getTimeProp(p, "createdAt")
	if err != nil {
		return nil, err
	}
	updatedAt, err := getTimeProp(p, "updatedAt")
	if err != nil {
		return nil, err
	}
	return &domain.TasksDoc{
		ID: id, SpecID: specID, DesignComponentID: designComponentID,
		ComponentSlug: componentSlug, ComponentName: componentName,
		Status:           domain.SpecStageStatus(status),
		DeniedAt:         getTimePtrProp(p, "deniedAt"),
		LastDenialReason: getStringPtrProp(p, "lastDenialReason"),
		CreatedAt:        createdAt,
		UpdatedAt:        updatedAt,
	}, nil
}

func nodeToTaskItem(n neo4j.Node) (*domain.TaskItem, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	tasksDocID, err := getStringProp(p, "tasksDocId")
	if err != nil {
		return nil, err
	}
	itemID, err := getStringProp(p, "itemId")
	if err != nil {
		return nil, err
	}
	executionOrder, err := getIntProp(p, "executionOrder")
	if err != nil {
		return nil, err
	}
	title, err := getStringProp(p, "title")
	if err != nil {
		return nil, err
	}
	description, err := getStringProp(p, "description")
	if err != nil {
		return nil, err
	}
	suggestedAgent, err := getStringProp(p, "suggestedAgent")
	if err != nil {
		return nil, err
	}
	acceptanceCheck, err := getStringProp(p, "acceptanceCheck")
	if err != nil {
		return nil, err
	}
	createdAt, err := getTimeProp(p, "createdAt")
	if err != nil {
		return nil, err
	}
	updatedAt, err := getTimeProp(p, "updatedAt")
	if err != nil {
		return nil, err
	}
	return &domain.TaskItem{
		ID: id, TasksDocID: tasksDocID, ItemID: itemID,
		ParentItemID:    getStringPtrProp(p, "parentItemId"),
		ExecutionOrder:  executionOrder,
		Title:           title,
		Description:     description,
		SuggestedAgent:  suggestedAgent,
		AcceptanceCheck: acceptanceCheck,
		IsChecked:       getBoolProp(p, "isChecked"),
		CreatedAt:       createdAt,
		UpdatedAt:       updatedAt,
	}, nil
}

func nodeToFileTouched(n neo4j.Node) (*domain.FileTouched, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	taskItemID, err := getStringProp(p, "taskItemId")
	if err != nil {
		return nil, err
	}
	ordinal, err := getIntProp(p, "ordinal")
	if err != nil {
		return nil, err
	}
	filePath, err := getStringProp(p, "filePath")
	if err != nil {
		return nil, err
	}
	return &domain.FileTouched{ID: id, TaskItemID: taskItemID, Ordinal: ordinal, FilePath: filePath}, nil
}

func nodeToParallelBatch(n neo4j.Node) (*domain.ParallelBatch, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	tasksDocID, err := getStringProp(p, "tasksDocId")
	if err != nil {
		return nil, err
	}
	label, err := getStringProp(p, "batchLabel")
	if err != nil {
		return nil, err
	}
	order, err := getIntProp(p, "batchOrder")
	if err != nil {
		return nil, err
	}
	return &domain.ParallelBatch{ID: id, TasksDocID: tasksDocID, BatchLabel: label, BatchOrder: order}, nil
}

func nodeToDefinitionOfDoneItem(n neo4j.Node) (*domain.DefinitionOfDoneItem, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	specID, err := getStringProp(p, "specId")
	if err != nil {
		return nil, err
	}
	ordinal, err := getIntProp(p, "ordinal")
	if err != nil {
		return nil, err
	}
	description, err := getStringProp(p, "description")
	if err != nil {
		return nil, err
	}
	return &domain.DefinitionOfDoneItem{
		ID: id, SpecID: specID, Ordinal: ordinal, Description: description, IsChecked: getBoolProp(p, "isChecked"),
	}, nil
}

func nodeToHandoffAttachment(n neo4j.Node) (*domain.HandoffAttachment, error) {
	p := n.Props
	id, err := getStringProp(p, "id")
	if err != nil {
		return nil, err
	}
	handoffID, err := getStringProp(p, "handoffId")
	if err != nil {
		return nil, err
	}
	ordinal, err := getIntProp(p, "ordinal")
	if err != nil {
		return nil, err
	}
	repoPath, err := getStringProp(p, "repoPath")
	if err != nil {
		return nil, err
	}
	commitSHA, err := getStringProp(p, "commitSha")
	if err != nil {
		return nil, err
	}
	note, err := getStringProp(p, "note")
	if err != nil {
		return nil, err
	}
	return &domain.HandoffAttachment{
		ID:        id,
		HandoffID: handoffID,
		Ordinal:   ordinal,
		RepoPath:  repoPath,
		CommitSHA: commitSHA,
		Note:      note,
	}, nil
}
