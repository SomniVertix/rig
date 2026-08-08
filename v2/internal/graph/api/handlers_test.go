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
// method panics if called) and overriding just the methods used by the
// test handlers. Pattern matches mcpserver's fakeStore.
type stubStore struct {
	store.Store
	docs         []*domain.TasksDoc
	handoffs     []domain.Handoff
	attachments  []domain.HandoffAttachment
	conversation *domain.HandoffConversation
	turns        []domain.HandoffTurn
	err          error
}

func (s stubStore) ListTasksDocs(_ context.Context, specID string) ([]*domain.TasksDoc, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.docs, nil
}

func (s stubStore) ListHandoffs(_ context.Context, params store.ListHandoffsParams) ([]domain.Handoff, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.handoffs, nil
}

func (s stubStore) GetHandoff(_ context.Context, id string) (*domain.Handoff, error) {
	if s.err != nil {
		return nil, s.err
	}
	if len(s.handoffs) > 0 {
		return &s.handoffs[0], nil
	}
	return nil, store.ErrNotFound
}

func (s stubStore) ListHandoffAttachments(_ context.Context, handoffID string) ([]domain.HandoffAttachment, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.attachments, nil
}

func (s stubStore) GetHandoffConversationByHandoff(_ context.Context, handoffID string) (*domain.HandoffConversation, error) {
	if s.err != nil {
		return nil, s.err
	}
	if s.conversation != nil {
		return s.conversation, nil
	}
	return nil, store.ErrNotFound
}

func (s stubStore) ListHandoffTurns(_ context.Context, conversationID string) ([]domain.HandoffTurn, error) {
	if s.err != nil {
		return nil, s.err
	}
	return s.turns, nil
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

// --- Handoff REST Tests ---

func TestListHandoffsMissingWorkspaceId(t *testing.T) {
	h := NewHandlers(service.New(stubStore{}))
	mux := NewRouter(h)

	// Missing workspaceId should return 400
	req := httptest.NewRequest(http.MethodGet, "/handoffs?direction=inbound", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestListHandoffsBadDirection(t *testing.T) {
	h := NewHandlers(service.New(stubStore{}))
	mux := NewRouter(h)

	// Bad direction should return 400
	req := httptest.NewRequest(http.MethodGet, "/handoffs?workspaceId=ws1&direction=invalid", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", rec.Code, http.StatusBadRequest, rec.Body.String())
	}
}

func TestListHandoffsSuccess(t *testing.T) {
	handoffs := []domain.Handoff{
		{
			ID:                "h1",
			SourceWorkspaceID: "ws1",
			TargetWorkspaceID: "ws2",
			Title:             "Migrate auth",
			Type:              "dependency-change",
			Status:            "pending",
			SentBy:            "alice",
		},
	}
	h := NewHandlers(service.New(stubStore{handoffs: handoffs}))
	mux := NewRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/handoffs?workspaceId=ws2&direction=inbound", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var got map[string][]handoffDTO
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(got["handoffs"]) != 1 {
		t.Fatalf("expected 1 handoff, got %d", len(got["handoffs"]))
	}
	if got["handoffs"][0].ID != "h1" {
		t.Fatalf("unexpected handoff id: %s", got["handoffs"][0].ID)
	}
}

func TestGetHandoffSuccess(t *testing.T) {
	body := "Please migrate to the new auth system"
	handoffs := []domain.Handoff{
		{
			ID:                "h1",
			SourceWorkspaceID: "ws1",
			TargetWorkspaceID: "ws2",
			Title:             "Migrate auth",
			BodyMarkdown:      body,
			Type:              "dependency-change",
			Status:            "pending",
			SentBy:            "alice",
		},
	}
	attachments := []domain.HandoffAttachment{
		{
			ID:        "a1",
			Ordinal:   1,
			RepoPath:  "pkg/auth/main.go",
			CommitSHA: "abc123",
			Note:      "Key migration code",
		},
	}
	h := NewHandlers(service.New(stubStore{handoffs: handoffs, attachments: attachments}))
	mux := NewRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/handoffs/h1", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var got handoffDTO
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if got.ID != "h1" {
		t.Fatalf("unexpected handoff id: %s", got.ID)
	}
	if got.Body == nil || *got.Body != body {
		t.Fatalf("expected body to be present in single-get response")
	}
	if len(got.Attachments) != 1 {
		t.Fatalf("expected 1 attachment, got %d", len(got.Attachments))
	}
	// Important: REST GET /handoffs/{id} should NOT transition pending->read
	// Verify by checking that the status in the response is still "pending"
	if got.Status != "pending" {
		t.Fatalf("expected status to remain pending (no read transition), got %s", got.Status)
	}
}

func TestGetHandoffNotFound(t *testing.T) {
	h := NewHandlers(service.New(stubStore{err: store.ErrNotFound}))
	mux := NewRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/handoffs/missing", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body: %s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}

func TestGetHandoffConversationSuccess(t *testing.T) {
	sessionID := "sess1"
	conversation := &domain.HandoffConversation{
		ID:               "c1",
		HandoffID:        "h1",
		Status:           "active",
		ArbiterSessionID: &sessionID,
	}
	verdict := domain.HandoffVerdictAction
	turns := []domain.HandoffTurn{
		{
			ID:             "t1",
			ConversationID: "c1",
			TurnNumber:     1,
			Speaker:        domain.HandoffTurnSpeakerSource,
			Content:        "We're ready to migrate",
			Verdict:        &verdict,
		},
	}
	h := NewHandlers(service.New(stubStore{conversation: conversation, turns: turns}))
	mux := NewRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/handoffs/h1/conversation", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if got["conversation"] == nil {
		t.Fatal("expected conversation in response")
	}
	turnsArr := got["turns"].([]any)
	if len(turnsArr) != 1 {
		t.Fatalf("expected 1 turn, got %d", len(turnsArr))
	}
}

func TestGetHandoffConversationNotFound(t *testing.T) {
	h := NewHandlers(service.New(stubStore{err: store.ErrNotFound}))
	mux := NewRouter(h)

	req := httptest.NewRequest(http.MethodGet, "/handoffs/h1/conversation", nil)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body: %s", rec.Code, http.StatusNotFound, rec.Body.String())
	}
}
