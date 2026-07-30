package api

import "net/http"

// NewRouter wires the REST surface described in openapi/graph.yaml onto
// stdlib net/http's method+pattern ServeMux (Go 1.22+).
//
// GetExpeditionBySpec is registered at /expedition-by-spec/{specId}, not
// nested under /expeditions/, because ServeMux rejects /expeditions/{id}/lineage
// and /expeditions/by-spec/{specId} as ambiguous at registration time (both
// match e.g. "/expeditions/by-spec/lineage" and neither pattern is more
// specific than the other).
//
// Returns the concrete *http.ServeMux (not just http.Handler) so callers can
// use its Handler(r) method to detect an unmatched request (empty pattern)
// and fall back to something else — e.g. cmd/rig mounts internal/webui's SPA
// as the fallback for any path this router doesn't own.
func NewRouter(h *Handlers) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /expeditions", h.CreateExpedition)
	mux.HandleFunc("GET /expeditions", h.ListExpeditions)
	mux.HandleFunc("GET /expedition-by-spec/{specId}", h.GetExpeditionBySpec)
	mux.HandleFunc("GET /expeditions/{id}", h.GetExpedition)
	mux.HandleFunc("PATCH /expeditions/{id}", h.UpdateExpedition)
	mux.HandleFunc("POST /expeditions/{id}/complete", h.CompleteExpedition)
	mux.HandleFunc("POST /expeditions/{id}/abandon", h.AbandonExpedition)
	mux.HandleFunc("POST /expeditions/{id}/reopen", h.ReopenExpedition)
	mux.HandleFunc("GET /expeditions/{id}/lineage", h.GetExpeditionLineage)

	mux.HandleFunc("POST /expeditions/{expeditionId}/waypoints", h.AddWaypoint)
	mux.HandleFunc("GET /expeditions/{expeditionId}/waypoints", h.ListWaypoints)
	mux.HandleFunc("GET /expeditions/{expeditionId}/waypoints/frontier", h.GetFrontier)

	mux.HandleFunc("GET /waypoints/{id}", h.GetWaypoint)
	mux.HandleFunc("PATCH /waypoints/{id}", h.UpdateWaypoint)
	mux.HandleFunc("POST /waypoints/{id}/claim", h.ClaimWaypoint)
	mux.HandleFunc("POST /waypoints/{id}/release", h.ReleaseWaypoint)
	mux.HandleFunc("POST /waypoints/{id}/reach", h.ReachWaypoint)
	mux.HandleFunc("POST /waypoints/{id}/bypass", h.BypassWaypoint)
	mux.HandleFunc("POST /waypoints/{id}/unbypass", h.UnbypassWaypoint)
	mux.HandleFunc("POST /waypoints/{id}/spur", h.SpurWaypoint)
	mux.HandleFunc("DELETE /waypoints/{id}/spur", h.UnspurWaypoint)

	mux.HandleFunc("POST /waypoint-dependencies", h.AddWaypointDependency)
	mux.HandleFunc("DELETE /waypoint-dependencies", h.RemoveWaypointDependency)
	mux.HandleFunc("GET /expeditions/{expeditionId}/waypoint-dependencies", h.ListWaypointDependencies)

	// Spec pipeline — read/lifecycle + approve/deny only; see the "Spec
	// pipeline" comment in dto.go for why this isn't a full mirror of the
	// mcp__rig__* catalog.
	mux.HandleFunc("GET /specs", h.ListSpecs)
	mux.HandleFunc("GET /specs/{id}", h.GetSpec)
	mux.HandleFunc("GET /specs/{id}/next-stage", h.GetNextStage)
	mux.HandleFunc("GET /specs/{id}/render", h.RenderDocument)
	mux.HandleFunc("POST /specs/{id}/finalize", h.FinalizeStage)
	mux.HandleFunc("POST /specs/{id}/approve", h.ApproveStage)
	mux.HandleFunc("POST /specs/{id}/deny", h.DenyStage)

	return mux
}
