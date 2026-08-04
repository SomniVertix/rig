package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

// stubStore satisfies store.Store by embedding it (every unimplemented
// method panics if called) and overriding just ListTasksDocs, the same
// pattern mcpserver's fakeStore uses.
type stubStore struct {
	store.Store
	docs []*domain.TasksDoc
	err  error
}

func (s stubStore) ListTasksDocs(_ context.Context, specID string) ([]*domain.TasksDoc, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.docs, nil
}

func TestListTasksDocs(t *testing.T) {
	docs := []*domain.TasksDoc{
		{
			ID: "doc-1", SpecID: "spec-1", DesignComponentID: "comp-1",
			ComponentSlug: "app-platform", ComponentName: "App Platform and Configuration",
			Status: domain.SpecStageStatus("in_review"),
		},
		{
			ID: "doc-2", SpecID: "spec-1", DesignComponentID: "comp-2",
			ComponentSlug: "auth-sessions", ComponentName: "Google OIDC Authentication and Sessions",
			Status: domain.SpecStageStatus("in_review"),
		},
	}
	h := NewHandlers(service.New(stubStore{docs: docs}))
	mux := NewRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/specs/spec-1/tasks-docs", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var got listTasksDocsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(got.TasksDocs) != 2 {
		t.Fatalf("len(TasksDocs) = %d, want 2", len(got.TasksDocs))
	}
	if got.TasksDocs[0].ComponentSlug != "app-platform" || got.TasksDocs[1].ComponentSlug != "auth-sessions" {
		t.Fatalf("unexpected component slugs: %+v", got.TasksDocs)
	}
	if got.TasksDocs[0].SpecID != "spec-1" || got.TasksDocs[0].DesignComponentID != "comp-1" {
		t.Fatalf("unexpected DTO fields: %+v", got.TasksDocs[0])
	}
}

func TestListTasksDocsEmpty(t *testing.T) {
	h := NewHandlers(service.New(stubStore{docs: []*domain.TasksDoc{}}))
	mux := NewRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/specs/spec-1/tasks-docs", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var got listTasksDocsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if got.TasksDocs == nil {
		t.Fatal("TasksDocs should marshal as [] not null")
	}
	if len(got.TasksDocs) != 0 {
		t.Fatalf("len(TasksDocs) = %d, want 0", len(got.TasksDocs))
	}
}

func TestListTasksDocsStoreError(t *testing.T) {
	h := NewHandlers(service.New(stubStore{err: store.ErrNotFound}))
	mux := NewRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/specs/missing/tasks-docs", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body: %s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}
