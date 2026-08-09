package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

// Handlers holds the dependencies the graph service's HTTP handlers need.
type Handlers struct {
	svc *service.Service
}

func NewHandlers(svc *service.Service) *Handlers {
	return &Handlers{svc: svc}
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

func writeError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	switch {
	case errors.Is(err, store.ErrNotFound):
		status = http.StatusNotFound
	case errors.Is(err, store.ErrConflict):
		status = http.StatusConflict
	case errors.Is(err, store.ErrNotImplemented):
		status = http.StatusNotImplemented
	case errors.Is(err, service.ErrInvalidSlug), errors.Is(err, service.ErrOutcomeSpecRequired):
		status = http.StatusBadRequest
	case errors.Is(err, service.ErrComponentNotFound):
		status = http.StatusNotFound
	case errors.Is(err, service.ErrUnresolvedOpenQuestions),
		errors.Is(err, service.ErrRequirementsIncomplete),
		errors.Is(err, service.ErrDesignIncomplete),
		errors.Is(err, service.ErrOrphanedTasksDocs),
		errors.Is(err, service.ErrTasksIncomplete),
		errors.Is(err, service.ErrTaskDependencyCycle):
		status = http.StatusConflict
	}
	writeJSON(w, status, errorResponse{Error: err.Error()})
}

func decodeJSON[T any](r *http.Request) (T, error) {
	var body T
	err := json.NewDecoder(r.Body).Decode(&body)
	return body, err
}

// --- Expeditions ---

func (h *Handlers) CreateExpedition(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[createExpeditionRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	expedition, err := h.svc.CreateExpedition(r.Context(), req.toParams())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, newExpeditionDTO(expedition))
}

func (h *Handlers) GetExpedition(w http.ResponseWriter, r *http.Request) {
	expedition, err := h.svc.GetExpedition(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newExpeditionDTO(expedition))
}

func (h *Handlers) GetExpeditionBySpec(w http.ResponseWriter, r *http.Request) {
	expedition, err := h.svc.GetExpeditionBySpec(r.Context(), r.PathValue("specId"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newExpeditionDTO(expedition))
}

func (h *Handlers) ListExpeditions(w http.ResponseWriter, r *http.Request) {
	params := store.ListExpeditionsParams{WorkspaceID: r.URL.Query().Get("workspaceId")}
	if s := r.URL.Query().Get("status"); s != "" {
		status := domain.ExpeditionStatus(s)
		params.Status = &status
	}
	expeditions, err := h.svc.ListExpeditions(r.Context(), params)
	if err != nil {
		writeError(w, err)
		return
	}
	dtos := make([]expeditionDTO, len(expeditions))
	for i, e := range expeditions {
		dtos[i] = newExpeditionDTO(e)
	}
	writeJSON(w, http.StatusOK, dtos)
}

func (h *Handlers) UpdateExpedition(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[updateExpeditionRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	expedition, err := h.svc.UpdateExpedition(r.Context(), r.PathValue("id"), req.toParams())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newExpeditionDTO(expedition))
}

// CompleteExpedition's outcomeKind:"spec" branch creates the spec and
// links it in the same request — mirroring mcpserver's completeExpedition.
// There is no standalone create-spec endpoint; this is the only way one
// gets created.
func (h *Handlers) CompleteExpedition(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[completeExpeditionRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	expeditionID := r.PathValue("id")
	params := req.toParams()

	if req.OutcomeKind == string(domain.ExpeditionOutcomeSpec) {
		if req.SpecSlug == nil || req.FeatureName == nil {
			writeJSON(w, http.StatusBadRequest, errorResponse{Error: "outcomeKind \"spec\" requires both specSlug and featureName"})
			return
		}
		expedition, err := h.svc.GetExpedition(r.Context(), expeditionID)
		if err != nil {
			writeError(w, err)
			return
		}
		spec, err := h.svc.CreateSpec(r.Context(), store.CreateSpecParams{
			WorkspaceID: expedition.WorkspaceID, Slug: *req.SpecSlug, FeatureName: *req.FeatureName,
		})
		if err != nil {
			writeError(w, err)
			return
		}
		params.OutcomeSpecID = &spec.ID
	}

	expedition, err := h.svc.CompleteExpedition(r.Context(), expeditionID, params)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newExpeditionDTO(expedition))
}

func (h *Handlers) AbandonExpedition(w http.ResponseWriter, r *http.Request) {
	expedition, err := h.svc.AbandonExpedition(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newExpeditionDTO(expedition))
}

func (h *Handlers) ReopenExpedition(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[reasonRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	expedition, err := h.svc.ReopenExpedition(r.Context(), r.PathValue("id"), req.Reason)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newExpeditionDTO(expedition))
}

func (h *Handlers) GetExpeditionLineage(w http.ResponseWriter, r *http.Request) {
	lineage, err := h.svc.GetExpeditionLineage(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newLineageDTO(lineage))
}

// --- Waypoints ---

func (h *Handlers) AddWaypoint(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[addWaypointRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	wp, err := h.svc.AddWaypoint(r.Context(), r.PathValue("expeditionId"), req.toParams())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, newWaypointDTO(wp))
}

func (h *Handlers) ListWaypoints(w http.ResponseWriter, r *http.Request) {
	waypoints, err := h.svc.ListWaypoints(r.Context(), r.PathValue("expeditionId"))
	if err != nil {
		writeError(w, err)
		return
	}
	dtos := make([]waypointDTO, len(waypoints))
	for i, wp := range waypoints {
		dtos[i] = newWaypointDTO(wp)
	}
	writeJSON(w, http.StatusOK, dtos)
}

func (h *Handlers) GetFrontier(w http.ResponseWriter, r *http.Request) {
	waypoints, err := h.svc.GetFrontier(r.Context(), r.PathValue("expeditionId"))
	if err != nil {
		writeError(w, err)
		return
	}
	dtos := make([]waypointDTO, len(waypoints))
	for i, wp := range waypoints {
		dtos[i] = newWaypointDTO(wp)
	}
	writeJSON(w, http.StatusOK, dtos)
}

func (h *Handlers) GetWaypoint(w http.ResponseWriter, r *http.Request) {
	wp, err := h.svc.GetWaypoint(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newWaypointDTO(wp))
}

func (h *Handlers) UpdateWaypoint(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[updateWaypointRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	wp, err := h.svc.UpdateWaypoint(r.Context(), r.PathValue("id"), req.toParams())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newWaypointDTO(wp))
}

func (h *Handlers) ClaimWaypoint(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[claimWaypointRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	wp, err := h.svc.ClaimWaypoint(r.Context(), r.PathValue("id"), req.ClaimedBy)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newWaypointDTO(wp))
}

func (h *Handlers) ReleaseWaypoint(w http.ResponseWriter, r *http.Request) {
	wp, err := h.svc.ReleaseWaypoint(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newWaypointDTO(wp))
}

func (h *Handlers) ReachWaypoint(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[reachWaypointRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	wp, err := h.svc.ReachWaypoint(r.Context(), r.PathValue("id"), req.toParams())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newWaypointDTO(wp))
}

func (h *Handlers) BypassWaypoint(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[bypassWaypointRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	wp, err := h.svc.BypassWaypoint(r.Context(), r.PathValue("id"), req.Reason)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newWaypointDTO(wp))
}

func (h *Handlers) UnbypassWaypoint(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[reasonRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	wp, err := h.svc.UnbypassWaypoint(r.Context(), r.PathValue("id"), req.Reason)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newWaypointDTO(wp))
}

func (h *Handlers) SpurWaypoint(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[spurWaypointRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	expedition, err := h.svc.SpurWaypoint(r.Context(), r.PathValue("id"), req.toParams())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, newExpeditionDTO(expedition))
}

func (h *Handlers) UnspurWaypoint(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[reasonRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	if err := h.svc.UnspurWaypoint(r.Context(), r.PathValue("id"), req.Reason); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Rehydrate / history / flags / assets / terms ---

func (h *Handlers) RehydrateWaypoint(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[reasonRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	wp, err := h.svc.RehydrateWaypoint(r.Context(), r.PathValue("id"), req.Reason)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newWaypointDTO(wp))
}

func (h *Handlers) ListWaypointHistory(w http.ResponseWriter, r *http.Request) {
	entries, err := h.svc.ListWaypointHistory(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	dtos := make([]waypointHistoryEntryDTO, len(entries))
	for i, e := range entries {
		dtos[i] = newWaypointHistoryEntryDTO(e)
	}
	writeJSON(w, http.StatusOK, dtos)
}

func (h *Handlers) FlagWaypoint(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[flagWaypointRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	flag, err := h.svc.FlagWaypoint(r.Context(), r.PathValue("id"), store.FlagWaypointParams{
		Note: req.Note, SourceWaypointID: req.SourceWaypointID,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, newFlagDTO(flag))
}

func (h *Handlers) ResolveWaypointFlag(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[reasonRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	flag, err := h.svc.ResolveWaypointFlag(r.Context(), r.PathValue("id"), req.Reason)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newFlagDTO(flag))
}

func (h *Handlers) ListWaypointFlags(w http.ResponseWriter, r *http.Request) {
	flags, err := h.svc.ListWaypointFlags(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	dtos := make([]flagDTO, len(flags))
	for i, f := range flags {
		dtos[i] = newFlagDTO(f)
	}
	writeJSON(w, http.StatusOK, dtos)
}

func (h *Handlers) ListUnresolvedExpeditionFlags(w http.ResponseWriter, r *http.Request) {
	flags, err := h.svc.ListUnresolvedFlagsForExpedition(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	dtos := make([]flagDTO, len(flags))
	for i, f := range flags {
		dtos[i] = newFlagDTO(f)
	}
	writeJSON(w, http.StatusOK, dtos)
}

func (h *Handlers) AddWaypointAsset(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[addWaypointAssetRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	asset, err := h.svc.AddWaypointAsset(r.Context(), r.PathValue("id"), req.toParams())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, newAssetDTO(asset))
}

func (h *Handlers) ListWaypointAssets(w http.ResponseWriter, r *http.Request) {
	assets, err := h.svc.ListWaypointAssets(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	dtos := make([]assetDTO, len(assets))
	for i, a := range assets {
		dtos[i] = newAssetDTO(a)
	}
	writeJSON(w, http.StatusOK, dtos)
}

func (h *Handlers) AddExpeditionTerm(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[addExpeditionTermRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	term, err := h.svc.AddExpeditionTerm(r.Context(), r.PathValue("id"), req.Term, req.Definition)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, newTermDTO(term))
}

func (h *Handlers) UpdateExpeditionTerm(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[updateExpeditionTermRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	term, err := h.svc.UpdateExpeditionTerm(r.Context(), r.PathValue("id"), req.Definition)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newTermDTO(term))
}

func (h *Handlers) ListExpeditionTerms(w http.ResponseWriter, r *http.Request) {
	terms, err := h.svc.ListExpeditionTerms(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	dtos := make([]termDTO, len(terms))
	for i, t := range terms {
		dtos[i] = newTermDTO(t)
	}
	writeJSON(w, http.StatusOK, dtos)
}

// --- Dependency edges ---

func (h *Handlers) AddWaypointDependency(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[waypointDependencyRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	if err := h.svc.AddWaypointDependency(r.Context(), req.FromWaypointID, req.ToWaypointID); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) ListWaypointDependencies(w http.ResponseWriter, r *http.Request) {
	edges, err := h.svc.ListWaypointDependencies(r.Context(), r.PathValue("expeditionId"))
	if err != nil {
		writeError(w, err)
		return
	}
	dtos := make([]waypointDependencyDTO, len(edges))
	for i, e := range edges {
		dtos[i] = newWaypointDependencyDTO(e)
	}
	writeJSON(w, http.StatusOK, dtos)
}

func (h *Handlers) RemoveWaypointDependency(w http.ResponseWriter, r *http.Request) {
	req, err := decodeJSON[waypointDependencyRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	if err := h.svc.RemoveWaypointDependency(r.Context(), req.FromWaypointID, req.ToWaypointID); err != nil {
		writeError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- Spec pipeline ---
//
// Scoped to read/lifecycle + approve/deny — see the "Spec pipeline" comment
// in dto.go for why this isn't a full mirror of the mcp__rig__* catalog.

func (h *Handlers) specDTOFor(ctx context.Context, spec *domain.Spec) (specDTO, error) {
	tasksStatus, err := h.svc.DeriveTasksStageStatus(ctx, spec.ID)
	if err != nil {
		return specDTO{}, err
	}
	return newSpecDTO(spec, tasksStatus), nil
}

func (h *Handlers) ListSpecs(w http.ResponseWriter, r *http.Request) {
	specs, err := h.svc.ListSpecs(r.Context(), r.URL.Query().Get("workspaceId"))
	if err != nil {
		writeError(w, err)
		return
	}
	dtos := make([]specDTO, len(specs))
	for i, s := range specs {
		dto, err := h.specDTOFor(r.Context(), s)
		if err != nil {
			writeError(w, err)
			return
		}
		dtos[i] = dto
	}
	writeJSON(w, http.StatusOK, dtos)
}

func (h *Handlers) GetSpec(w http.ResponseWriter, r *http.Request) {
	spec, err := h.svc.GetSpec(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	dto, err := h.specDTOFor(r.Context(), spec)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, dto)
}

func (h *Handlers) ListTasksDocs(w http.ResponseWriter, r *http.Request) {
	docs, err := h.svc.ListTasksDocs(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, listTasksDocsResponse{TasksDocs: newTasksDocDTOs(docs)})
}

func (h *Handlers) RenderDocument(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	md, err := h.svc.RenderDocument(r.Context(), r.PathValue("id"), q.Get("stage"), q.Get("component"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, renderDocumentResponse{Markdown: md})
}

// --- Handoffs ---

func (h *Handlers) ListHandoffs(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.URL.Query().Get("workspaceId")
	if workspaceID == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "workspaceId is required"})
		return
	}

	direction := r.URL.Query().Get("direction")
	if direction != "inbound" && direction != "outbound" && direction != "both" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "direction must be one of: inbound, outbound, both"})
		return
	}

	params := store.ListHandoffsParams{
		WorkspaceID: workspaceID,
		Direction:   direction,
	}
	if s := r.URL.Query().Get("status"); s != "" {
		params.Status = &s
	}

	handoffs, err := h.svc.ListHandoffs(r.Context(), params)
	if err != nil {
		writeError(w, err)
		return
	}

	dtos := make([]handoffDTO, len(handoffs))
	for i := range handoffs {
		hasConv, err := handoffHasConversation(r.Context(), h.svc, handoffs[i].ID)
		if err != nil {
			writeError(w, err)
			return
		}
		dto := newHandoffDTO(&handoffs[i], nil, hasConv, false)
		dtos[i] = *dto
	}
	writeJSON(w, http.StatusOK, map[string]any{"handoffs": dtos})
}

func (h *Handlers) GetHandoff(w http.ResponseWriter, r *http.Request) {
	handoffID := r.PathValue("id")

	// IMPORTANT: This REST endpoint reads the handoff WITHOUT the side effect
	// of marking it read (unlike the MCP tool). The console is read-only and
	// must not trigger pending->read transitions as a browsing side effect.
	handoff, err := h.svc.GetHandoffWithoutReadTransition(r.Context(), handoffID)
	if err != nil {
		writeError(w, err)
		return
	}

	// Fetch its attachments
	attachments, err := h.svc.ListHandoffAttachments(r.Context(), handoffID)
	if err != nil {
		writeError(w, err)
		return
	}

	hasConv, err := handoffHasConversation(r.Context(), h.svc, handoffID)
	if err != nil {
		writeError(w, err)
		return
	}

	dto := newHandoffDTO(handoff, attachments, hasConv, true)
	writeJSON(w, http.StatusOK, dto)
}

// handoffHasConversation reports whether a Handoff has a started
// HandoffConversation. store.ErrNotFound means no — every other error
// propagates to the caller.
func handoffHasConversation(ctx context.Context, svc *service.Service, handoffID string) (bool, error) {
	_, err := svc.GetHandoffConversationByHandoff(ctx, handoffID)
	if err == nil {
		return true, nil
	}
	if err == store.ErrNotFound {
		return false, nil
	}
	return false, err
}

func (h *Handlers) GetHandoffConversation(w http.ResponseWriter, r *http.Request) {
	handoffID := r.PathValue("id")

	// Fetch the conversation for this handoff
	conversation, err := h.svc.GetHandoffConversationByHandoff(r.Context(), handoffID)
	if err != nil {
		writeError(w, err)
		return
	}

	// Fetch the turns for this conversation
	turns, err := h.svc.ListHandoffTurns(r.Context(), conversation.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	conversationDTO := newHandoffConversationDTO(conversation)
	turnDTOs := make([]handoffTurnDTO, len(turns))
	for i := range turns {
		turnDTOs[i] = *newHandoffTurnDTO(&turns[i])
	}

	type response struct {
		Conversation *handoffConversationDTO `json:"conversation"`
		Turns        []handoffTurnDTO        `json:"turns"`
	}

	writeJSON(w, http.StatusOK, response{
		Conversation: conversationDTO,
		Turns:        turnDTOs,
	})
}

func (h *Handlers) FinalizeStage(w http.ResponseWriter, r *http.Request) {
	h.stageAction(w, r, stageFinalize)
}

func (h *Handlers) ApproveStage(w http.ResponseWriter, r *http.Request) {
	h.stageAction(w, r, stageApprove)
}

func (h *Handlers) DenyStage(w http.ResponseWriter, r *http.Request) {
	h.stageAction(w, r, stageDeny)
}

type stageActionKind int

const (
	stageFinalize stageActionKind = iota
	stageApprove
	stageDeny
)

// stageAction dispatches finalize/approve/deny across requirements/design
// (spec-wide) and tasks (per-component, via Component's slug) — the three
// MCP-exposed operations share this same shape in mcpserver/spec.go;
// approve/deny only exist here, since they're human-only (no MCP tool).
func (h *Handlers) stageAction(w http.ResponseWriter, r *http.Request, kind stageActionKind) {
	req, err := decodeJSON[stageActionRequest](r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	specID := r.PathValue("id")

	if req.Stage == "tasks" {
		if req.Component == nil {
			writeJSON(w, http.StatusBadRequest, errorResponse{Error: "stage \"tasks\" requires component"})
			return
		}
		tasksDocID, err := h.svc.ResolveTasksDocIDBySlug(r.Context(), specID, *req.Component)
		if err != nil {
			writeError(w, err)
			return
		}
		var doc *domain.TasksDoc
		switch kind {
		case stageFinalize:
			doc, err = h.svc.FinalizeTasksStage(r.Context(), tasksDocID)
		case stageApprove:
			doc, err = h.svc.ApproveTasksStage(r.Context(), tasksDocID)
		case stageDeny:
			doc, err = h.svc.DenyTasksStage(r.Context(), tasksDocID, req.Reason)
		}
		if err != nil {
			writeError(w, err)
			return
		}
		dto := newTasksDocDTO(doc)
		writeJSON(w, http.StatusOK, stageActionResponse{TasksDoc: &dto})
		return
	}

	var spec *domain.Spec
	switch {
	case req.Stage == "requirements" && kind == stageFinalize:
		spec, err = h.svc.FinalizeRequirementsStage(r.Context(), specID)
	case req.Stage == "requirements" && kind == stageApprove:
		spec, err = h.svc.ApproveRequirementsStage(r.Context(), specID)
	case req.Stage == "requirements" && kind == stageDeny:
		spec, err = h.svc.DenyRequirementsStage(r.Context(), specID, req.Reason)
	case req.Stage == "design" && kind == stageFinalize:
		spec, err = h.svc.FinalizeDesignStage(r.Context(), specID)
	case req.Stage == "design" && kind == stageApprove:
		spec, err = h.svc.ApproveDesignStage(r.Context(), specID)
	case req.Stage == "design" && kind == stageDeny:
		spec, err = h.svc.DenyDesignStage(r.Context(), specID, req.Reason)
	case req.Stage == "implementation" && kind == stageFinalize:
		spec, err = h.svc.FinalizeImplementationStage(r.Context(), specID)
	case req.Stage == "implementation" && kind == stageApprove:
		spec, err = h.svc.ApproveImplementationStage(r.Context(), specID)
	case req.Stage == "implementation" && kind == stageDeny:
		spec, err = h.svc.DenyImplementationStage(r.Context(), specID, req.Reason)
	default:
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "unknown stage \"" + req.Stage + "\""})
		return
	}
	if err != nil {
		writeError(w, err)
		return
	}
	dto, err := h.specDTOFor(r.Context(), spec)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, stageActionResponse{Spec: &dto})
}

func (h *Handlers) GetNextStage(w http.ResponseWriter, r *http.Request) {
	info, err := h.svc.GetNextStage(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, newNextStageInfoDTO(info))
}
