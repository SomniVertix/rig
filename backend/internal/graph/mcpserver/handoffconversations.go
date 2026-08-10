package mcpserver

import (
	"context"
	"fmt"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/service"
	"github.com/somnivertix/rig/internal/graph/store"
)

// --- Output types ---

// handoffTurnOut is the wire shape of one HandoffTurn.
type handoffTurnOut struct {
	TurnNumber int    `json:"turnNumber"`
	Speaker    string `json:"speaker"`
	Content    string `json:"content"`
	Verdict    string `json:"verdict"`
	Timestamp  string `json:"timestamp"`
}

func newHandoffTurnOut(t domain.HandoffTurn) handoffTurnOut {
	verdict := ""
	if t.Verdict != nil {
		verdict = string(*t.Verdict)
	}
	return handoffTurnOut{
		TurnNumber: t.TurnNumber,
		Speaker:    string(t.Speaker),
		Content:    t.Content,
		Verdict:    verdict,
		Timestamp:  t.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// conversationStateOut is the derived, server-computed state of a
// conversation — returned by every tool that starts, advances, or reads one,
// so the caller never has to re-derive agreement/cap/escalation itself.
type conversationStateOut struct {
	ConversationID      string          `json:"conversationId"`
	HandoffID           string          `json:"handoffId"`
	Status              string          `json:"status"`
	SubagentTurnCount   int             `json:"subagentTurnCount"`
	TurnCap             int             `json:"turnCap"`
	AgreementReached    bool            `json:"agreementReached"`
	CapReached          bool            `json:"capReached"`
	EscalationReason    *string         `json:"escalationReason,omitempty"`
	NextSpeaker         *string         `json:"nextSpeaker,omitempty"`
	LatestTurn          *handoffTurnOut `json:"latestTurn,omitempty"`
	SuggestedResolution *string         `json:"suggestedResolution,omitempty"`
}

// newConversationStateOut derives conversationStateOut by reading a
// conversation's persisted status plus its ordered turns — the read path
// used by get_handoff_conversation and every mutation tool that doesn't
// already have a server-computed domain.HandoffConversationState on hand
// (start/escalate/resume/close/draft). It never decides agreement or cap
// itself: those are read off conv.Status, which service.RecordHandoffTurn is
// the only place that ever sets.
func newConversationStateOut(conv *domain.HandoffConversation, turns []domain.HandoffTurn) conversationStateOut {
	subagentTurnCount := 0
	for _, t := range turns {
		if t.Speaker == domain.HandoffTurnSpeakerSource || t.Speaker == domain.HandoffTurnSpeakerTarget {
			subagentTurnCount++
		}
	}

	agreementReached := conv.Status == domain.HandoffConversationStatusClosedAgreed
	capReached := subagentTurnCount >= conv.TurnCap

	var escalationReason *string
	if conv.EscalationReason != nil {
		s := string(*conv.EscalationReason)
		escalationReason = &s
	}

	out := conversationStateOut{
		ConversationID:    conv.ID,
		HandoffID:         conv.HandoffID,
		Status:            string(conv.Status),
		SubagentTurnCount: subagentTurnCount,
		TurnCap:           conv.TurnCap,
		AgreementReached:  agreementReached,
		CapReached:        capReached,
		EscalationReason:  escalationReason,
	}

	// NextSpeaker is meaningful whenever the conversation is active, even
	// before any turn exists — source speaks first, matching
	// neo4jstore.RecordHandoffTurn's own default.
	if conv.Status == domain.HandoffConversationStatusActive {
		ns := domain.HandoffTurnSpeakerSource
		if len(turns) > 0 {
			last := turns[len(turns)-1]
			if last.Speaker == domain.HandoffTurnSpeakerSource {
				ns = domain.HandoffTurnSpeakerTarget
			} else if last.Speaker == domain.HandoffTurnSpeakerTarget {
				ns = domain.HandoffTurnSpeakerSource
			}
		}
		s := string(ns)
		out.NextSpeaker = &s
	}

	if len(turns) > 0 {
		last := turns[len(turns)-1]
		lt := newHandoffTurnOut(last)
		out.LatestTurn = &lt

		if agreementReached && last.Verdict != nil {
			s := fmt.Sprintf("Both sides agree: %s", *last.Verdict)
			out.SuggestedResolution = &s
		}
	}

	return out
}

// newConversationStateOutFromState builds conversationStateOut directly from
// the domain.HandoffConversationState record_handoff_turn's store call
// already computed — no re-derivation, just a wire-shape conversion.
func newConversationStateOutFromState(state *domain.HandoffConversationState) conversationStateOut {
	conv := state.Conversation

	var escalationReason *string
	if conv.EscalationReason != nil {
		s := string(*conv.EscalationReason)
		escalationReason = &s
	}

	out := conversationStateOut{
		ConversationID:      conv.ID,
		HandoffID:           conv.HandoffID,
		Status:              string(conv.Status),
		SubagentTurnCount:   state.SubagentTurnCount,
		TurnCap:             conv.TurnCap,
		AgreementReached:    state.AgreementReached,
		CapReached:          state.CapReached,
		EscalationReason:    escalationReason,
		SuggestedResolution: state.SuggestedResolution,
	}

	if state.LatestTurn != nil {
		lt := newHandoffTurnOut(*state.LatestTurn)
		out.LatestTurn = &lt
	}

	if conv.Status == domain.HandoffConversationStatusActive && state.NextSpeaker != "" {
		s := string(state.NextSpeaker)
		out.NextSpeaker = &s
	}

	return out
}

type getHandoffConversationOut struct {
	Conversation conversationStateOut `json:"conversation"`
	Turns        []handoffTurnOut     `json:"turns"`
}

// --- Input types ---

type startHandoffConversationIn struct {
	HandoffID        string  `json:"handoffId"`
	SourceRootPath   string  `json:"sourceRootPath" jsonschema:"absolute local path the source subagent will be bound to, from list_workspaces"`
	TargetRootPath   string  `json:"targetRootPath" jsonschema:"absolute local path the target subagent will be bound to, from list_workspaces"`
	ArbiterSessionID *string `json:"arbiterSessionId,omitempty" jsonschema:"the human's own session id — the arbiter is never a separate spawned session"`
}

type recordHandoffTurnIn struct {
	ConversationID string `json:"conversationId"`
	Speaker        string `json:"speaker" jsonschema:"source | target | arbiter"`
	Content        string `json:"content" jsonschema:"what this speaker said this turn"`
	Verdict        string `json:"verdict" jsonschema:"action | dismiss | more_info | blocked"`
}

type getHandoffConversationIn struct {
	HandoffID      *string `json:"handoffId,omitempty" jsonschema:"look up by handoff; supply this or conversationId"`
	ConversationID *string `json:"conversationId,omitempty"`
}

type escalateHandoffConversationIn struct {
	ConversationID string  `json:"conversationId"`
	Reason         string  `json:"reason" jsonschema:"turn_cap | tie_break | stalled_subagent | workspace_unreachable"`
	Detail         *string `json:"detail,omitempty" jsonschema:"what the arbiter observed, e.g. 'target subagent produced no reply within 180s'"`
}

type resumeHandoffConversationIn struct {
	ConversationID string `json:"conversationId"`
	HumanDirective string `json:"humanDirective" jsonschema:"the human's ruling, recorded verbatim as an arbiter turn"`
	Verdict        string `json:"verdict" jsonschema:"action | dismiss | more_info | blocked"`
	RaiseTurnCapBy *int   `json:"raiseTurnCapBy,omitempty" jsonschema:"optional 1-10: extra subagent turns the human is granting"`
}

type closeHandoffConversationIn struct {
	ConversationID string `json:"conversationId"`
	Reason         string `json:"reason"`
}

type draftHandoffResolutionIn struct {
	ConversationID string `json:"conversationId"`
	Action         string `json:"action" jsonschema:"action | dismiss"`
	ResolutionNote string `json:"resolutionNote" jsonschema:"the note that would be recorded if the human confirms"`
}

// --- Registration ---

// registerHandoffConversationTools registers the seven handoff-conversation
// MCP tools: start_handoff_conversation, record_handoff_turn,
// get_handoff_conversation, escalate_handoff_conversation,
// resume_handoff_conversation, close_handoff_conversation,
// draft_handoff_resolution.
func registerHandoffConversationTools(server *mcp.Server, svc *service.Service) {
	mcp.AddTool(server, &mcp.Tool{
		Name:        "start_handoff_conversation",
		Description: "Open the single handoff-conversation for a Handoff. Call only after both workspaces' rootPaths have been verified reachable on this machine.",
	}, startHandoffConversation(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "record_handoff_turn",
		Description: "Append one turn and get back the server's derived verdict adjudication. The server, not the caller, decides whether the conversation has closed on mutual agreement or hit its turn cap.",
	}, recordHandoffTurn(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "get_handoff_conversation",
		Description: "Read a Handoff's conversation and full ordered turn list. Read-only; no state changes.",
	}, getHandoffConversation(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "escalate_handoff_conversation",
		Description: "Pause the conversation and hand it to the human. Use for a subagent that stalled past the wait budget or a workspace that became unreachable, exactly as for a verdict tie-break.",
	}, escalateHandoffConversation(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "resume_handoff_conversation",
		Description: "Return an escalated conversation to active with the human's ruling, recorded as an arbiter turn.",
	}, resumeHandoffConversation(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "close_handoff_conversation",
		Description: "End an escalated conversation without the subagents agreeing. Does NOT close the Handoff itself.",
	}, closeHandoffConversation(svc))

	mcp.AddTool(server, &mcp.Tool{
		Name:        "draft_handoff_resolution",
		Description: "Record the auto-drafted action/dismiss proposal for the human to confirm. Recording a draft never changes the Handoff.",
	}, draftHandoffResolution(svc))
}

// --- Handler implementations ---

func startHandoffConversation(svc *service.Service) func(context.Context, *mcp.CallToolRequest, startHandoffConversationIn) (*mcp.CallToolResult, conversationStateOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in startHandoffConversationIn) (*mcp.CallToolResult, conversationStateOut, error) {
		arbiterSessionID := ""
		if in.ArbiterSessionID != nil {
			arbiterSessionID = *in.ArbiterSessionID
		}

		conv, err := svc.StartHandoffConversation(ctx, store.StartHandoffConversationParams{
			HandoffID:        in.HandoffID,
			SourceRootPath:   in.SourceRootPath,
			TargetRootPath:   in.TargetRootPath,
			ArbiterSessionID: arbiterSessionID,
		})
		if err != nil {
			if err == store.ErrConflict {
				return toolError(fmt.Sprintf("handoff %s already has a conversation, or is not pending/read", in.HandoffID)), conversationStateOut{}, nil
			}
			return toolError(err.Error()), conversationStateOut{}, nil
		}

		return nil, newConversationStateOut(conv, nil), nil
	}
}

func recordHandoffTurn(svc *service.Service) func(context.Context, *mcp.CallToolRequest, recordHandoffTurnIn) (*mcp.CallToolResult, conversationStateOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in recordHandoffTurnIn) (*mcp.CallToolResult, conversationStateOut, error) {
		state, err := svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
			ConversationID: in.ConversationID,
			Speaker:        in.Speaker,
			Content:        in.Content,
			Verdict:        in.Verdict,
		})
		if err != nil {
			if err == store.ErrConflict {
				return toolError(fmt.Sprintf("conversation %s is not active; no turn was recorded", in.ConversationID)), conversationStateOut{}, nil
			}
			return toolError(err.Error()), conversationStateOut{}, nil
		}

		return nil, newConversationStateOutFromState(state), nil
	}
}

func getHandoffConversation(svc *service.Service) func(context.Context, *mcp.CallToolRequest, getHandoffConversationIn) (*mcp.CallToolResult, getHandoffConversationOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in getHandoffConversationIn) (*mcp.CallToolResult, getHandoffConversationOut, error) {
		var conv *domain.HandoffConversation
		var err error

		switch {
		case in.ConversationID != nil:
			conv, err = svc.GetHandoffConversation(ctx, *in.ConversationID)
		case in.HandoffID != nil:
			conv, err = svc.GetHandoffConversationByHandoff(ctx, *in.HandoffID)
		default:
			return toolError("supply either handoffId or conversationId"), getHandoffConversationOut{}, nil
		}
		if err != nil {
			if err == store.ErrNotFound {
				return toolError("no conversation found"), getHandoffConversationOut{}, nil
			}
			return nil, getHandoffConversationOut{}, err
		}

		turns, err := svc.ListHandoffTurns(ctx, conv.ID)
		if err != nil {
			return nil, getHandoffConversationOut{}, err
		}

		turnOuts := make([]handoffTurnOut, len(turns))
		for i, t := range turns {
			turnOuts[i] = newHandoffTurnOut(t)
		}

		return nil, getHandoffConversationOut{
			Conversation: newConversationStateOut(conv, turns),
			Turns:        turnOuts,
		}, nil
	}
}

func escalateHandoffConversation(svc *service.Service) func(context.Context, *mcp.CallToolRequest, escalateHandoffConversationIn) (*mcp.CallToolResult, conversationStateOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in escalateHandoffConversationIn) (*mcp.CallToolResult, conversationStateOut, error) {
		switch in.Reason {
		case string(domain.HandoffEscalationReasonTurnCap), string(domain.HandoffEscalationReasonTieBreak),
			string(domain.HandoffEscalationReasonStalledSubagent), string(domain.HandoffEscalationReasonWorkspaceUnreachable):
			// valid
		default:
			return toolError(fmt.Sprintf("reason must be turn_cap | tie_break | stalled_subagent | workspace_unreachable, got %q", in.Reason)), conversationStateOut{}, nil
		}

		// Record what the arbiter observed as an arbiter turn before
		// escalating (the conversation must still be active for
		// RecordHandoffTurn to accept it) — otherwise Detail has nowhere to
		// live, since neither the store nor the Handoff track it.
		if in.Detail != nil && *in.Detail != "" {
			if _, err := svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
				ConversationID: in.ConversationID,
				Speaker:        string(domain.HandoffTurnSpeakerArbiter),
				Content:        *in.Detail,
			}); err != nil {
				return toolError(err.Error()), conversationStateOut{}, nil
			}
		}

		err := svc.EscalateHandoffConversation(ctx, in.ConversationID, domain.HandoffEscalationReason(in.Reason))
		if err != nil {
			if err == store.ErrConflict {
				return toolError(fmt.Sprintf("conversation %s is not active; it cannot be escalated", in.ConversationID)), conversationStateOut{}, nil
			}
			return toolError(err.Error()), conversationStateOut{}, nil
		}

		return fetchConversationState(ctx, svc, in.ConversationID)
	}
}

func resumeHandoffConversation(svc *service.Service) func(context.Context, *mcp.CallToolRequest, resumeHandoffConversationIn) (*mcp.CallToolResult, conversationStateOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in resumeHandoffConversationIn) (*mcp.CallToolResult, conversationStateOut, error) {
		if err := svc.ResumeHandoffConversation(ctx, in.ConversationID, in.RaiseTurnCapBy); err != nil {
			if err == store.ErrConflict {
				return toolError(fmt.Sprintf("conversation %s is not escalated; it cannot be resumed", in.ConversationID)), conversationStateOut{}, nil
			}
			return toolError(err.Error()), conversationStateOut{}, nil
		}

		// Record the human's ruling as an arbiter turn now that the
		// conversation is active again — arbiter turns never count toward
		// the subagent turn cap or agreement.
		state, err := svc.RecordHandoffTurn(ctx, store.RecordHandoffTurnParams{
			ConversationID: in.ConversationID,
			Speaker:        string(domain.HandoffTurnSpeakerArbiter),
			Content:        in.HumanDirective,
			Verdict:        in.Verdict,
		})
		if err != nil {
			return toolError(err.Error()), conversationStateOut{}, nil
		}

		return nil, newConversationStateOutFromState(state), nil
	}
}

func closeHandoffConversation(svc *service.Service) func(context.Context, *mcp.CallToolRequest, closeHandoffConversationIn) (*mcp.CallToolResult, conversationStateOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in closeHandoffConversationIn) (*mcp.CallToolResult, conversationStateOut, error) {
		if err := svc.CloseHandoffConversationByHuman(ctx, in.ConversationID); err != nil {
			return toolError(err.Error()), conversationStateOut{}, nil
		}

		return fetchConversationState(ctx, svc, in.ConversationID)
	}
}

func draftHandoffResolution(svc *service.Service) func(context.Context, *mcp.CallToolRequest, draftHandoffResolutionIn) (*mcp.CallToolResult, conversationStateOut, error) {
	return func(ctx context.Context, _ *mcp.CallToolRequest, in draftHandoffResolutionIn) (*mcp.CallToolResult, conversationStateOut, error) {
		var action domain.HandoffVerdict
		switch in.Action {
		case string(domain.HandoffVerdictAction), string(domain.HandoffVerdictDismiss):
			action = domain.HandoffVerdict(in.Action)
		default:
			return toolError(fmt.Sprintf("action must be action | dismiss, got %q", in.Action)), conversationStateOut{}, nil
		}

		if err := svc.DraftHandoffResolution(ctx, in.ConversationID, &action, in.ResolutionNote); err != nil {
			return toolError(err.Error()), conversationStateOut{}, nil
		}

		return fetchConversationState(ctx, svc, in.ConversationID)
	}
}

// fetchConversationState re-reads a conversation plus its turns after a
// mutation that doesn't itself return a domain.HandoffConversationState
// (escalate/close/draft), so every conversation tool responds with the same
// conversationStateOut shape.
func fetchConversationState(ctx context.Context, svc *service.Service, conversationID string) (*mcp.CallToolResult, conversationStateOut, error) {
	conv, err := svc.GetHandoffConversation(ctx, conversationID)
	if err != nil {
		return nil, conversationStateOut{}, err
	}
	turns, err := svc.ListHandoffTurns(ctx, conversationID)
	if err != nil {
		return nil, conversationStateOut{}, err
	}
	return nil, newConversationStateOut(conv, turns), nil
}
