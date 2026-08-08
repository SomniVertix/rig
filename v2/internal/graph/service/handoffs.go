package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// validHandoffTypes are the only values SendHandoff accepts for
// SendHandoffParams.Type. Mirrors domain.HandoffType's constants.
var validHandoffTypes = map[string]bool{
	string(domain.HandoffTypeBug):              true,
	string(domain.HandoffTypeQuestion):         true,
	string(domain.HandoffTypeFYI):              true,
	string(domain.HandoffTypeDependencyChange): true,
}

// SendHandoff validates and creates a Handoff from one workspace to another.
func (svc *Service) SendHandoff(ctx context.Context, params store.SendHandoffParams) (*domain.Handoff, error) {
	if strings.TrimSpace(params.Title) == "" {
		return nil, fmt.Errorf("service: send_handoff requires a non-empty title")
	}
	if strings.TrimSpace(params.BodyMarkdown) == "" {
		return nil, fmt.Errorf("service: send_handoff requires a non-empty bodyMarkdown")
	}
	if !validHandoffTypes[params.Type] {
		return nil, fmt.Errorf("service: send_handoff requires type to be one of bug/question/fyi/dependency-change, got %q", params.Type)
	}
	if params.SourceWorkspaceID == params.TargetWorkspaceID {
		return nil, fmt.Errorf("service: send_handoff requires sourceWorkspaceId and targetWorkspaceId to differ")
	}
	if !slugPattern.MatchString(params.SourceWorkspaceID) {
		return nil, ErrInvalidSlug
	}
	if !slugPattern.MatchString(params.TargetWorkspaceID) {
		return nil, ErrInvalidSlug
	}
	for _, attachment := range params.Attachments {
		if strings.TrimSpace(attachment.RepoPath) == "" {
			return nil, fmt.Errorf("service: handoff attachment requires a non-empty repoPath")
		}
		if strings.TrimSpace(attachment.CommitSHA) == "" {
			return nil, fmt.Errorf("service: handoff attachment requires a non-empty commitSha")
		}
	}
	return svc.store.SendHandoff(ctx, params)
}

// GetHandoffResult wraps the Handoff returned by GetHandoff along with a
// signal for whether this specific call performed the pending->read
// transition, so MCP tools can distinguish "already read" from "just marked
// read" without a second round trip.
type GetHandoffResult struct {
	Handoff            *domain.Handoff
	TransitionedToRead bool
}

// GetHandoff fetches a Handoff, transitioning it from pending to read as a
// side effect of being fetched. Used by MCP tools where the side effect is desired.
func (svc *Service) GetHandoff(ctx context.Context, id string) (*GetHandoffResult, error) {
	handoff, err := svc.store.GetHandoff(ctx, id)
	if err != nil {
		return nil, err
	}
	if handoff.Status != string(domain.HandoffStatusPending) {
		return &GetHandoffResult{Handoff: handoff}, nil
	}
	if err := svc.store.MarkHandoffRead(ctx, id); err != nil {
		return nil, err
	}
	handoff, err = svc.store.GetHandoff(ctx, id)
	if err != nil {
		return nil, err
	}
	return &GetHandoffResult{Handoff: handoff, TransitionedToRead: true}, nil
}

// GetHandoffWithoutReadTransition fetches a Handoff WITHOUT the side effect
// of marking it read. Used by the REST API where the console is read-only.
func (svc *Service) GetHandoffWithoutReadTransition(ctx context.Context, id string) (*domain.Handoff, error) {
	return svc.store.GetHandoff(ctx, id)
}

// CloseHandoff moves a Handoff to a terminal state, requiring a non-empty
// resolution note explaining why.
func (svc *Service) CloseHandoff(ctx context.Context, params store.CloseHandoffParams) error {
	if strings.TrimSpace(params.ResolutionNote) == "" {
		return fmt.Errorf("service: close_handoff requires a non-empty resolutionNote")
	}
	return svc.store.CloseHandoff(ctx, params)
}

// AddHandoffAttachment appends one piece of supporting evidence to an
// existing Handoff.
func (svc *Service) AddHandoffAttachment(ctx context.Context, params store.AddHandoffAttachmentParams) (*domain.HandoffAttachment, error) {
	if strings.TrimSpace(params.RepoPath) == "" {
		return nil, fmt.Errorf("service: add_handoff_attachment requires a non-empty repoPath")
	}
	if strings.TrimSpace(params.CommitSHA) == "" {
		return nil, fmt.Errorf("service: add_handoff_attachment requires a non-empty commitSha")
	}
	return svc.store.AddHandoffAttachment(ctx, params)
}

// ListHandoffs fetches all Handoffs for a workspace, optionally filtered by
// direction (inbound/outbound/both) and status.
func (svc *Service) ListHandoffs(ctx context.Context, params store.ListHandoffsParams) ([]domain.Handoff, error) {
	return svc.store.ListHandoffs(ctx, params)
}

// ListHandoffAttachments fetches all attachments for a Handoff, ordered by
// ordinal.
func (svc *Service) ListHandoffAttachments(ctx context.Context, handoffID string) ([]domain.HandoffAttachment, error) {
	return svc.store.ListHandoffAttachments(ctx, handoffID)
}

// --- Handoff Conversations ---

// GetHandoffConversationByHandoff fetches the conversation linked to a
// Handoff, if one has been started.
func (svc *Service) GetHandoffConversationByHandoff(ctx context.Context, handoffID string) (*domain.HandoffConversation, error) {
	return svc.store.GetHandoffConversationByHandoff(ctx, handoffID)
}

// ListHandoffTurns fetches all turns in a conversation, ordered by turn number.
func (svc *Service) ListHandoffTurns(ctx context.Context, conversationID string) ([]domain.HandoffTurn, error) {
	return svc.store.ListHandoffTurns(ctx, conversationID)
}
