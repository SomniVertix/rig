package mcpserver

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

// --- Output types (wire shapes for Handoff and HandoffAttachment) ---

// handoffOut is the wire shape of a Handoff (domain.Handoff). Body and
// Attachments are populated only by get_handoff's detail path — list_handoffs
// rows leave them nil to avoid an N+1 attachment fetch on every list call.
type handoffOut struct {
	ID                string                 `json:"id"`
	SourceWorkspaceID string                 `json:"sourceWorkspaceId"`
	TargetWorkspaceID string                 `json:"targetWorkspaceId"`
	Title             string                 `json:"title"`
	Type              string                 `json:"type"`
	Status            string                 `json:"status"`
	SentBy            string                 `json:"sentBy"`
	SentAt            time.Time              `json:"sentAt"`
	ReadAt            *time.Time             `json:"readAt,omitempty"`
	ResolutionNote    *string                `json:"resolutionNote,omitempty"`
	ResolvedAt        *time.Time             `json:"resolvedAt,omitempty"`
	ResolvedBy        *string                `json:"resolvedBy,omitempty"`
	CreatedAt         time.Time              `json:"createdAt"`
	UpdatedAt         time.Time              `json:"updatedAt"`
	Origin            *handoffOriginOut      `json:"origin,omitempty"`
	HasConversation   bool                   `json:"hasConversation"`
	Body              *string                `json:"body,omitempty"`
	Attachments       []handoffAttachmentOut `json:"attachments,omitempty"`
}

// handoffOriginOut is the optional back-link a Handoff may carry to what it
// arose from. All four fields are independently optional (decision: origin
// back-link is always optional, never required).
type handoffOriginOut struct {
	ExpeditionID *string `json:"expeditionId,omitempty"`
	WaypointID   *string `json:"waypointId,omitempty"`
	CommitSha    *string `json:"commitSha,omitempty"`
	SessionID    *string `json:"sessionId,omitempty"`
}

// newHandoffOrigin builds handoffOriginOut from a Handoff's origin back-link
// fields, or nil when none were supplied at send time.
func newHandoffOrigin(h domain.Handoff) *handoffOriginOut {
	if h.OriginExpeditionID == nil && h.OriginWaypointID == nil && h.OriginCommitSHA == nil && h.OriginSessionID == nil {
		return nil
	}
	return &handoffOriginOut{
		ExpeditionID: h.OriginExpeditionID,
		WaypointID:   h.OriginWaypointID,
		CommitSha:    h.OriginCommitSHA,
		SessionID:    h.OriginSessionID,
	}
}

// newHandoffOut builds the list-row shape of a handoff: every field except
// Body/Attachments, which stay nil. HasConversation defaults false; callers
// that need it accurate (list_handoffs, get_handoff) set it via
// withHasConversation after checking for a conversation.
func newHandoffOut(h domain.Handoff) handoffOut {
	return handoffOut{
		ID:                h.ID,
		SourceWorkspaceID: h.SourceWorkspaceID,
		TargetWorkspaceID: h.TargetWorkspaceID,
		Title:             h.Title,
		Type:              h.Type,
		Status:            h.Status,
		SentBy:            h.SentBy,
		SentAt:            h.SentAt,
		ReadAt:            h.ReadAt,
		ResolutionNote:    h.ResolutionNote,
		ResolvedAt:        h.ResolvedAt,
		ResolvedBy:        h.ResolvedBy,
		CreatedAt:         h.CreatedAt,
		UpdatedAt:         h.UpdatedAt,
		Origin:            newHandoffOrigin(h),
	}
}

// handoffHasConversation reports whether a Handoff has a started
// HandoffConversation. store.ErrNotFound means no — every other error
// propagates.
func handoffHasConversation(ctx context.Context, svc *service.Service, handoffID string) (bool, error) {
	_, err := svc.GetHandoffConversationByHandoff(ctx, handoffID)
	if err == nil {
		return true, nil
	}
	if err == store.ErrNotFound {
		return false, nil
	}
	return false, err
}

func newHandoffOuts(hs []domain.Handoff) []handoffOut {
	outs := make([]handoffOut, len(hs))
	for i, h := range hs {
		outs[i] = newHandoffOut(h)
	}
	return outs
}

// newHandoffOutDetailed extends newHandoffOut with Body and Attachments,
// for get_handoff's detail view only.
func newHandoffOutDetailed(h domain.Handoff, attachments []domain.HandoffAttachment) handoffOut {
	out := newHandoffOut(h)
	body := h.BodyMarkdown
	out.Body = &body
	out.Attachments = newHandoffAttachmentOuts(attachments)
	return out
}

// handoffAttachmentOut is the wire shape of a HandoffAttachment
// (domain.HandoffAttachment).
type handoffAttachmentOut struct {
	ID        string `json:"id"`
	Ordinal   int    `json:"ordinal"`
	RepoPath  string `json:"repoPath"`
	CommitSHA string `json:"commitSha"`
	Note      string `json:"note"`
}

func newHandoffAttachmentOut(a domain.HandoffAttachment) handoffAttachmentOut {
	return handoffAttachmentOut{
		ID:        a.ID,
		Ordinal:   a.Ordinal,
		RepoPath:  a.RepoPath,
		CommitSHA: a.CommitSHA,
		Note:      a.Note,
	}
}

func newHandoffAttachmentOuts(as []domain.HandoffAttachment) []handoffAttachmentOut {
	outs := make([]handoffAttachmentOut, len(as))
	for i, a := range as {
		outs[i] = newHandoffAttachmentOut(a)
	}
	return outs
}

// --- Output types for tool responses ---

type listHandoffsOut struct {
	Handoffs []handoffOut `json:"handoffs" jsonschema:"array of handoff index rows"`
}

type getHandoffOut struct {
	Handoff            handoffOut `json:"handoff"`
	TransitionedToRead bool       `json:"transitionedToRead" jsonschema:"true if this call performed the pending-to-read transition"`
}

// --- Input types (wire shapes for tool requests) ---

type sendHandoffIn struct {
	SourceWorkspaceID string                    `json:"sourceWorkspaceId"`
	TargetWorkspaceID string                    `json:"targetWorkspaceId"`
	Title             string                    `json:"title"`
	BodyMarkdown      string                    `json:"bodyMarkdown"`
	Type              string                    `json:"type"`
	SentBy            string                    `json:"sentBy"`
	Attachments       []handoffAttachmentInput  `json:"attachments,omitempty"`
	OriginExpeditionID *string                  `json:"originExpeditionId,omitempty"`
	OriginWaypointID  *string                   `json:"originWaypointId,omitempty"`
	OriginCommitSHA   *string                   `json:"originCommitSha,omitempty"`
	OriginSessionID   *string                   `json:"originSessionId,omitempty"`
}

type handoffAttachmentInput struct {
	RepoPath  string `json:"repoPath"`
	CommitSHA string `json:"commitSha"`
	Note      string `json:"note"`
}

type addHandoffAttachmentIn struct {
	HandoffID string `json:"handoffId"`
	RepoPath  string `json:"repoPath"`
	CommitSHA string `json:"commitSha"`
	Note      string `json:"note"`
}

type listHandoffsIn struct {
	WorkspaceID string  `json:"workspaceId"`
	Direction   string  `json:"direction"`
	Status      *string `json:"status,omitempty"`
}

type getHandoffIn struct {
	ID string `json:"id"`
}

type closeHandoffIn struct {
	ID             string `json:"id"`
	Terminal       string `json:"terminal"`
	ResolutionNote string `json:"resolutionNote"`
	ResolvedBy     string `json:"resolvedBy"`
}

// --- Handler stubs (full implementation is in handoff-mcp-tools component) ---

// registerHandoffTools registers the six Handoff MCP tools as stubs.
// Full implementation of tool handlers (send_handoff, add_handoff_attachment,
// list_handoffs, get_handoff, action_handoff, dismiss_handoff) is part of
// the handoff-mcp-tools implementation component and will be wired in there.
func registerHandoffTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "send_handoff",
		Description: "Send a Handoff from one workspace to another, optionally carrying code attachments and an origin back-link.",
	}, sendHandoff(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "add_handoff_attachment",
		Description: "Append supporting evidence (code reference) to an existing Handoff (pending only).",
	}, addHandoffAttachment(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "list_handoffs",
		Description: "List Handoffs by direction (inbound/outbound/both), optionally filtered by status.",
	}, listHandoffs(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_handoff",
		Description: "Get one Handoff's full detail (body, attachments). Transitions the Handoff from pending to read as a side effect if this is the first call to fetch it.",
	}, getHandoff(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "action_handoff",
		Description: "Transition a Handoff to the 'actioned' terminal state, recording a resolution note.",
	}, actionHandoff(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "dismiss_handoff",
		Description: "Transition a Handoff to the 'dismissed' terminal state, recording a resolution note.",
	}, dismissHandoff(svc))
}

// --- Handler implementations ---

// sendHandoff implements send_handoff: create a new Handoff with optional attachments.
func sendHandoff(svc *service.Service) func(context.Context, *mcp.CallToolRequest, sendHandoffIn) (*mcp.CallToolResult, handoffOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in sendHandoffIn) (*mcp.CallToolResult, handoffOut, error) {
		// Convert input to store params
		params := store.SendHandoffParams{
			SourceWorkspaceID:  in.SourceWorkspaceID,
			TargetWorkspaceID:  in.TargetWorkspaceID,
			Title:              in.Title,
			BodyMarkdown:       in.BodyMarkdown,
			Type:               in.Type,
			SentBy:             in.SentBy,
			OriginExpeditionID: in.OriginExpeditionID,
			OriginWaypointID:   in.OriginWaypointID,
			OriginCommitSHA:    in.OriginCommitSHA,
			OriginSessionID:    in.OriginSessionID,
		}

		// Convert inline attachments
		for _, att := range in.Attachments {
			params.Attachments = append(params.Attachments, store.HandoffAttachmentInput{
				RepoPath:  att.RepoPath,
				CommitSHA: att.CommitSHA,
				Note:      att.Note,
			})
		}

		// Call service with validation
		handoff, err := svc.SendHandoff(ctx, params)
		if err != nil {
			// Map specific validation errors to design messages
			if strings.Contains(err.Error(), "sourceWorkspaceId and targetWorkspaceId to differ") {
				return toolError("a Handoff must target a different workspace than its source"), handoffOut{}, nil
			}
			if errors.Is(err, service.ErrInvalidSlug) {
				return toolError(fmt.Sprintf("unknown targetWorkspaceId %s — call list_workspaces to see what exists", in.TargetWorkspaceID)), handoffOut{}, nil
			}
			return nil, handoffOut{}, err
		}

		return nil, newHandoffOut(*handoff), nil
	}
}

// addHandoffAttachment implements add_handoff_attachment: append evidence to a pending Handoff.
func addHandoffAttachment(svc *service.Service) func(context.Context, *mcp.CallToolRequest, addHandoffAttachmentIn) (*mcp.CallToolResult, handoffAttachmentOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in addHandoffAttachmentIn) (*mcp.CallToolResult, handoffAttachmentOut, error) {
		params := store.AddHandoffAttachmentParams{
			HandoffID: in.HandoffID,
			RepoPath:  in.RepoPath,
			CommitSHA: in.CommitSHA,
			Note:      in.Note,
		}

		attachment, err := svc.AddHandoffAttachment(ctx, params)
		if err != nil {
			// Map store.ErrConflict to immutability message
			if err == store.ErrConflict {
				return toolError(fmt.Sprintf("handoff %s is already read; a sent Handoff's attachments are immutable once the target has retrieved it", in.HandoffID)), handoffAttachmentOut{}, nil
			}
			return nil, handoffAttachmentOut{}, err
		}

		return nil, newHandoffAttachmentOut(*attachment), nil
	}
}

// listHandoffs implements list_handoffs: enumerate Handoffs by direction and status.
func listHandoffs(svc *service.Service) func(context.Context, *mcp.CallToolRequest, listHandoffsIn) (*mcp.CallToolResult, listHandoffsOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in listHandoffsIn) (*mcp.CallToolResult, listHandoffsOut, error) {
		// Validate direction enum
		if in.Direction != "inbound" && in.Direction != "outbound" && in.Direction != "both" {
			return toolError(fmt.Sprintf("direction must be inbound | outbound | both, got %q", in.Direction)), listHandoffsOut{}, nil
		}

		params := store.ListHandoffsParams{
			WorkspaceID: in.WorkspaceID,
			Direction:   in.Direction,
			Status:      in.Status,
		}

		handoffs, err := svc.ListHandoffs(ctx, params)
		if err != nil {
			return nil, listHandoffsOut{}, err
		}

		// Return index rows (no body/attachments), with HasConversation set per row.
		outs := newHandoffOuts(handoffs)
		for i, h := range handoffs {
			hasConv, err := handoffHasConversation(ctx, svc, h.ID)
			if err != nil {
				return nil, listHandoffsOut{}, err
			}
			outs[i].HasConversation = hasConv
		}
		return nil, listHandoffsOut{Handoffs: outs}, nil
	}
}

// getHandoff implements get_handoff: fetch a Handoff's full detail.
func getHandoff(svc *service.Service) func(context.Context, *mcp.CallToolRequest, getHandoffIn) (*mcp.CallToolResult, getHandoffOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in getHandoffIn) (*mcp.CallToolResult, getHandoffOut, error) {
		// Call service, which handles the pending->read transition
		result, err := svc.GetHandoff(ctx, in.ID)
		if err != nil {
			return nil, getHandoffOut{}, err
		}

		// Fetch attachments for the detailed view
		attachments, err := svc.ListHandoffAttachments(ctx, in.ID)
		if err != nil && err != store.ErrNotFound {
			return nil, getHandoffOut{}, err
		}
		if attachments == nil {
			attachments = []domain.HandoffAttachment{}
		}

		hasConv, err := handoffHasConversation(ctx, svc, in.ID)
		if err != nil {
			return nil, getHandoffOut{}, err
		}

		// Build detailed output with Body/Attachments
		handoffDTO := newHandoffOutDetailed(*result.Handoff, attachments)
		handoffDTO.HasConversation = hasConv
		out := getHandoffOut{
			Handoff:            handoffDTO,
			TransitionedToRead: result.TransitionedToRead,
		}

		return nil, out, nil
	}
}

// actionHandoff implements action_handoff: close a Handoff as actioned.
func actionHandoff(svc *service.Service) func(context.Context, *mcp.CallToolRequest, closeHandoffIn) (*mcp.CallToolResult, handoffOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in closeHandoffIn) (*mcp.CallToolResult, handoffOut, error) {
		// Validate non-empty resolution note
		if strings.TrimSpace(in.ResolutionNote) == "" {
			return toolError("action_handoff requires a non-empty resolutionNote"), handoffOut{}, nil
		}

		params := store.CloseHandoffParams{
			ID:             in.ID,
			Terminal:       "actioned",
			ResolutionNote: in.ResolutionNote,
			ResolvedBy:     in.ResolvedBy,
		}

		err := svc.CloseHandoff(ctx, params)
		if err != nil {
			if err == store.ErrConflict {
				return toolError(fmt.Sprintf("handoff %s is already actioned; no further transition is allowed", in.ID)), handoffOut{}, nil
			}
			return nil, handoffOut{}, err
		}

		// Fetch updated handoff to return
		result, err := svc.GetHandoff(ctx, in.ID)
		if err != nil {
			return nil, handoffOut{}, err
		}

		hasConv, err := handoffHasConversation(ctx, svc, in.ID)
		if err != nil {
			return nil, handoffOut{}, err
		}
		out := newHandoffOut(*result.Handoff)
		out.HasConversation = hasConv
		return nil, out, nil
	}
}

// dismissHandoff implements dismiss_handoff: close a Handoff as dismissed.
func dismissHandoff(svc *service.Service) func(context.Context, *mcp.CallToolRequest, closeHandoffIn) (*mcp.CallToolResult, handoffOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in closeHandoffIn) (*mcp.CallToolResult, handoffOut, error) {
		// Validate non-empty resolution note
		if strings.TrimSpace(in.ResolutionNote) == "" {
			return toolError("dismiss_handoff requires a non-empty resolutionNote"), handoffOut{}, nil
		}

		params := store.CloseHandoffParams{
			ID:             in.ID,
			Terminal:       "dismissed",
			ResolutionNote: in.ResolutionNote,
			ResolvedBy:     in.ResolvedBy,
		}

		err := svc.CloseHandoff(ctx, params)
		if err != nil {
			if err == store.ErrConflict {
				return toolError(fmt.Sprintf("handoff %s is already dismissed; no further transition is allowed", in.ID)), handoffOut{}, nil
			}
			return nil, handoffOut{}, err
		}

		// Fetch updated handoff to return
		result, err := svc.GetHandoff(ctx, in.ID)
		if err != nil {
			return nil, handoffOut{}, err
		}

		hasConv, err := handoffHasConversation(ctx, svc, in.ID)
		if err != nil {
			return nil, handoffOut{}, err
		}
		out := newHandoffOut(*result.Handoff)
		out.HasConversation = hasConv
		return nil, out, nil
	}
}
