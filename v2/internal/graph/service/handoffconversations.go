package service

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// StartHandoffConversation validates and delegates to the store.
func (svc *Service) StartHandoffConversation(ctx context.Context, params store.StartHandoffConversationParams) (*domain.HandoffConversation, error) {
	// Validate that root paths are absolute
	if !filepath.IsAbs(params.SourceRootPath) {
		return nil, fmt.Errorf("sourceRootPath must be absolute: %s", params.SourceRootPath)
	}
	if !filepath.IsAbs(params.TargetRootPath) {
		return nil, fmt.Errorf("targetRootPath must be absolute: %s", params.TargetRootPath)
	}

	return svc.store.StartHandoffConversation(ctx, params)
}

// RecordHandoffTurn validates and delegates to the store.
func (svc *Service) RecordHandoffTurn(ctx context.Context, params store.RecordHandoffTurnParams) (*domain.HandoffConversationState, error) {
	// Reject blank content
	if strings.TrimSpace(params.Content) == "" {
		return nil, fmt.Errorf("content must not be blank")
	}

	// Reject unknown speaker
	switch params.Speaker {
	case string(domain.HandoffTurnSpeakerSource), string(domain.HandoffTurnSpeakerTarget), string(domain.HandoffTurnSpeakerArbiter):
		// valid
	default:
		return nil, fmt.Errorf("unknown speaker: %s", params.Speaker)
	}

	// Reject unknown verdict (if provided)
	if params.Verdict != "" {
		switch params.Verdict {
		case string(domain.HandoffVerdictAction), string(domain.HandoffVerdictDismiss), string(domain.HandoffVerdictMoreInfo), string(domain.HandoffVerdictBlocked):
			// valid
		default:
			return nil, fmt.Errorf("unknown verdict: %s", params.Verdict)
		}
	}

	// TODO: Reject back-to-back same-side turns
	// (This would require fetching the latest turn from the conversation, which should be
	// validated in the store layer or as a separate check)

	result, err := svc.store.RecordHandoffTurn(ctx, params)
	if err != nil {
		return nil, err
	}

	// Populate SuggestedResolution if conversation is closed_agreed
	if result != nil && result.Conversation != nil && result.Conversation.Status == domain.HandoffConversationStatusClosedAgreed {
		if result.LatestTurn != nil && result.LatestTurn.Verdict != nil {
			result.SuggestedResolution = strPtr(fmt.Sprintf("Both sides agree: %s", *result.LatestTurn.Verdict))
		}
	}

	return result, nil
}

// ResumeHandoffConversation validates and delegates to the store.
func (svc *Service) ResumeHandoffConversation(ctx context.Context, conversationID string, raiseTurnCapBy *int) error {
	// Validate RaiseTurnCapBy bounds
	if raiseTurnCapBy != nil {
		if *raiseTurnCapBy < 1 || *raiseTurnCapBy > 10 {
			return fmt.Errorf("raiseTurnCapBy must be between 1 and 10, got %d", *raiseTurnCapBy)
		}
	}

	return svc.store.ResumeHandoffConversation(ctx, store.ResumeHandoffConversationParams{
		ConversationID:   conversationID,
		RaiseTurnCapBy:   raiseTurnCapBy,
	})
}

// EscalateHandoffConversation delegates to the store.
func (svc *Service) EscalateHandoffConversation(ctx context.Context, conversationID string, reason domain.HandoffEscalationReason) error {
	return svc.store.EscalateHandoffConversation(ctx, store.EscalateHandoffConversationParams{
		ConversationID: conversationID,
		Reason:         string(reason),
	})
}

// CloseHandoffConversationByHuman delegates to the store without touching Handoff.
func (svc *Service) CloseHandoffConversationByHuman(ctx context.Context, conversationID string) error {
	return svc.store.CloseHandoffConversationByHuman(ctx, conversationID)
}

// DraftHandoffResolution delegates to the store without touching Handoff.
func (svc *Service) DraftHandoffResolution(ctx context.Context, conversationID string, action *domain.HandoffVerdict, note string) error {
	var actionStr *string
	if action != nil {
		s := string(*action)
		actionStr = &s
	}
	return svc.store.DraftHandoffResolution(ctx, store.DraftHandoffResolutionParams{
		ConversationID:   conversationID,
		Action:           actionStr,
		ResolutionNote:   note,
	})
}



// Helper
func strPtr(s string) *string {
	return &s
}
