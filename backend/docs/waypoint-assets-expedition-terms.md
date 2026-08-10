# Grilling Session: waypoint-assets-expedition-terms

- Start date: 2026-07-27
- Status: implemented and verified (build/vet/test + live Neo4j smoke test)

## Initial Prompt

Implement the stubbed `waypoint assets` and `expedition terms` features in
`internal/graph` (currently `store.ErrNotImplemented` in
`internal/graph/store/neo4jstore/deferred.go`), including the read-side gaps:
no `ListExpeditionTerms` store method exists yet (the `terms` bucket in
`get_expedition`'s map is hardcoded to an empty list), and no MCP tool
surfaces `ListWaypointAssets` at all.

## Decisions

1. **Scope includes the read side.** Not just making `AddWaypointAsset`/`AddExpeditionTerm`/`UpdateExpeditionTerm` write successfully — also add `ListExpeditionTerms` (new store method) so `get_expedition`'s `terms` bucket actually populates, and surface waypoint assets somewhere readable (mechanism TBD in Q2). An add-only feature that's invisible afterward isn't usable.

2. **Waypoint assets surface via `get_waypoint`'s detail view only.** Folded into `newWaypointOutDetailed` alongside `history`/`flags`, populated only on `get_waypoint`, not list/frontier/map. No new `list_waypoint_assets` tool. Matches the existing "zoom as needed" pattern. Terms follow the same shape by extension: `get_expedition`'s existing `terms` map bucket is the read path, no new `list_expedition_terms` tool needed either.

3. **Expedition terms reject case-insensitive duplicates.** `AddExpeditionTerm` conflicts (`ErrConflict`) if a term with the same text (case-insensitive) already exists on that expedition. A term is meant to be the canonical definition for a piece of vocabulary, not free-form prose like a waypoint title — two entries with different definitions for the same word is a real inconsistency. Changing a definition goes through `update_expedition_term`, not a second `add`.

4. **Service-layer validation on asset content shape.** Reject (clear error) if a waypoint asset has both `ContentMarkdown` and `RepoPath` set, or neither, and reject `CommitSHA` set without `RepoPath`. Matches the existing pattern of `rehydrate_waypoint`/`flag_waypoint` rejecting empty `reason`/`note` at the service layer.

5. **Add `update_expedition_term` as a new MCP tool.** `UpdateExpeditionTerm` already exists on the `Store` interface (`id, definition`) but has no service pass-through or tool — a pre-existing dead-method gap, same shape as the others here. Wire it up now: one Cypher `SET`, one `service.go` pass-through, one tool registration (shape matching `resolve_waypoint_flag`).

6. **`AddWaypointAsset` is unguarded** — attachable regardless of the target waypoint's status, matching `flag_waypoint`'s permissive approach rather than gating on `reached`. The wayfinder skill's `research` approach describes attaching a document as part of resolving the waypoint, before `reach_waypoint` is called; guarding on `reached` would force an artificial ordering. Update the existing `add_waypoint_asset` tool description text (currently says "to a reached waypoint") to drop that implication.
