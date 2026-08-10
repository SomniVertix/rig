package mcpserver

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

// stubStatusStore backs buildHandoffStatusRows's tests: it counts
// ListHandoffs calls (single-call rule) and lets a test configure a
// GetHandoffConversationByHandoff error per handoff id.
type stubStatusStore struct {
	store.Store
	handoffs          []domain.Handoff
	listHandoffsCalls int
	lastStatusFilter  *string
	conversationErrs  map[string]error // handoffID -> error; store.ErrNotFound means "no conversation"
}

func (s *stubStatusStore) ListHandoffs(ctx context.Context, params store.ListHandoffsParams) ([]domain.Handoff, error) {
	s.listHandoffsCalls++
	s.lastStatusFilter = params.Status
	return s.handoffs, nil
}

func (s *stubStatusStore) GetHandoffConversationByHandoff(ctx context.Context, handoffID string) (*domain.HandoffConversation, error) {
	if err, ok := s.conversationErrs[handoffID]; ok {
		if err == nil {
			return &domain.HandoffConversation{ID: "conv-" + handoffID, HandoffID: handoffID}, nil
		}
		return nil, err
	}
	return nil, store.ErrNotFound
}

func TestBuildHandoffStatusRows_SingleListHandoffsCall(t *testing.T) {
	stub := &stubStatusStore{
		handoffs: []domain.Handoff{
			{ID: "h1", SourceWorkspaceID: "ws-a", TargetWorkspaceID: "ws-b", Title: "t1", Type: "bug", Status: "pending", SentAt: time.Now()},
		},
		conversationErrs: map[string]error{},
	}
	svc := service.New(stub)

	if _, err := buildHandoffStatusRows(context.Background(), svc, "ws-b"); err != nil {
		t.Fatalf("buildHandoffStatusRows() unexpected error: %v", err)
	}

	if stub.listHandoffsCalls != 1 {
		t.Fatalf("ListHandoffs called %d times, want exactly 1 — get_workspace_status must stay a single call, not a fan-out", stub.listHandoffsCalls)
	}
	if stub.lastStatusFilter != nil {
		t.Fatalf("ListHandoffs Status filter = %v, want nil (pending/read filtering must happen client-side, not via two status-scoped calls)", *stub.lastStatusFilter)
	}
}

func TestBuildHandoffStatusRows_FiltersToPendingAndReadOnly(t *testing.T) {
	stub := &stubStatusStore{
		handoffs: []domain.Handoff{
			{ID: "h-pending", SourceWorkspaceID: "ws-a", TargetWorkspaceID: "ws-b", Title: "p", Type: "bug", Status: "pending", SentAt: time.Now()},
			{ID: "h-read", SourceWorkspaceID: "ws-a", TargetWorkspaceID: "ws-b", Title: "r", Type: "bug", Status: "read", SentAt: time.Now()},
			{ID: "h-actioned", SourceWorkspaceID: "ws-a", TargetWorkspaceID: "ws-b", Title: "a", Type: "bug", Status: "actioned", SentAt: time.Now()},
			{ID: "h-dismissed", SourceWorkspaceID: "ws-a", TargetWorkspaceID: "ws-b", Title: "d", Type: "bug", Status: "dismissed", SentAt: time.Now()},
		},
		conversationErrs: map[string]error{},
	}
	svc := service.New(stub)

	rows, err := buildHandoffStatusRows(context.Background(), svc, "ws-b")
	if err != nil {
		t.Fatalf("buildHandoffStatusRows() unexpected error: %v", err)
	}

	if len(rows) != 2 {
		t.Fatalf("len(rows) = %d, want 2 (pending + read only); got %+v", len(rows), rows)
	}
	seen := map[string]bool{}
	for _, r := range rows {
		seen[r.ID] = true
	}
	if !seen["h-pending"] || !seen["h-read"] {
		t.Fatalf("rows = %+v, want h-pending and h-read present", rows)
	}
	if seen["h-actioned"] || seen["h-dismissed"] {
		t.Fatalf("rows = %+v, want actioned/dismissed handoffs excluded", rows)
	}
}

func TestBuildHandoffStatusRows_HasConversationTrueAndFalse(t *testing.T) {
	stub := &stubStatusStore{
		handoffs: []domain.Handoff{
			{ID: "h-with-conv", SourceWorkspaceID: "ws-a", TargetWorkspaceID: "ws-b", Title: "t", Type: "bug", Status: "pending", SentAt: time.Now()},
			{ID: "h-without-conv", SourceWorkspaceID: "ws-a", TargetWorkspaceID: "ws-b", Title: "t2", Type: "bug", Status: "pending", SentAt: time.Now()},
		},
		conversationErrs: map[string]error{
			"h-with-conv":    nil,
			"h-without-conv": store.ErrNotFound,
		},
	}
	svc := service.New(stub)

	rows, err := buildHandoffStatusRows(context.Background(), svc, "ws-b")
	if err != nil {
		t.Fatalf("buildHandoffStatusRows() unexpected error: %v", err)
	}

	byID := map[string]bool{}
	for _, r := range rows {
		byID[r.ID] = r.HasConversation
	}
	if !byID["h-with-conv"] {
		t.Fatal("h-with-conv: HasConversation = false, want true")
	}
	if byID["h-without-conv"] {
		t.Fatal("h-without-conv: HasConversation = true, want false")
	}
}

func TestBuildHandoffStatusRows_PropagatesNonNotFoundConversationError(t *testing.T) {
	dbErr := errors.New("neo4jstore: connection reset")
	stub := &stubStatusStore{
		handoffs: []domain.Handoff{
			{ID: "h1", SourceWorkspaceID: "ws-a", TargetWorkspaceID: "ws-b", Title: "t", Type: "bug", Status: "pending", SentAt: time.Now()},
		},
		conversationErrs: map[string]error{
			"h1": dbErr,
		},
	}
	svc := service.New(stub)

	_, err := buildHandoffStatusRows(context.Background(), svc, "ws-b")
	if err == nil {
		t.Fatal("buildHandoffStatusRows() expected an error to propagate for a non-ErrNotFound conversation lookup failure, got nil")
	}
	if !errors.Is(err, dbErr) {
		t.Fatalf("buildHandoffStatusRows() error = %v, want it to wrap %v", err, dbErr)
	}
}

func TestBuildHandoffStatusRows_DirectionRelativeToWorkspace(t *testing.T) {
	stub := &stubStatusStore{
		handoffs: []domain.Handoff{
			{ID: "inbound-h", SourceWorkspaceID: "ws-other", TargetWorkspaceID: "ws-me", Title: "in", Type: "bug", Status: "pending", SentAt: time.Now()},
			{ID: "outbound-h", SourceWorkspaceID: "ws-me", TargetWorkspaceID: "ws-other", Title: "out", Type: "bug", Status: "pending", SentAt: time.Now()},
		},
		conversationErrs: map[string]error{},
	}
	svc := service.New(stub)

	rows, err := buildHandoffStatusRows(context.Background(), svc, "ws-me")
	if err != nil {
		t.Fatalf("buildHandoffStatusRows() unexpected error: %v", err)
	}

	byID := map[string]handoffStatusRowOut{}
	for _, r := range rows {
		byID[r.ID] = r
	}
	if byID["inbound-h"].Direction != "inbound" || byID["inbound-h"].CounterpartyWorkspaceID != "ws-other" {
		t.Fatalf("inbound-h = %+v, want direction=inbound counterparty=ws-other", byID["inbound-h"])
	}
	if byID["outbound-h"].Direction != "outbound" || byID["outbound-h"].CounterpartyWorkspaceID != "ws-other" {
		t.Fatalf("outbound-h = %+v, want direction=outbound counterparty=ws-other", byID["outbound-h"])
	}
}
