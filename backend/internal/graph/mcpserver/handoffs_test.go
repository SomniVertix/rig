package mcpserver

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

// stubHandoffStore implements store.Store with minimal handoff methods for
// testing tool handlers. All other methods panic if called.
type stubHandoffStore struct {
	store.Store
	handoffs             map[string]*domain.Handoff
	attachments          map[string][]domain.HandoffAttachment
	listResult           []domain.Handoff
	nextAttachID         int
	nextHandoffID        int
	sendHandoffErr       error
	conversationToReturn *domain.HandoffConversation
}

func (s *stubHandoffStore) SendHandoff(ctx context.Context, params store.SendHandoffParams) (*domain.Handoff, error) {
	if s.sendHandoffErr != nil {
		return nil, s.sendHandoffErr
	}
	now := time.Now()
	s.nextHandoffID++
	h := &domain.Handoff{
		ID:                "h" + string(rune(s.nextHandoffID)),
		SourceWorkspaceID: params.SourceWorkspaceID,
		TargetWorkspaceID: params.TargetWorkspaceID,
		Title:             params.Title,
		BodyMarkdown:      params.BodyMarkdown,
		Type:              params.Type,
		Status:            string(domain.HandoffStatusPending),
		SentBy:            params.SentBy,
		SentAt:            now,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	s.handoffs[h.ID] = h
	return h, nil
}

func (s *stubHandoffStore) GetHandoff(ctx context.Context, id string) (*domain.Handoff, error) {
	if h, ok := s.handoffs[id]; ok {
		return h, nil
	}
	return nil, store.ErrNotFound
}

func (s *stubHandoffStore) ListHandoffs(ctx context.Context, params store.ListHandoffsParams) ([]domain.Handoff, error) {
	return s.listResult, nil
}

func (s *stubHandoffStore) ListHandoffAttachments(ctx context.Context, handoffID string) ([]domain.HandoffAttachment, error) {
	if atts, ok := s.attachments[handoffID]; ok {
		return atts, nil
	}
	return []domain.HandoffAttachment{}, nil
}

func (s *stubHandoffStore) MarkHandoffRead(ctx context.Context, id string) error {
	if h, ok := s.handoffs[id]; ok {
		h.Status = string(domain.HandoffStatusRead)
		now := time.Now()
		h.ReadAt = &now
		return nil
	}
	return store.ErrNotFound
}

func (s *stubHandoffStore) CloseHandoff(ctx context.Context, params store.CloseHandoffParams) error {
	if h, ok := s.handoffs[params.ID]; ok {
		if h.Status != string(domain.HandoffStatusPending) && h.Status != string(domain.HandoffStatusRead) {
			return store.ErrConflict
		}
		h.Status = params.Terminal
		now := time.Now()
		h.ResolvedAt = &now
		h.ResolutionNote = &params.ResolutionNote
		h.ResolvedBy = &params.ResolvedBy
		return nil
	}
	return store.ErrNotFound
}

// GetHandoffConversationByHandoff always reports no conversation unless the
// test configures one — every handoffOut mapper calls this to populate
// HasConversation, so the stub must answer rather than panic.
func (s *stubHandoffStore) GetHandoffConversationByHandoff(ctx context.Context, handoffID string) (*domain.HandoffConversation, error) {
	if s.conversationToReturn != nil && s.conversationToReturn.HandoffID == handoffID {
		return s.conversationToReturn, nil
	}
	return nil, store.ErrNotFound
}

func (s *stubHandoffStore) AddHandoffAttachment(ctx context.Context, params store.AddHandoffAttachmentParams) (*domain.HandoffAttachment, error) {
	if h, ok := s.handoffs[params.HandoffID]; ok {
		if h.Status != string(domain.HandoffStatusPending) {
			return nil, store.ErrConflict
		}
		s.nextAttachID++
		att := domain.HandoffAttachment{
			ID:        "att" + string(rune(s.nextAttachID)),
			HandoffID: params.HandoffID,
			Ordinal:   len(s.attachments[params.HandoffID]) + 1,
			RepoPath:  params.RepoPath,
			CommitSHA: params.CommitSHA,
			Note:      params.Note,
		}
		s.attachments[params.HandoffID] = append(s.attachments[params.HandoffID], att)
		return &att, nil
	}
	return nil, store.ErrNotFound
}

// TestSendHandoffValidation verifies send_handoff validates and routes correctly.
func TestSendHandoffValidation(t *testing.T) {
	tests := []struct {
		name    string
		in      sendHandoffIn
		wantErr string // substring expected in the toolError message
	}{
		{
			name: "source equals target",
			in: sendHandoffIn{
				SourceWorkspaceID: "same-ws", TargetWorkspaceID: "same-ws",
				Title: "t", BodyMarkdown: "b", Type: "bug", SentBy: "agent1",
			},
			wantErr: "a Handoff must target a different workspace than its source",
		},
		{
			name: "unknown target workspace (non-kebab-case slug)",
			in: sendHandoffIn{
				SourceWorkspaceID: "ws-a", TargetWorkspaceID: "Not_A_Slug",
				Title: "t", BodyMarkdown: "b", Type: "bug", SentBy: "agent1",
			},
			wantErr: "unknown targetWorkspaceId Not_A_Slug — call list_workspaces to see what exists",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stub := &stubHandoffStore{
				handoffs:    make(map[string]*domain.Handoff),
				attachments: make(map[string][]domain.HandoffAttachment),
			}
			svc := service.New(stub)
			handler := sendHandoff(svc)

			result, _, err := handler(context.Background(), nil, tt.in)
			if err != nil {
				t.Fatalf("sendHandoff() unexpected transport error: %v", err)
			}
			if result == nil || !result.IsError {
				t.Fatal("sendHandoff() expected a toolError result, got none")
			}
			text := result.Content[0].(*mcp.TextContent).Text
			if !strings.Contains(text, tt.wantErr) {
				t.Fatalf("sendHandoff() error text = %q, want substring %q", text, tt.wantErr)
			}
		})
	}

	t.Run("happy path routes to the store", func(t *testing.T) {
		stub := &stubHandoffStore{
			handoffs:    make(map[string]*domain.Handoff),
			attachments: make(map[string][]domain.HandoffAttachment),
		}
		svc := service.New(stub)
		handler := sendHandoff(svc)

		result, out, err := handler(context.Background(), nil, sendHandoffIn{
			SourceWorkspaceID: "ws-a", TargetWorkspaceID: "ws-b",
			Title: "t", BodyMarkdown: "b", Type: "bug", SentBy: "agent1",
		})
		if err != nil {
			t.Fatalf("sendHandoff() unexpected error: %v", err)
		}
		if result != nil {
			t.Fatalf("sendHandoff() unexpected toolError result: %+v", result)
		}
		if out.ID == "" || out.Status != string(domain.HandoffStatusPending) {
			t.Fatalf("sendHandoff() out = %+v, want a pending handoff with a generated id", out)
		}
	})
}

// TestListHandoffsDirection verifies list_handoffs filters by direction and
// rejects an invalid one.
func TestListHandoffsDirection(t *testing.T) {
	stub := &stubHandoffStore{
		handoffs:    make(map[string]*domain.Handoff),
		attachments: make(map[string][]domain.HandoffAttachment),
		listResult: []domain.Handoff{
			{
				ID:                "h1",
				SourceWorkspaceID: "ws-a",
				TargetWorkspaceID: "ws-b",
				Title:             "test",
				Type:              "question",
				Status:            string(domain.HandoffStatusRead),
				SentBy:            "agent1",
				SentAt:            time.Now(),
				CreatedAt:         time.Now(),
				UpdatedAt:         time.Now(),
			},
		},
	}
	svc := service.New(stub)
	handler := listHandoffs(svc)

	t.Run("valid direction returns index rows", func(t *testing.T) {
		result, out, err := handler(context.Background(), nil, listHandoffsIn{WorkspaceID: "ws-b", Direction: "inbound"})
		if err != nil {
			t.Fatalf("listHandoffs() unexpected error: %v", err)
		}
		if result != nil {
			t.Fatalf("listHandoffs() unexpected toolError result: %+v", result)
		}
		if len(out.Handoffs) != 1 || out.Handoffs[0].ID != "h1" {
			t.Fatalf("listHandoffs() out = %+v, want one row with id h1", out)
		}
	})

	t.Run("invalid direction rejected", func(t *testing.T) {
		result, _, err := handler(context.Background(), nil, listHandoffsIn{WorkspaceID: "ws-b", Direction: "sideways"})
		if err != nil {
			t.Fatalf("listHandoffs() unexpected transport error: %v", err)
		}
		if result == nil || !result.IsError {
			t.Fatal("listHandoffs() expected a toolError result for an invalid direction")
		}
	})
}

// TestGetHandoffTransitionedToRead verifies get_handoff signals read transition.
func TestGetHandoffTransitionedToRead(t *testing.T) {
	stub := &stubHandoffStore{
		handoffs:    make(map[string]*domain.Handoff),
		attachments: make(map[string][]domain.HandoffAttachment),
	}

	// Create a pending handoff
	now := time.Now()
	h := &domain.Handoff{
		ID:                "h1",
		SourceWorkspaceID: "ws-a",
		TargetWorkspaceID: "ws-b",
		Title:             "test",
		BodyMarkdown:      "body",
		Type:              "question",
		Status:            string(domain.HandoffStatusPending),
		SentBy:            "agent1",
		SentAt:            now,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	stub.handoffs[h.ID] = h

	svc := service.New(stub)
	handler := getHandoff(svc)

	result, out, err := handler(context.Background(), nil, getHandoffIn{ID: "h1"})
	if err != nil {
		t.Fatalf("getHandoff() unexpected error: %v", err)
	}
	if result != nil {
		t.Fatalf("getHandoff() unexpected toolError result: %+v", result)
	}
	if !out.TransitionedToRead {
		t.Fatal("getHandoff() TransitionedToRead = false, want true for a first fetch of a pending handoff")
	}
	if out.Handoff.Status != string(domain.HandoffStatusRead) {
		t.Fatalf("getHandoff() Handoff.Status = %s, want read", out.Handoff.Status)
	}

	// A second fetch must not report another transition.
	_, out2, err := handler(context.Background(), nil, getHandoffIn{ID: "h1"})
	if err != nil {
		t.Fatalf("getHandoff() second call unexpected error: %v", err)
	}
	if out2.TransitionedToRead {
		t.Fatal("getHandoff() second call TransitionedToRead = true, want false — already read")
	}
}

// TestActionHandoffRejectsBlankNote verifies action_handoff requires a resolution note.
func TestActionHandoffRejectsBlankNote(t *testing.T) {
	stub := &stubHandoffStore{
		handoffs:    make(map[string]*domain.Handoff),
		attachments: make(map[string][]domain.HandoffAttachment),
	}
	stub.handoffs["h1"] = &domain.Handoff{ID: "h1", Status: string(domain.HandoffStatusRead)}
	svc := service.New(stub)
	handler := actionHandoff(svc)

	result, _, err := handler(context.Background(), nil, closeHandoffIn{ID: "h1", ResolutionNote: "   "})
	if err != nil {
		t.Fatalf("actionHandoff() unexpected transport error: %v", err)
	}
	if result == nil || !result.IsError {
		t.Fatal("actionHandoff() expected a toolError result for a blank resolutionNote")
	}
	text := result.Content[0].(*mcp.TextContent).Text
	if !strings.Contains(text, "requires a non-empty resolutionNote") {
		t.Fatalf("actionHandoff() error text = %q, want the blank-note message", text)
	}
	if stub.handoffs["h1"].Status != string(domain.HandoffStatusRead) {
		t.Fatal("actionHandoff() must not change status when the note is blank")
	}
}

// TestDismissHandoffRejectsBlankNote verifies dismiss_handoff requires a resolution note.
func TestDismissHandoffRejectsBlankNote(t *testing.T) {
	stub := &stubHandoffStore{
		handoffs:    make(map[string]*domain.Handoff),
		attachments: make(map[string][]domain.HandoffAttachment),
	}
	stub.handoffs["h1"] = &domain.Handoff{ID: "h1", Status: string(domain.HandoffStatusRead)}
	svc := service.New(stub)
	handler := dismissHandoff(svc)

	result, _, err := handler(context.Background(), nil, closeHandoffIn{ID: "h1", ResolutionNote: ""})
	if err != nil {
		t.Fatalf("dismissHandoff() unexpected transport error: %v", err)
	}
	if result == nil || !result.IsError {
		t.Fatal("dismissHandoff() expected a toolError result for a blank resolutionNote")
	}
	if stub.handoffs["h1"].Status != string(domain.HandoffStatusRead) {
		t.Fatal("dismissHandoff() must not change status when the note is blank")
	}
}

// TestAddHandoffAttachmentPendingOnly verifies add_handoff_attachment errors when handoff is read/closed.
func TestAddHandoffAttachmentPendingOnly(t *testing.T) {
	stub := &stubHandoffStore{
		handoffs:    make(map[string]*domain.Handoff),
		attachments: make(map[string][]domain.HandoffAttachment),
	}
	stub.handoffs["h1"] = &domain.Handoff{ID: "h1", Status: string(domain.HandoffStatusRead)}
	svc := service.New(stub)
	handler := addHandoffAttachment(svc)

	result, _, err := handler(context.Background(), nil, addHandoffAttachmentIn{
		HandoffID: "h1", RepoPath: "src/main.go", CommitSHA: "abc123", Note: "n",
	})
	if err != nil {
		t.Fatalf("addHandoffAttachment() unexpected transport error: %v", err)
	}
	if result == nil || !result.IsError {
		t.Fatal("addHandoffAttachment() expected a toolError result for a non-pending handoff")
	}
	text := result.Content[0].(*mcp.TextContent).Text
	if !strings.Contains(text, "immutable") {
		t.Fatalf("addHandoffAttachment() error text = %q, want the immutability message", text)
	}
}
