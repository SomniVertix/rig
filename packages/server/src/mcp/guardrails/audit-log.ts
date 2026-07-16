/**
 * T6.3: append-only `audit_log` insertion in every write transaction.
 *
 * `AuditInfo` is the small bag of attribution info every write tool call already
 * has in hand -- `actor` (the write's required argument, T6.2) and `projectId`
 * (the MCP session's bound project, T4.4) -- that gets threaded down to
 * `SpecRepository`'s mutation methods.
 *
 * The actual `INSERT INTO spec_pipeline.audit_log` statement lives in
 * `@relentless/persistence`'s `SpecRepository` (not here), and deliberately so:
 * Story 11.2 requires the audit row to land in the *same transaction/commit* as the
 * mutation it records, and only the code already holding that transaction's
 * `PoolClient` -- `SpecRepository`'s own `withTx` callbacks -- can guarantee that.
 * A separate post-hoc INSERT from this (or any) MCP-layer module would run in its
 * own transaction, reopening the atomicity gap Story 11.2 exists to close. This
 * type is the shared contract between the two: guardrails/tool-layer code builds
 * an `AuditInfo` from `{ actor, context.projectId }` and passes it straight through
 * to the repository call it's wrapping.
 */
export interface AuditInfo {
	actor: string;
	projectId: string | null;
}
