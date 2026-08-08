package domain

import "time"

const DefaultHandoffTurnCap = 15

// HandoffConversationStatus represents the lifecycle state of a conversation.
type HandoffConversationStatus string

const (
	HandoffConversationStatusActive         HandoffConversationStatus = "active"
	HandoffConversationStatusEscalated      HandoffConversationStatus = "escalated"
	HandoffConversationStatusClosedAgreed   HandoffConversationStatus = "closed_agreed"
	HandoffConversationStatusClosedByHuman  HandoffConversationStatus = "closed_by_human"
)

// HandoffEscalationReason describes why a conversation was escalated.
type HandoffEscalationReason string

const (
	HandoffEscalationReasonTurnCap             HandoffEscalationReason = "turn_cap"
	HandoffEscalationReasonTieBreak            HandoffEscalationReason = "tie_break"
	HandoffEscalationReasonStalledSubagent     HandoffEscalationReason = "stalled_subagent"
	HandoffEscalationReasonWorkspaceUnreachable HandoffEscalationReason = "workspace_unreachable"
)

// HandoffTurnSpeaker identifies who is speaking in a turn.
type HandoffTurnSpeaker string

const (
	HandoffTurnSpeakerSource  HandoffTurnSpeaker = "source"
	HandoffTurnSpeakerTarget  HandoffTurnSpeaker = "target"
	HandoffTurnSpeakerArbiter HandoffTurnSpeaker = "arbiter"
)

// HandoffVerdict represents a participant's decision in a turn.
type HandoffVerdict string

const (
	HandoffVerdictAction    HandoffVerdict = "action"
	HandoffVerdictDismiss   HandoffVerdict = "dismiss"
	HandoffVerdictMoreInfo  HandoffVerdict = "more_info"
	HandoffVerdictBlocked   HandoffVerdict = "blocked"
)

// HandoffConversation represents the turn-by-turn exchange about a handoff.
type HandoffConversation struct {
	ID                  string
	HandoffID           string
	Status              HandoffConversationStatus
	TurnCap             int
	EscalationReason    *HandoffEscalationReason
	EscalatedAt         *time.Time
	DraftedAction       *HandoffVerdict
	DraftedResolutionNote *string
	DraftedAt           *time.Time
	ArbiterSessionID    *string
	SourceRootPath      string
	TargetRootPath      string
	ClosedAt            *time.Time
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// HandoffTurnPtr is a pointer to HandoffTurn for optional fields.
type HandoffTurnPtr *HandoffTurn

// HandoffTurn represents a single message in a conversation.
type HandoffTurn struct {
	ID             string
	ConversationID string
	TurnNumber     int
	Speaker        HandoffTurnSpeaker
	Content        string
	Verdict        *HandoffVerdict
	CreatedAt      time.Time
}

// HandoffConversationState represents the derived state after recording a turn.
// This is computed server-side and returned to the caller.
type HandoffConversationState struct {
	Conversation      *HandoffConversation
	LatestTurn        *HandoffTurn
	SubagentTurnCount int
	AgreementReached  bool
	CapReached        bool
	NextSpeaker       HandoffTurnSpeaker
	SuggestedResolution *string
}
