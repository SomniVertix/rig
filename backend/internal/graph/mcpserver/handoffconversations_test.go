package mcpserver

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

// stubConversationStore is an in-memory store covering both Handoff and
// HandoffConversation methods, so the conversation tool handlers — which
// call through svc into both — can be exercised end-to-end without a live
// Neo4j instance.
type stubConversationStore struct {
	store.Store
	handoffs      map[string]*domain.Handoff
	conversations map[string]*domain.HandoffConversation
	turnsByConv   map[string][]domain.HandoffTurn
	convByHandoff map[string]string
	nextConvID    int
	nextTurnID    int
}

func newStubConversationStore() *stubConversationStore {
	return &stubConversationStore{
		handoffs:      make(map[string]*domain.Handoff),
		conversations: make(map[string]*domain.HandoffConversation),
		turnsByConv:   make(map[string][]domain.HandoffTurn),
		convByHandoff: make(map[string]string),
	}
}

func (s *stubConversationStore) GetHandoff(ctx context.Context, id string) (*domain.Handoff, error) {
	if h, ok := s.handoffs[id]; ok {
		return h, nil
	}
	return nil, store.ErrNotFound
}

func (s *stubConversationStore) StartHandoffConversation(ctx context.Context, params store.StartHandoffConversationParams) (*domain.HandoffConversation, error) {
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

func (s *stubConversationStore) GetHandoffConversation(ctx context.Context, id string) (*domain.HandoffConversation, error) {
	c, ok := s.conversations[id]
	if !ok {
		return nil, store.ErrNotFound
	}
	return c, nil
}

func (s *stubConversationStore) GetHandoffConversationByHandoff(ctx context.Context, handoffID string) (*domain.HandoffConversation, error) {
	id, ok := s.convByHandoff[handoffID]
	if !ok {
		return nil, store.ErrNotFound
	}
	return s.conversations[id], nil
}

func (s *stubConversationStore) ListHandoffTurns(ctx context.Context, conversationID string) ([]domain.HandoffTurn, error) {
	return append([]domain.HandoffTurn{}, s.turnsByConv[conversationID]...), nil
}

func (s *stubConversationStore) RecordHandoffTurn(ctx context.Context, params store.RecordHandoffTurnParams) (*domain.HandoffConversationState, error) {
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

func (s *stubConversationStore) EscalateHandoffConversation(ctx context.Context, params store.EscalateHandoffConversationParams) error {
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

func (s *stubConversationStore) ResumeHandoffConversation(ctx context.Context, params store.ResumeHandoffConversationParams) error {
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

func (s *stubConversationStore) CloseHandoffConversationByHuman(ctx context.Context, id string) error {
	conv, ok := s.conversations[id]
	if !ok {
		return store.ErrNotFound
	}
	conv.Status = domain.HandoffConversationStatusClosedByHuman
	now := time.Now()
	conv.ClosedAt = &now
	return nil
}

func (s *stubConversationStore) DraftHandoffResolution(ctx context.Context, params store.DraftHandoffResolutionParams) error {
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

func startedTestConversation(t *testing.T, s *stubConversationStore, svc *service.Service, handoffID string) conversationStateOut {
	t.Helper()
	s.handoffs[handoffID] = &domain.Handoff{ID: handoffID, Status: string(domain.HandoffStatusPending)}
	handler := startHandoffConversation(svc)
	result, out, err := handler(context.Background(), nil, startHandoffConversationIn{
		HandoffID: handoffID, SourceRootPath: "/abs/source", TargetRootPath: "/abs/target",
	})
	if err != nil {
		t.Fatalf("startHandoffConversation() unexpected error: %v", err)
	}
	if result != nil {
		t.Fatalf("startHandoffConversation() unexpected toolError result: %+v", result)
	}
	return out
}

func TestStartHandoffConversation_RejectsSecondForSameHandoff(t *testing.T) {
	s := newStubConversationStore()
	svc := service.New(s)
	conv := startedTestConversation(t, s, svc, "h1")
	if conv.Status != "active" {
		t.Fatalf("Status = %s, want active", conv.Status)
	}

	handler := startHandoffConversation(svc)
	result, _, err := handler(context.Background(), nil, startHandoffConversationIn{
		HandoffID: "h1", SourceRootPath: "/abs/source", TargetRootPath: "/abs/target",
	})
	if err != nil {
		t.Fatalf("startHandoffConversation() unexpected transport error: %v", err)
	}
	if result == nil || !result.IsError {
		t.Fatal("startHandoffConversation() expected a toolError result for a second conversation on the same handoff")
	}
}

func TestStartHandoffConversation_NextSpeakerDefaultsToSourceBeforeAnyTurn(t *testing.T) {
	s := newStubConversationStore()
	svc := service.New(s)
	conv := startedTestConversation(t, s, svc, "h1")

	if conv.NextSpeaker == nil || *conv.NextSpeaker != "source" {
		t.Fatalf("NextSpeaker = %v, want \"source\" for a freshly started, turn-less conversation", conv.NextSpeaker)
	}
}

func TestEscalateHandoffConversation_RecordsDetailAsArbiterTurn(t *testing.T) {
	s := newStubConversationStore()
	svc := service.New(s)
	conv := startedTestConversation(t, s, svc, "h1")

	detail := "target subagent produced no reply within 180s"
	handler := escalateHandoffConversation(svc)
	result, out, err := handler(context.Background(), nil, escalateHandoffConversationIn{
		ConversationID: conv.ConversationID, Reason: "stalled_subagent", Detail: &detail,
	})
	if err != nil {
		t.Fatalf("escalateHandoffConversation() unexpected error: %v", err)
	}
	if result != nil {
		t.Fatalf("escalateHandoffConversation() unexpected toolError result: %+v", result)
	}
	if out.Status != "escalated" {
		t.Fatalf("Status = %s, want escalated", out.Status)
	}

	turns := s.turnsByConv[conv.ConversationID]
	if len(turns) != 1 || turns[0].Speaker != domain.HandoffTurnSpeakerArbiter || turns[0].Content != detail {
		t.Fatalf("turns = %+v, want one arbiter turn carrying the escalation detail", turns)
	}
}

func TestRecordHandoffTurn_RegistersAgreementAndSuggestedResolution(t *testing.T) {
	s := newStubConversationStore()
	svc := service.New(s)
	conv := startedTestConversation(t, s, svc, "h1")
	handler := recordHandoffTurn(svc)
	ctx := context.Background()

	if _, _, err := handler(ctx, nil, recordHandoffTurnIn{
		ConversationID: conv.ConversationID, Speaker: "source", Content: "ready to close", Verdict: "dismiss",
	}); err != nil {
		t.Fatalf("source turn: unexpected error: %v", err)
	}

	result, out, err := handler(ctx, nil, recordHandoffTurnIn{
		ConversationID: conv.ConversationID, Speaker: "target", Content: "agreed", Verdict: "dismiss",
	})
	if err != nil {
		t.Fatalf("target turn: unexpected error: %v", err)
	}
	if result != nil {
		t.Fatalf("target turn: unexpected toolError result: %+v", result)
	}
	if !out.AgreementReached || out.Status != "closed_agreed" {
		t.Fatalf("out = %+v, want AgreementReached=true, status=closed_agreed", out)
	}
	if out.SuggestedResolution == nil || *out.SuggestedResolution != "Both sides agree: dismiss" {
		t.Fatalf("SuggestedResolution = %v, want %q", out.SuggestedResolution, "Both sides agree: dismiss")
	}
}

func TestRecordHandoffTurn_RejectsNonActiveConversation(t *testing.T) {
	s := newStubConversationStore()
	svc := service.New(s)
	conv := startedTestConversation(t, s, svc, "h1")

	if err := svc.EscalateHandoffConversation(context.Background(), conv.ConversationID, domain.HandoffEscalationReasonTieBreak); err != nil {
		t.Fatalf("EscalateHandoffConversation() unexpected error: %v", err)
	}

	handler := recordHandoffTurn(svc)
	result, _, err := handler(context.Background(), nil, recordHandoffTurnIn{
		ConversationID: conv.ConversationID, Speaker: "source", Content: "still here", Verdict: "action",
	})
	if err != nil {
		t.Fatalf("recordHandoffTurn() unexpected transport error: %v", err)
	}
	if result == nil || !result.IsError {
		t.Fatal("recordHandoffTurn() expected a toolError result for an escalated conversation")
	}
}

func TestGetHandoffConversation_AcceptsEitherHandoffOrConversationID(t *testing.T) {
	s := newStubConversationStore()
	svc := service.New(s)
	conv := startedTestConversation(t, s, svc, "h1")
	handler := getHandoffConversation(svc)
	ctx := context.Background()

	t.Run("by handoffId", func(t *testing.T) {
		handoffID := "h1"
		_, out, err := handler(ctx, nil, getHandoffConversationIn{HandoffID: &handoffID})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if out.Conversation.ConversationID != conv.ConversationID {
			t.Fatalf("ConversationID = %s, want %s", out.Conversation.ConversationID, conv.ConversationID)
		}
	})

	t.Run("by conversationId", func(t *testing.T) {
		convID := conv.ConversationID
		_, out, err := handler(ctx, nil, getHandoffConversationIn{ConversationID: &convID})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if out.Conversation.HandoffID != "h1" {
			t.Fatalf("HandoffID = %s, want h1", out.Conversation.HandoffID)
		}
	})

	t.Run("neither supplied", func(t *testing.T) {
		result, _, err := handler(ctx, nil, getHandoffConversationIn{})
		if err != nil {
			t.Fatalf("unexpected transport error: %v", err)
		}
		if result == nil || !result.IsError {
			t.Fatal("expected a toolError result when neither handoffId nor conversationId is supplied")
		}
	})
}

func TestEscalateThenResumeHandoffConversation_RecordsArbiterTurn(t *testing.T) {
	s := newStubConversationStore()
	svc := service.New(s)
	conv := startedTestConversation(t, s, svc, "h1")
	ctx := context.Background()

	escalate := escalateHandoffConversation(svc)
	result, out, err := escalate(ctx, nil, escalateHandoffConversationIn{
		ConversationID: conv.ConversationID, Reason: "tie_break",
	})
	if err != nil {
		t.Fatalf("escalateHandoffConversation() unexpected error: %v", err)
	}
	if result != nil {
		t.Fatalf("escalateHandoffConversation() unexpected toolError result: %+v", result)
	}
	if out.Status != "escalated" {
		t.Fatalf("Status = %s, want escalated", out.Status)
	}

	resume := resumeHandoffConversation(svc)
	result, out, err = resume(ctx, nil, resumeHandoffConversationIn{
		ConversationID: conv.ConversationID, HumanDirective: "go with dismiss", Verdict: "dismiss",
	})
	if err != nil {
		t.Fatalf("resumeHandoffConversation() unexpected error: %v", err)
	}
	if result != nil {
		t.Fatalf("resumeHandoffConversation() unexpected toolError result: %+v", result)
	}
	if out.Status != "active" {
		t.Fatalf("Status = %s, want active after resume", out.Status)
	}
	if out.SubagentTurnCount != 0 {
		t.Fatalf("SubagentTurnCount = %d, want 0 — the arbiter's ruling turn must not count toward it", out.SubagentTurnCount)
	}

	turns := s.turnsByConv[conv.ConversationID]
	if len(turns) != 1 || turns[0].Speaker != domain.HandoffTurnSpeakerArbiter || turns[0].Content != "go with dismiss" {
		t.Fatalf("turns = %+v, want one arbiter turn with the human's directive", turns)
	}
}

func TestCloseHandoffConversation_DoesNotTouchHandoff(t *testing.T) {
	s := newStubConversationStore()
	svc := service.New(s)
	conv := startedTestConversation(t, s, svc, "h1")
	ctx := context.Background()

	if err := svc.EscalateHandoffConversation(ctx, conv.ConversationID, domain.HandoffEscalationReasonStalledSubagent); err != nil {
		t.Fatalf("EscalateHandoffConversation() unexpected error: %v", err)
	}

	handler := closeHandoffConversation(svc)
	result, out, err := handler(ctx, nil, closeHandoffConversationIn{ConversationID: conv.ConversationID, Reason: "giving up"})
	if err != nil {
		t.Fatalf("closeHandoffConversation() unexpected error: %v", err)
	}
	if result != nil {
		t.Fatalf("closeHandoffConversation() unexpected toolError result: %+v", result)
	}
	if out.Status != "closed_by_human" {
		t.Fatalf("Status = %s, want closed_by_human", out.Status)
	}
	if s.handoffs["h1"].Status != string(domain.HandoffStatusPending) {
		t.Fatalf("Handoff.Status = %s, want unchanged pending", s.handoffs["h1"].Status)
	}
}

func TestDraftHandoffResolution_RejectsInvalidAction(t *testing.T) {
	s := newStubConversationStore()
	svc := service.New(s)
	conv := startedTestConversation(t, s, svc, "h1")

	handler := draftHandoffResolution(svc)
	result, _, err := handler(context.Background(), nil, draftHandoffResolutionIn{
		ConversationID: conv.ConversationID, Action: "maybe", ResolutionNote: "n",
	})
	if err != nil {
		t.Fatalf("draftHandoffResolution() unexpected transport error: %v", err)
	}
	if result == nil || !result.IsError {
		t.Fatal("draftHandoffResolution() expected a toolError result for an invalid action")
	}
	if s.handoffs["h1"].Status != string(domain.HandoffStatusPending) {
		t.Fatal("draftHandoffResolution() must never write to the Handoff")
	}
}
