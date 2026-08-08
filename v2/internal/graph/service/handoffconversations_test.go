package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// fakeConversationStore is an in-memory store implementing the
// HandoffConversation guard/derivation semantics the real Cypher in
// neo4jstore.RecordHandoffTurn implements, so service-layer tests exercise
// real agreement/cap/escalation behavior rather than a store double that
// just returns canned values.
type fakeConversationStore struct {
	store.Store
	handoffs      map[string]*domain.Handoff
	conversations map[string]*domain.HandoffConversation
	turnsByConv   map[string][]domain.HandoffTurn
	convByHandoff map[string]string
	nextConvID    int
	nextTurnID    int
}

func newFakeConversationStore() *fakeConversationStore {
	return &fakeConversationStore{
		handoffs:      map[string]*domain.Handoff{},
		conversations: map[string]*domain.HandoffConversation{},
		turnsByConv:   map[string][]domain.HandoffTurn{},
		convByHandoff: map[string]string{},
	}
}

func (s *fakeConversationStore) StartHandoffConversation(ctx context.Context, params store.StartHandoffConversationParams) (*domain.HandoffConversation, error) {
	h, ok := s.handoffs[params.HandoffID]
	if !ok {
		return nil, store.ErrNotFound
	}
	if h.Status == string(domain.HandoffStatusActioned) || h.Status == string(domain.HandoffStatusDismissed) {
		return nil, store.ErrConflict
	}
	if _, exists := s.convByHandoff[params.HandoffID]; exists {
		return nil, store.ErrConflict
	}
	s.nextConvID++
	id := fmt.Sprintf("conv-%d", s.nextConvID)
	arbiterSessionID := params.ArbiterSessionID
	conv := &domain.HandoffConversation{
		ID:               id,
		HandoffID:        params.HandoffID,
		Status:           domain.HandoffConversationStatusActive,
		TurnCap:          domain.DefaultHandoffTurnCap,
		ArbiterSessionID: &arbiterSessionID,
		SourceRootPath:   params.SourceRootPath,
		TargetRootPath:   params.TargetRootPath,
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}
	s.conversations[id] = conv
	s.convByHandoff[params.HandoffID] = id
	return conv, nil
}

func (s *fakeConversationStore) GetHandoffConversation(ctx context.Context, id string) (*domain.HandoffConversation, error) {
	c, ok := s.conversations[id]
	if !ok {
		return nil, store.ErrNotFound
	}
	return c, nil
}

func (s *fakeConversationStore) GetHandoffConversationByHandoff(ctx context.Context, handoffID string) (*domain.HandoffConversation, error) {
	id, ok := s.convByHandoff[handoffID]
	if !ok {
		return nil, store.ErrNotFound
	}
	return s.conversations[id], nil
}

func (s *fakeConversationStore) ListHandoffTurns(ctx context.Context, conversationID string) ([]domain.HandoffTurn, error) {
	return append([]domain.HandoffTurn{}, s.turnsByConv[conversationID]...), nil
}

func (s *fakeConversationStore) RecordHandoffTurn(ctx context.Context, params store.RecordHandoffTurnParams) (*domain.HandoffConversationState, error) {
	conv, ok := s.conversations[params.ConversationID]
	if !ok {
		return nil, store.ErrNotFound
	}
	if conv.Status != domain.HandoffConversationStatusActive {
		return nil, store.ErrConflict
	}

	s.nextTurnID++
	var verdict *domain.HandoffVerdict
	if params.Verdict != "" {
		v := domain.HandoffVerdict(params.Verdict)
		verdict = &v
	}
	turn := domain.HandoffTurn{
		ID:             fmt.Sprintf("turn-%d", s.nextTurnID),
		ConversationID: params.ConversationID,
		TurnNumber:     len(s.turnsByConv[params.ConversationID]) + 1,
		Speaker:        domain.HandoffTurnSpeaker(params.Speaker),
		Content:        params.Content,
		Verdict:        verdict,
		CreatedAt:      time.Now(),
	}
	s.turnsByConv[params.ConversationID] = append(s.turnsByConv[params.ConversationID], turn)
	turns := s.turnsByConv[params.ConversationID]

	var latestSource, latestTarget *domain.HandoffTurn
	subagentCount := 0
	for i := range turns {
		t := &turns[i]
		switch t.Speaker {
		case domain.HandoffTurnSpeakerSource:
			latestSource = t
			subagentCount++
		case domain.HandoffTurnSpeakerTarget:
			latestTarget = t
			subagentCount++
		}
	}

	agreementReached := latestSource != nil && latestTarget != nil &&
		latestSource.Verdict != nil && latestTarget.Verdict != nil &&
		*latestSource.Verdict == *latestTarget.Verdict &&
		(*latestSource.Verdict == domain.HandoffVerdictAction || *latestSource.Verdict == domain.HandoffVerdictDismiss)
	capReached := subagentCount >= conv.TurnCap

	if agreementReached {
		conv.Status = domain.HandoffConversationStatusClosedAgreed
		now := time.Now()
		conv.ClosedAt = &now
	} else if capReached && conv.Status == domain.HandoffConversationStatusActive {
		conv.Status = domain.HandoffConversationStatusEscalated
		reason := domain.HandoffEscalationReasonTurnCap
		conv.EscalationReason = &reason
		now := time.Now()
		conv.EscalatedAt = &now
	}
	conv.UpdatedAt = time.Now()

	nextSpeaker := domain.HandoffTurnSpeakerSource
	if turn.Speaker == domain.HandoffTurnSpeakerSource {
		nextSpeaker = domain.HandoffTurnSpeakerTarget
	} else if turn.Speaker == domain.HandoffTurnSpeakerTarget {
		nextSpeaker = domain.HandoffTurnSpeakerSource
	}

	return &domain.HandoffConversationState{
		Conversation:      conv,
		LatestTurn:        &turn,
		SubagentTurnCount: subagentCount,
		AgreementReached:  agreementReached,
		CapReached:        capReached,
		NextSpeaker:       nextSpeaker,
	}, nil
}

func (s *fakeConversationStore) EscalateHandoffConversation(ctx context.Context, params store.EscalateHandoffConversationParams) error {
	conv, ok := s.conversations[params.ConversationID]
	if !ok {
		return store.ErrNotFound
	}
	if conv.Status != domain.HandoffConversationStatusActive {
		return store.ErrConflict
	}
	conv.Status = domain.HandoffConversationStatusEscalated
	reason := domain.HandoffEscalationReason(params.Reason)
	conv.EscalationReason = &reason
	now := time.Now()
	conv.EscalatedAt = &now
	return nil
}

func (s *fakeConversationStore) ResumeHandoffConversation(ctx context.Context, params store.ResumeHandoffConversationParams) error {
	conv, ok := s.conversations[params.ConversationID]
	if !ok {
		return store.ErrNotFound
	}
	if conv.Status != domain.HandoffConversationStatusEscalated {
		return store.ErrConflict
	}
	if params.RaiseTurnCapBy != nil {
		conv.TurnCap += *params.RaiseTurnCapBy
	}
	conv.Status = domain.HandoffConversationStatusActive
	conv.UpdatedAt = time.Now()
	return nil
}

func (s *fakeConversationStore) CloseHandoffConversationByHuman(ctx context.Context, id string) error {
	conv, ok := s.conversations[id]
	if !ok {
		return store.ErrNotFound
	}
	conv.Status = domain.HandoffConversationStatusClosedByHuman
	now := time.Now()
	conv.ClosedAt = &now
	return nil
}

func (s *fakeConversationStore) DraftHandoffResolution(ctx context.Context, params store.DraftHandoffResolutionParams) error {
	conv, ok := s.conversations[params.ConversationID]
	if !ok {
		return store.ErrNotFound
	}
	if params.Action != nil {
		v := domain.HandoffVerdict(*params.Action)
		conv.DraftedAction = &v
	}
	note := params.ResolutionNote
	conv.DraftedResolutionNote = &note
	now := time.Now()
	conv.DraftedAt = &now
	return nil
}

func startedConversation(t *testing.T, s *fakeConversationStore, handoffID string) *domain.HandoffConversation {
	t.Helper()
	s.handoffs[handoffID] = &domain.Handoff{ID: handoffID, Status: string(domain.HandoffStatusPending)}
	svc := New(s)
	conv, err := svc.StartHandoffConversation(context.Background(), store.StartHandoffConversationParams{
		HandoffID:      handoffID,
		SourceRootPath: "/abs/source",
		TargetRootPath: "/abs/target",
	})
	if err != nil {
		t.Fatalf("StartHandoffConversation() unexpected error: %v", err)
	}
	return conv
}

func TestRecordHandoffTurn_MutualAgreementCloses(t *testing.T) {
	s := newFakeConversationStore()
	conv := startedConversation(t, s, "h1")
	svc := New(s)
	ctx := context.Background()

	if _, err := svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
		ConversationID: conv.ID, Speaker: "source", Content: "let's action it", Verdict: "action",
	}); err != nil {
		t.Fatalf("source turn: unexpected error: %v", err)
	}

	state, err := svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
		ConversationID: conv.ID, Speaker: "target", Content: "agreed", Verdict: "action",
	})
	if err != nil {
		t.Fatalf("target turn: unexpected error: %v", err)
	}

	if !state.AgreementReached {
		t.Fatal("AgreementReached = false, want true when both sides submit matching terminal verdicts")
	}
	if state.Conversation.Status != domain.HandoffConversationStatusClosedAgreed {
		t.Fatalf("Status = %s, want closed_agreed", state.Conversation.Status)
	}
}

func TestRecordHandoffTurn_TurnCapEscalates(t *testing.T) {
	s := newFakeConversationStore()
	conv := startedConversation(t, s, "h1")
	svc := New(s)
	ctx := context.Background()

	var state *domain.HandoffConversationState
	var err error
	speaker := "source"
	for i := 0; i < domain.DefaultHandoffTurnCap; i++ {
		state, err = svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
			ConversationID: conv.ID, Speaker: speaker, Content: "more_info please", Verdict: "more_info",
		})
		if err != nil {
			t.Fatalf("turn %d: unexpected error: %v", i, err)
		}
		if speaker == "source" {
			speaker = "target"
		} else {
			speaker = "source"
		}
	}

	if !state.CapReached {
		t.Fatal("CapReached = false, want true after 15 subagent turns without agreement")
	}
	if state.Conversation.Status != domain.HandoffConversationStatusEscalated {
		t.Fatalf("Status = %s, want escalated", state.Conversation.Status)
	}
	if state.Conversation.EscalationReason == nil || *state.Conversation.EscalationReason != domain.HandoffEscalationReasonTurnCap {
		t.Fatalf("EscalationReason = %v, want turn_cap", state.Conversation.EscalationReason)
	}
}

func TestRecordHandoffTurn_ArbiterExcludedFromCapAndAgreement(t *testing.T) {
	s := newFakeConversationStore()
	conv := startedConversation(t, s, "h1")
	svc := New(s)
	ctx := context.Background()

	// Interleave arbiter turns between every source/target pair; they must
	// never count toward the 15-turn subagent cap or trigger agreement.
	speaker := "source"
	for i := 0; i < domain.DefaultHandoffTurnCap-1; i++ {
		if _, err := svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
			ConversationID: conv.ID, Speaker: speaker, Content: "status update", Verdict: "more_info",
		}); err != nil {
			t.Fatalf("turn %d: unexpected error: %v", i, err)
		}
		if _, err := svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
			ConversationID: conv.ID, Speaker: "arbiter", Content: "noted", Verdict: "",
		}); err != nil {
			t.Fatalf("arbiter turn %d: unexpected error: %v", i, err)
		}
		if speaker == "source" {
			speaker = "target"
		} else {
			speaker = "source"
		}
	}

	conv2, err := svc.GetHandoffConversation(ctx, conv.ID)
	if err != nil {
		t.Fatalf("GetHandoffConversation() unexpected error: %v", err)
	}
	if conv2.Status != domain.HandoffConversationStatusActive {
		t.Fatalf("Status = %s, want active — 14 subagent turns plus 14 arbiter turns must not reach the 15 subagent cap", conv2.Status)
	}
}

func TestRecordHandoffTurn_RejectsNonActiveConversation(t *testing.T) {
	s := newFakeConversationStore()
	conv := startedConversation(t, s, "h1")
	svc := New(s)
	ctx := context.Background()

	if err := svc.EscalateHandoffConversation(ctx, conv.ID, domain.HandoffEscalationReasonTieBreak); err != nil {
		t.Fatalf("EscalateHandoffConversation() unexpected error: %v", err)
	}

	_, err := svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
		ConversationID: conv.ID, Speaker: "source", Content: "still here", Verdict: "action",
	})
	if err != store.ErrConflict {
		t.Fatalf("RecordHandoffTurn() on an escalated conversation error = %v, want store.ErrConflict", err)
	}
	if len(s.turnsByConv[conv.ID]) != 0 {
		t.Fatal("RecordHandoffTurn() must not insert a turn when the conversation isn't active")
	}
}

func TestRecordHandoffTurn_RejectsBackToBackSameSpeaker(t *testing.T) {
	s := newFakeConversationStore()
	conv := startedConversation(t, s, "h1")
	svc := New(s)
	ctx := context.Background()

	if _, err := svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
		ConversationID: conv.ID, Speaker: "source", Content: "first", Verdict: "more_info",
	}); err != nil {
		t.Fatalf("first source turn: unexpected error: %v", err)
	}

	_, err := svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
		ConversationID: conv.ID, Speaker: "source", Content: "second in a row", Verdict: "more_info",
	})
	if err == nil {
		t.Fatal("RecordHandoffTurn() expected an error for back-to-back same-speaker turns, got nil")
	}
	if len(s.turnsByConv[conv.ID]) != 1 {
		t.Fatalf("len(turns) = %d, want 1 — the rejected back-to-back turn must not reach the store", len(s.turnsByConv[conv.ID]))
	}

	// An arbiter turn in between clears the restriction.
	if _, err := svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
		ConversationID: conv.ID, Speaker: "arbiter", Content: "noted", Verdict: "",
	}); err != nil {
		t.Fatalf("arbiter turn: unexpected error: %v", err)
	}
	if _, err := svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
		ConversationID: conv.ID, Speaker: "target", Content: "target's turn", Verdict: "more_info",
	}); err != nil {
		t.Fatalf("target turn after arbiter: unexpected error: %v", err)
	}
}

func TestStartHandoffConversation_RejectsSecondConversationForSameHandoff(t *testing.T) {
	s := newFakeConversationStore()
	svc := New(s)
	ctx := context.Background()
	s.handoffs["h1"] = &domain.Handoff{ID: "h1", Status: string(domain.HandoffStatusPending)}

	if _, err := svc.StartHandoffConversation(ctx, store.StartHandoffConversationParams{
		HandoffID: "h1", SourceRootPath: "/abs/a", TargetRootPath: "/abs/b",
	}); err != nil {
		t.Fatalf("first StartHandoffConversation() unexpected error: %v", err)
	}

	_, err := svc.StartHandoffConversation(ctx, store.StartHandoffConversationParams{
		HandoffID: "h1", SourceRootPath: "/abs/a", TargetRootPath: "/abs/b",
	})
	if err != store.ErrConflict {
		t.Fatalf("second StartHandoffConversation() error = %v, want store.ErrConflict", err)
	}
}

func TestStartHandoffConversation_RejectsAlreadyClosedHandoff(t *testing.T) {
	s := newFakeConversationStore()
	svc := New(s)
	ctx := context.Background()
	s.handoffs["h1"] = &domain.Handoff{ID: "h1", Status: string(domain.HandoffStatusActioned)}

	_, err := svc.StartHandoffConversation(ctx, store.StartHandoffConversationParams{
		HandoffID: "h1", SourceRootPath: "/abs/a", TargetRootPath: "/abs/b",
	})
	if err != store.ErrConflict {
		t.Fatalf("StartHandoffConversation() on an actioned handoff error = %v, want store.ErrConflict", err)
	}
}

func TestResumeHandoffConversation_RaiseTurnCapByBounds(t *testing.T) {
	tests := []struct {
		name    string
		raiseBy *int
		wantErr bool
	}{
		{name: "nil is allowed (no raise)", raiseBy: nil, wantErr: false},
		{name: "1 is the minimum allowed", raiseBy: intPtr(1), wantErr: false},
		{name: "10 is the maximum allowed", raiseBy: intPtr(10), wantErr: false},
		{name: "0 is rejected", raiseBy: intPtr(0), wantErr: true},
		{name: "11 is rejected", raiseBy: intPtr(11), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := newFakeConversationStore()
			conv := startedConversation(t, s, "h1")
			svc := New(s)
			ctx := context.Background()

			if err := svc.EscalateHandoffConversation(ctx, conv.ID, domain.HandoffEscalationReasonTurnCap); err != nil {
				t.Fatalf("EscalateHandoffConversation() unexpected error: %v", err)
			}

			err := svc.ResumeHandoffConversation(ctx, conv.ID, tt.raiseBy)
			if tt.wantErr && err == nil {
				t.Fatal("ResumeHandoffConversation() expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("ResumeHandoffConversation() unexpected error: %v", err)
			}
		})
	}
}

func TestDraftHandoffResolution_NeverTouchesHandoffStatus(t *testing.T) {
	s := newFakeConversationStore()
	conv := startedConversation(t, s, "h1")
	svc := New(s)
	ctx := context.Background()

	action := domain.HandoffVerdictAction
	if err := svc.DraftHandoffResolution(ctx, conv.ID, &action, "propose closing as actioned"); err != nil {
		t.Fatalf("DraftHandoffResolution() unexpected error: %v", err)
	}

	h := s.handoffs["h1"]
	if h.Status != string(domain.HandoffStatusPending) {
		t.Fatalf("Handoff.Status = %s, want unchanged pending — draft_handoff_resolution must never write to the Handoff", h.Status)
	}
	if h.ResolutionNote != nil {
		t.Fatal("Handoff.ResolutionNote must remain nil after DraftHandoffResolution")
	}

	updated := s.conversations[conv.ID]
	if updated.DraftedAction == nil || *updated.DraftedAction != domain.HandoffVerdictAction {
		t.Fatalf("DraftedAction = %v, want action", updated.DraftedAction)
	}
	if updated.DraftedResolutionNote == nil || *updated.DraftedResolutionNote != "propose closing as actioned" {
		t.Fatalf("DraftedResolutionNote = %v, want %q", updated.DraftedResolutionNote, "propose closing as actioned")
	}
}

func intPtr(i int) *int { return &i }
