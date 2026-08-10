// Package api is the binding service's REST transport.
package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/somnivertix/rig/internal/binding/registry"
)

type Handlers struct {
	registry *registry.Registry
}

func NewHandlers(reg *registry.Registry) *Handlers {
	return &Handlers{registry: reg}
}

type resolveRequest struct {
	Cwd string `json:"cwd"`
}

type resolveResponse struct {
	WorkspaceID string `json:"workspaceId"`
}

type errorResponse struct {
	Error string `json:"error"`
}

type listWorkspacesResponse struct {
	Workspaces []registry.WorkspaceSummary `json:"workspaces"`
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if body != nil {
		_ = json.NewEncoder(w).Encode(body)
	}
}

// Resolve handles POST /resolve: given an MCP client's working directory,
// returns the workspaceId of the workspace whose folders claim it.
func (h *Handlers) Resolve(w http.ResponseWriter, r *http.Request) {
	var req resolveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: err.Error()})
		return
	}
	if req.Cwd == "" {
		writeJSON(w, http.StatusBadRequest, errorResponse{Error: "cwd is required"})
		return
	}

	workspaceID, err := h.registry.Resolve(req.Cwd)
	if err != nil {
		writeResolveError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resolveResponse{WorkspaceID: workspaceID})
}

// ListWorkspaces handles GET /workspaces: returns every workspaceId a scanned
// workspace claims. Unlike Resolve, this needs no cwd — clients with no
// filesystem context of their own (like the browser) use it to enumerate
// real workspaces instead of a hand-maintained list.
func (h *Handlers) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, listWorkspacesResponse{Workspaces: h.registry.List()})
}

func writeResolveError(w http.ResponseWriter, err error) {
	status := http.StatusInternalServerError
	var ambiguous *registry.AmbiguousError
	switch {
	case errors.Is(err, registry.ErrNoMatch):
		status = http.StatusNotFound
	case errors.As(err, &ambiguous):
		status = http.StatusConflict
	}
	writeJSON(w, status, errorResponse{Error: err.Error()})
}
