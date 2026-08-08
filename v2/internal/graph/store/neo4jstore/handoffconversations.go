package neo4jstore

import (
	"context"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// StartHandoffConversation creates a new HandoffConversation for a Handoff.
func (s *Neo4jStore) StartHandoffConversation(ctx context.Context, params store.StartHandoffConversationParams) (*domain.HandoffConversation, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	conversationID := uuid.NewString()

	query := `
		MATCH (h:Handoff {id: $handoffId})
		WHERE h.status IN ['pending', 'read']
		AND NOT EXISTS { (h)-[:HAS_CONVERSATION]->(:HandoffConversation) }
		CREATE (c:HandoffConversation {
			id: $conversationId,
			handoffId: $handoffId,
			status: 'active',
			turnCap: toString($turnCap),
			arbiterSessionId: $arbiterSessionId,
			sourceRootPath: $sourceRootPath,
			targetRootPath: $targetRootPath,
			createdAt: $now,
			updatedAt: $now
		})
		CREATE (h)-[:HAS_CONVERSATION]->(c)
		RETURN c
	`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		result, err := tx.Run(ctx, query, map[string]interface{}{
			"handoffId":        params.HandoffID,
			"conversationId":   conversationID,
			"turnCap":          domain.DefaultHandoffTurnCap,
			"arbiterSessionId": params.ArbiterSessionID,
			"sourceRootPath":   params.SourceRootPath,
			"targetRootPath":   params.TargetRootPath,
			"now":              now,
		})

		if err != nil {
			return nil, err
		}

		if !result.Next(ctx) {
			return nil, nil
		}
		return result.Record(), result.Err()
	})

	if err != nil {
		return nil, err
	}

	if rec == nil {
		return nil, store.ErrConflict
	}

	node, ok := singleNode(rec, "c")
	if !ok {
		return nil, store.ErrConflict
	}
	return mapConversationNode(node), nil
}

// GetHandoffConversation retrieves a HandoffConversation by id.
func (s *Neo4jStore) GetHandoffConversation(ctx context.Context, id string) (*domain.HandoffConversation, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	query := `MATCH (c:HandoffConversation {id: $id}) RETURN c`
	rec, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		result, err := tx.Run(ctx, query, map[string]interface{}{"id": id})
		if err != nil {
			return nil, err
		}
		if !result.Next(ctx) {
			return nil, nil
		}
		return result.Record(), result.Err()
	})

	if err != nil {
		return nil, err
	}

	if rec == nil {
		return nil, store.ErrNotFound
	}

	node, ok := singleNode(rec, "c")
	if !ok {
		return nil, store.ErrNotFound
	}
	return mapConversationNode(node), nil
}

// GetHandoffConversationByHandoff retrieves the HandoffConversation for a given Handoff.
func (s *Neo4jStore) GetHandoffConversationByHandoff(ctx context.Context, handoffId string) (*domain.HandoffConversation, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	query := `MATCH (c:HandoffConversation {handoffId: $handoffId}) RETURN c`
	rec, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		result, err := tx.Run(ctx, query, map[string]interface{}{"handoffId": handoffId})
		if err != nil {
			return nil, err
		}
		if !result.Next(ctx) {
			return nil, nil
		}
		return result.Record(), result.Err()
	})

	if err != nil {
		return nil, err
	}

	if rec == nil {
		return nil, store.ErrNotFound
	}

	node, ok := singleNode(rec, "c")
	if !ok {
		return nil, store.ErrNotFound
	}
	return mapConversationNode(node), nil
}

// ListHandoffTurns retrieves all turns for a conversation in turnNumber order.
func (s *Neo4jStore) ListHandoffTurns(ctx context.Context, conversationId string) ([]domain.HandoffTurn, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	query := `
		MATCH (c:HandoffConversation {id: $conversationId})-[:HAS_TURN]->(t:HandoffTurn)
		RETURN t
		ORDER BY t.turnNumber ASC
	`

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		result, err := tx.Run(ctx, query, map[string]interface{}{"conversationId": conversationId})
		if err != nil {
			return nil, err
		}
		return result.Collect(ctx)
	})

	if err != nil {
		return nil, err
	}

	turns := make([]domain.HandoffTurn, 0, len(records))
	for _, record := range records {
		node, ok := singleNode(record, "t")
		if !ok {
			continue
		}
		turns = append(turns, mapTurnNode(node))
	}

	return turns, nil
}

// RecordHandoffTurn appends a turn to an active conversation and returns the
// server-derived HandoffConversationState.
func (s *Neo4jStore) RecordHandoffTurn(ctx context.Context, params store.RecordHandoffTurnParams) (*domain.HandoffConversationState, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	turnID := uuid.NewString()

	result, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		// Step 1: Append the turn
		turnQuery := `
			MATCH (c:HandoffConversation {id: $conversationId})
			WHERE c.status = 'active'
			WITH c, COALESCE(max((c)-[:HAS_TURN]->(t:HandoffTurn) | t.turnNumber), 0) AS maxTurnNumber
			CREATE (t:HandoffTurn {
				id: $turnId,
				conversationId: $conversationId,
				turnNumber: maxTurnNumber + 1,
				speaker: $speaker,
				content: $content,
				verdict: $verdict,
				createdAt: $now
			})
			CREATE (c)-[:HAS_TURN]->(t)
			RETURN t, maxTurnNumber + 1 AS newTurnNumber
		`

		turnResult, err := tx.Run(ctx, turnQuery, map[string]interface{}{
			"conversationId": params.ConversationID,
			"turnId":         turnID,
			"speaker":        params.Speaker,
			"content":        params.Content,
			"verdict":        params.Verdict,
			"now":            now,
		})
		if err != nil {
			return nil, err
		}

		if !turnResult.Next(ctx) {
			return nil, store.ErrConflict
		}

		turnRec := turnResult.Record()
		turnNode, ok := singleNode(turnRec, "t")
		if !ok {
			return nil, store.ErrConflict
		}
		latestTurn := mapTurnNode(turnNode)

		// Step 2: Recompute derived state
		stateQuery := `
			MATCH (c:HandoffConversation {id: $conversationId})
			MATCH (c)-[:HAS_TURN]->(t:HandoffTurn)
			WITH c,
				 [t IN collect(t) WHERE t.speaker IN ['source', 'target'] | t] AS subagentTurns,
				 [t IN collect(t) WHERE t.speaker = 'source' ORDER BY t.turnNumber DESC LIMIT 1] AS latestSourceTurns,
				 [t IN collect(t) WHERE t.speaker = 'target' ORDER BY t.turnNumber DESC LIMIT 1] AS latestTargetTurns
			WITH c,
				 subagentTurns,
				 size(subagentTurns) AS subagentTurnCount,
				 CASE WHEN size(latestSourceTurns) > 0 THEN latestSourceTurns[0].verdict ELSE null END AS latestSourceVerdict,
				 CASE WHEN size(latestTargetTurns) > 0 THEN latestTargetTurns[0].verdict ELSE null END AS latestTargetVerdict
			WITH c,
				 subagentTurnCount,
				 latestSourceVerdict,
				 latestTargetVerdict,
				 (latestSourceVerdict = latestTargetVerdict AND latestSourceVerdict IN ['action', 'dismiss']) AS agreementReached,
				 (subagentTurnCount >= toInteger(c.turnCap)) AS capReached
			SET c.updatedAt = $now
			SET c.status = CASE
				WHEN agreementReached THEN 'closed_agreed'
				WHEN capReached AND c.status = 'active' THEN 'escalated'
				ELSE c.status
			END
			SET c.escalationReason = CASE
				WHEN capReached AND c.status = 'active' THEN 'turn_cap'
				ELSE c.escalationReason
			END
			SET c.escalatedAt = CASE
				WHEN capReached AND c.status = 'active' THEN $now
				ELSE c.escalatedAt
			END
			SET c.closedAt = CASE
				WHEN agreementReached THEN $now
				ELSE c.closedAt
			END
			RETURN c, subagentTurnCount, agreementReached, capReached
		`

		stateResult, err := tx.Run(ctx, stateQuery, map[string]interface{}{
			"conversationId": params.ConversationID,
			"now":            now,
		})
		if err != nil {
			return nil, err
		}

		if !stateResult.Next(ctx) {
			return nil, err
		}

		stateRec := stateResult.Record()
		convNode, ok := singleNode(stateRec, "c")
		if !ok {
			return nil, err
		}
		conversation := mapConversationNode(convNode)
		subagentTurnCount := int(stateRec.AsMap()["subagentTurnCount"].(int64))
		agreementReached := stateRec.AsMap()["agreementReached"].(bool)
		capReached := stateRec.AsMap()["capReached"].(bool)

		// Determine next speaker
		nextSpeaker := domain.HandoffTurnSpeakerSource
		if latestTurn.Speaker == domain.HandoffTurnSpeakerSource {
			nextSpeaker = domain.HandoffTurnSpeakerTarget
		} else if latestTurn.Speaker == domain.HandoffTurnSpeakerTarget {
			nextSpeaker = domain.HandoffTurnSpeakerSource
		}

		return &domain.HandoffConversationState{
			Conversation:      conversation,
			LatestTurn:        &latestTurn,
			SubagentTurnCount: subagentTurnCount,
			AgreementReached:  agreementReached,
			CapReached:        capReached,
			NextSpeaker:       nextSpeaker,
		}, nil
	})

	if err != nil {
		return nil, err
	}

	return result.(*domain.HandoffConversationState), nil
}

// EscalateHandoffConversation moves an active conversation to escalated.
func (s *Neo4jStore) EscalateHandoffConversation(ctx context.Context, params store.EscalateHandoffConversationParams) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	query := `
		MATCH (c:HandoffConversation {id: $conversationId})
		WHERE c.status = 'active'
		SET c.status = 'escalated',
			c.escalationReason = $reason,
			c.escalatedAt = $now,
			c.updatedAt = $now
		RETURN c
	`

	_, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		result, err := tx.Run(ctx, query, map[string]interface{}{
			"conversationId": params.ConversationID,
			"reason":         params.Reason,
			"now":            now,
		})
		if err != nil {
			return nil, err
		}

		if !result.Next(ctx) {
			return nil, nil
		}
		return result.Record(), result.Err()
	})

	if err != nil {
		return err
	}

	return nil
}

// ResumeHandoffConversation moves an escalated conversation back to active.
func (s *Neo4jStore) ResumeHandoffConversation(ctx context.Context, params store.ResumeHandoffConversationParams) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()

	_, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		// Get current cap
		getCapQuery := `MATCH (c:HandoffConversation {id: $conversationId}) RETURN toInteger(c.turnCap) AS currentCap`
		capResult, err := tx.Run(ctx, getCapQuery, map[string]interface{}{"conversationId": params.ConversationID})
		if err != nil {
			return nil, err
		}

		if !capResult.Next(ctx) {
			return nil, store.ErrConflict
		}

		capRec := capResult.Record()
		currentCap := int(capRec.AsMap()["currentCap"].(int64))
		raiseBy := 0
		if params.RaiseTurnCapBy != nil {
			raiseBy = *params.RaiseTurnCapBy
		}
		newCap := currentCap + raiseBy

		// Update conversation
		updateQuery := `
			MATCH (c:HandoffConversation {id: $conversationId})
			WHERE c.status = 'escalated'
			SET c.status = 'active',
				c.turnCap = toString($newCap),
				c.updatedAt = $now
			RETURN c
		`

		result, err := tx.Run(ctx, updateQuery, map[string]interface{}{
			"conversationId": params.ConversationID,
			"newCap":         newCap,
			"now":            now,
		})
		if err != nil {
			return nil, err
		}

		if !result.Next(ctx) {
			return nil, store.ErrConflict
		}

		return result.Record(), result.Err()
	})

	if err != nil {
		return err
	}

	return nil
}

// CloseHandoffConversationByHuman closes a conversation in closed_by_human state.
func (s *Neo4jStore) CloseHandoffConversationByHuman(ctx context.Context, id string) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	query := `
		MATCH (c:HandoffConversation {id: $id})
		SET c.status = 'closed_by_human',
			c.closedAt = $now,
			c.updatedAt = $now
		RETURN c
	`

	_, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		result, err := tx.Run(ctx, query, map[string]interface{}{
			"id":  id,
			"now": now,
		})
		if err != nil {
			return nil, err
		}

		if !result.Next(ctx) {
			return nil, nil
		}
		return result.Record(), result.Err()
	})

	if err != nil {
		return err
	}

	return nil
}

// DraftHandoffResolution records a draft resolution on the conversation.
func (s *Neo4jStore) DraftHandoffResolution(ctx context.Context, params store.DraftHandoffResolutionParams) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	query := `
		MATCH (c:HandoffConversation {id: $conversationId})
		SET c.draftedAction = $action,
			c.draftedResolutionNote = $note,
			c.draftedAt = toString($now),
			c.updatedAt = $now
		RETURN c
	`

	_, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		result, err := tx.Run(ctx, query, map[string]interface{}{
			"conversationId": params.ConversationID,
			"action":         derefStr(params.Action),
			"note":           params.ResolutionNote,
			"now":            now,
		})
		if err != nil {
			return nil, err
		}

		if !result.Next(ctx) {
			return nil, nil
		}
		return result.Record(), result.Err()
	})

	if err != nil {
		return err
	}

	return nil
}

// mapConversationNode converts a Neo4j node to a domain.HandoffConversation.
func mapConversationNode(node neo4j.Node) *domain.HandoffConversation {
	props := node.Props

	status := domain.HandoffConversationStatus(props["status"].(string))

	conv := &domain.HandoffConversation{
		ID:             props["id"].(string),
		HandoffID:      props["handoffId"].(string),
		Status:         status,
		SourceRootPath: props["sourceRootPath"].(string),
		TargetRootPath: props["targetRootPath"].(string),
		CreatedAt:      props["createdAt"].(time.Time),
		UpdatedAt:      props["updatedAt"].(time.Time),
	}

	// TurnCap (stored as string, convert to int)
	if v, ok := props["turnCap"].(string); ok && v != "" {
		if cap, err := strconv.Atoi(v); err == nil {
			conv.TurnCap = cap
		}
	} else if v, ok := props["turnCap"].(int); ok {
		conv.TurnCap = v
	} else if v, ok := props["turnCap"].(int64); ok {
		conv.TurnCap = int(v)
	}

	// EscalationReason
	if v, ok := props["escalationReason"].(string); ok && v != "" {
		conv.EscalationReason = (*domain.HandoffEscalationReason)(&v)
	}

	// Timestamps
	if v, ok := props["escalatedAt"].(time.Time); ok && !v.IsZero() {
		conv.EscalatedAt = &v
	}
	if v, ok := props["closedAt"].(time.Time); ok && !v.IsZero() {
		conv.ClosedAt = &v
	}

	// DraftedAction
	if v, ok := props["draftedAction"].(string); ok && v != "" {
		conv.DraftedAction = (*domain.HandoffVerdict)(&v)
	}

	// DraftedResolutionNote
	if v, ok := props["draftedResolutionNote"].(string); ok && v != "" {
		conv.DraftedResolutionNote = &v
	}

	// DraftedAt (stored as string in Neo4j, but parsed as time.Time in domain)
	if v, ok := props["draftedAt"].(string); ok && v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			conv.DraftedAt = &t
		}
	} else if v, ok := props["draftedAt"].(time.Time); ok && !v.IsZero() {
		conv.DraftedAt = &v
	}

	// ArbiterSessionID
	if v, ok := props["arbiterSessionId"].(string); ok && v != "" {
		conv.ArbiterSessionID = &v
	}

	return conv
}

// mapTurnNode converts a Neo4j node to a domain.HandoffTurn.
func mapTurnNode(node neo4j.Node) domain.HandoffTurn {
	props := node.Props

	speaker := domain.HandoffTurnSpeaker(props["speaker"].(string))

	turn := domain.HandoffTurn{
		ID:             props["id"].(string),
		ConversationID: props["conversationId"].(string),
		TurnNumber:     int(props["turnNumber"].(int64)),
		Speaker:        speaker,
		Content:        props["content"].(string),
		CreatedAt:      props["createdAt"].(time.Time),
	}

	// Optional verdict
	if v, ok := props["verdict"].(string); ok && v != "" {
		verdict := domain.HandoffVerdict(v)
		turn.Verdict = &verdict
	}

	return turn
}
