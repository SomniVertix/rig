package neo4jstore

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"

	"github.com/somnivertix/rig/internal/graph/domain"
	"github.com/somnivertix/rig/internal/graph/store"
)

// SendHandoff creates the :Handoff node, its :HandoffAttachment children
// (ordinal 1..n in supplied order), and any supplied origin back-link edges
// ((:Waypoint)-[:HANDED_OFF]->(:Handoff) and/or
// (:Expedition)-[:HANDED_OFF]->(:Handoff)) in a single write transaction —
// one CREATE for the Handoff, one UNWIND/FOREACH pass over the attachments,
// and one FOREACH per optional origin link, all inside the same tx.Run
// call. There is deliberately no window where a Handoff persists without
// its attachments: either the whole statement commits or none of it does.
//
// A supplied OriginWaypointID/OriginExpeditionID that doesn't resolve to an
// existing node is a silent no-op for that back-link (mirroring
// AddTaskItem's best-effort SATISFIES linking for a bad criterion id) —
// the Handoff itself still gets created with the origin id recorded as a
// plain property either way.
func (s *Neo4jStore) SendHandoff(ctx context.Context, params store.SendHandoffParams) (*domain.Handoff, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	id := uuid.NewString()

	attachments := make([]map[string]any, len(params.Attachments))
	for i, att := range params.Attachments {
		attachments[i] = map[string]any{
			"id":        uuid.NewString(),
			"ordinal":   i + 1,
			"repoPath":  att.RepoPath,
			"commitSha": att.CommitSHA,
			"note":      att.Note,
		}
	}

	cypher := `
		CREATE (h:Handoff {
			id: $id, sourceWorkspaceId: $sourceWorkspaceId, targetWorkspaceId: $targetWorkspaceId,
			title: $title, bodyMarkdown: $bodyMarkdown, type: $type, status: $status,
			originExpeditionId: $originExpeditionId, originWaypointId: $originWaypointId,
			originCommitSha: $originCommitSha, originSessionId: $originSessionId,
			sentBy: $sentBy, sentAt: $sentAt, readAt: NULL,
			resolutionNote: NULL, resolvedAt: NULL, resolvedBy: NULL,
			createdAt: $createdAt, updatedAt: $updatedAt
		})
		WITH h
		UNWIND (CASE WHEN size($attachments) = 0 THEN [NULL] ELSE $attachments END) AS att
		FOREACH (_ IN CASE WHEN att IS NOT NULL THEN [1] ELSE [] END |
			CREATE (h)-[:HAS_ATTACHMENT]->(:HandoffAttachment {
				id: att.id, handoffId: h.id, ordinal: att.ordinal,
				repoPath: att.repoPath, commitSha: att.commitSha, note: att.note
			})
		)
		WITH DISTINCT h
		OPTIONAL MATCH (w:Waypoint {id: $originWaypointId})
		FOREACH (_ IN CASE WHEN w IS NOT NULL THEN [1] ELSE [] END | CREATE (w)-[:HANDED_OFF]->(h))
		WITH h
		OPTIONAL MATCH (ex:Expedition {id: $originExpeditionId})
		FOREACH (_ IN CASE WHEN ex IS NOT NULL THEN [1] ELSE [] END | CREATE (ex)-[:HANDED_OFF]->(h))
		RETURN h`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"id":                 id,
			"sourceWorkspaceId":  params.SourceWorkspaceID,
			"targetWorkspaceId":  params.TargetWorkspaceID,
			"title":              params.Title,
			"bodyMarkdown":       params.BodyMarkdown,
			"type":               params.Type,
			"status":             string(domain.HandoffStatusPending),
			"originExpeditionId": derefStr(params.OriginExpeditionID),
			"originWaypointId":   derefStr(params.OriginWaypointID),
			"originCommitSha":    derefStr(params.OriginCommitSHA),
			"originSessionId":    derefStr(params.OriginSessionID),
			"sentBy":             params.SentBy,
			"sentAt":             now,
			"createdAt":          now,
			"updatedAt":          now,
			"attachments":        attachments,
		})
		if err != nil {
			return nil, err
		}
		return res.Single(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: send handoff: %w", err)
	}
	n, ok := singleNode(rec, "h")
	if !ok {
		return nil, fmt.Errorf("neo4jstore: send handoff: no handoff returned")
	}
	return nodeToHandoff(n)
}

// GetHandoff looks up a single Handoff by id.
func (s *Neo4jStore) GetHandoff(ctx context.Context, id string) (*domain.Handoff, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	rec, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, "MATCH (h:Handoff {id: $id}) RETURN h", map[string]any{"id": id})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: get handoff: %w", err)
	}
	if rec == nil {
		return nil, store.ErrNotFound
	}
	n, ok := singleNode(rec, "h")
	if !ok {
		return nil, store.ErrNotFound
	}
	return nodeToHandoff(n)
}

// ListHandoffs returns Handoffs touching params.WorkspaceID, scoped by
// Direction relative to that workspace: inbound matches on targetWorkspaceId,
// outbound matches on sourceWorkspaceId, and both is the union of the two.
// An unrecognized Direction falls back to inbound. Status, if supplied,
// narrows the result to that single status. Results are ordered newest-sent
// first.
func (s *Neo4jStore) ListHandoffs(ctx context.Context, params store.ListHandoffsParams) ([]domain.Handoff, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	var cypher string
	switch store.HandoffDirection(params.Direction) {
	case store.HandoffDirectionOutbound:
		cypher = "MATCH (h:Handoff) WHERE h.sourceWorkspaceId = $workspaceId "
	case store.HandoffDirectionBoth:
		cypher = "MATCH (h:Handoff) WHERE (h.sourceWorkspaceId = $workspaceId OR h.targetWorkspaceId = $workspaceId) "
	default: // inbound, and any unrecognized value
		cypher = "MATCH (h:Handoff) WHERE h.targetWorkspaceId = $workspaceId "
	}

	qparams := map[string]any{"workspaceId": params.WorkspaceID}
	if params.Status != nil {
		cypher += "AND h.status = $status "
		qparams["status"] = *params.Status
	}
	cypher += "RETURN h ORDER BY h.sentAt DESC"

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, qparams)
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list handoffs: %w", err)
	}

	handoffs := make([]domain.Handoff, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "h")
		if !ok {
			continue
		}
		h, err := nodeToHandoff(n)
		if err != nil {
			return nil, err
		}
		handoffs = append(handoffs, *h)
	}
	return handoffs, nil
}

// AddHandoffAttachment appends one piece of supporting evidence to a
// Handoff. Guarded like ClaimWaypoint: only a pending Handoff accepts new
// attachments, so a zero-row match on the WHERE (handoff missing, or
// already read/actioned/dismissed) surfaces as store.ErrConflict rather
// than a silent no-op CREATE. There is deliberately no method anywhere that
// mutates or removes an existing attachment — appending is the only
// affordance, mirroring the append-only Handoff itself.
func (s *Neo4jStore) AddHandoffAttachment(ctx context.Context, params store.AddHandoffAttachmentParams) (*domain.HandoffAttachment, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	id := uuid.NewString()

	cypher := `
		MATCH (h:Handoff {id: $handoffId})
		WHERE h.status = $pending
		WITH h, COALESCE(max((h)-[:HAS_ATTACHMENT]->(a) | a.ordinal), 0) AS maxOrdinal
		CREATE (a:HandoffAttachment {
			id: $id,
			handoffId: $handoffId,
			ordinal: maxOrdinal + 1,
			repoPath: $repoPath,
			commitSha: $commitSha,
			note: $note
		})
		CREATE (h)-[:HAS_ATTACHMENT]->(a)
		RETURN a`

	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, cypher, map[string]any{
			"handoffId": params.HandoffID,
			"pending":   string(domain.HandoffStatusPending),
			"id":        id,
			"repoPath":  params.RepoPath,
			"commitSha": params.CommitSHA,
			"note":      params.Note,
		})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: add handoff attachment: %w", err)
	}
	if rec == nil {
		return nil, store.ErrConflict
	}
	n, ok := singleNode(rec, "a")
	if !ok {
		return nil, store.ErrConflict
	}
	return nodeToHandoffAttachment(n)
}

// MarkHandoffRead transitions a pending Handoff to read, recording readAt.
// Guarded by a Cypher WHERE clause rather than a read-then-write round trip
// (matching ClaimWaypoint's zero-rows-means-conflict pattern): if the
// Handoff isn't currently pending — or doesn't exist at all — zero rows
// match and this returns store.ErrConflict.
func (s *Neo4jStore) MarkHandoffRead(ctx context.Context, handoffID string) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (h:Handoff {id: $handoffId})
			WHERE h.status = $pending
			SET h.status = $read, h.readAt = $now, h.updatedAt = $now
			RETURN h`, map[string]any{
			"handoffId": handoffID,
			"pending":   string(domain.HandoffStatusPending),
			"read":      string(domain.HandoffStatusRead),
			"now":       now,
		})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return fmt.Errorf("neo4jstore: mark handoff read: %w", err)
	}
	if rec == nil {
		return fmt.Errorf("neo4jstore: mark handoff read: %w: handoff is not pending", store.ErrConflict)
	}
	return nil
}

// CloseHandoff moves a Handoff from pending or read into a terminal status
// ("actioned" or "dismissed"), recording the resolution note, resolver, and
// timestamp in the same write. Guarded by a Cypher WHERE clause: if the
// Handoff is already terminal — or doesn't exist at all — zero rows match
// and this returns store.ErrConflict with no partial write.
func (s *Neo4jStore) CloseHandoff(ctx context.Context, params store.CloseHandoffParams) error {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	now := time.Now().UTC()
	rec, err := neo4j.ExecuteWrite(ctx, sess, func(tx neo4j.ManagedTransaction) (*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (h:Handoff {id: $id})
			WHERE h.status IN [$pending, $read]
			SET h.status = $terminal, h.resolutionNote = $note, h.resolvedAt = $now,
			    h.resolvedBy = $by, h.updatedAt = $now
			RETURN h`, map[string]any{
			"id":       params.ID,
			"pending":  string(domain.HandoffStatusPending),
			"read":     string(domain.HandoffStatusRead),
			"terminal": params.Terminal,
			"note":     params.ResolutionNote,
			"by":       params.ResolvedBy,
			"now":      now,
		})
		if err != nil {
			return nil, err
		}
		if !res.Next(ctx) {
			return nil, nil
		}
		return res.Record(), res.Err()
	})
	if err != nil {
		return fmt.Errorf("neo4jstore: close handoff: %w", err)
	}
	if rec == nil {
		return fmt.Errorf("neo4jstore: close handoff: %w: handoff is already closed or doesn't exist", store.ErrConflict)
	}
	return nil
}

// ListHandoffAttachments returns every HandoffAttachment hung off handoffID,
// ordered by Ordinal ascending (send order).
func (s *Neo4jStore) ListHandoffAttachments(ctx context.Context, handoffID string) ([]domain.HandoffAttachment, error) {
	sess := s.session(ctx)
	defer sess.Close(ctx)

	records, err := neo4j.ExecuteRead(ctx, sess, func(tx neo4j.ManagedTransaction) ([]*neo4j.Record, error) {
		res, err := tx.Run(ctx, `
			MATCH (:Handoff {id: $handoffId})-[:HAS_ATTACHMENT]->(a:HandoffAttachment)
			RETURN a ORDER BY a.ordinal`, map[string]any{"handoffId": handoffID})
		if err != nil {
			return nil, err
		}
		return res.Collect(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("neo4jstore: list handoff attachments: %w", err)
	}

	attachments := make([]domain.HandoffAttachment, 0, len(records))
	for _, rec := range records {
		n, ok := singleNode(rec, "a")
		if !ok {
			continue
		}
		a, err := nodeToHandoffAttachment(n)
		if err != nil {
			return nil, err
		}
		attachments = append(attachments, *a)
	}
	return attachments, nil
}
