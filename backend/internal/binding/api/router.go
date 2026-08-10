package api

import "net/http"

// NewRouter wires the binding service's REST surface onto stdlib
// net/http's method+pattern ServeMux (Go 1.22+).
func NewRouter(h *Handlers) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /resolve", h.Resolve)
	mux.HandleFunc("GET /workspaces", h.ListWorkspaces)
	return mux
}
