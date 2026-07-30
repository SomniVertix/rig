// Extracted from RL_DATA.audit (spec_pipeline.audit_log) — see README.md.
export interface FixtureAuditRow {
	ts: string;
	actor: string;
	action: 'insert' | 'update' | 'delete' | 'finalize';
	table: string;
	row: string;
}

export const FIXTURE_AUDIT: FixtureAuditRow[] = [
	{ ts: '14:02:11', actor: 'design-drafter', action: 'finalize', table: 'spec_pipeline.designs', row: 'a1f3' },
	{ ts: '14:01:56', actor: 'design-drafter', action: 'update', table: 'spec_pipeline.design_components', row: 'd_02' },
	{ ts: '13:58:02', actor: 'scheduler', action: 'update', table: 'public.runs', row: 'run_7f3a' },
	{ ts: '13:44:30', actor: 'grilling', action: 'insert', table: 'discovery.trail_terms', row: 'grip token' },
	{ ts: '13:40:12', actor: 'requirements-compiler', action: 'finalize', table: 'spec_pipeline.requirements', row: 'c4d9' },
	{ ts: '13:12:47', actor: 'code-implementer', action: 'update', table: 'spec_pipeline.task_items', row: '7b02 · 14/22' },
	{ ts: '12:59:03', actor: 'wayfinder', action: 'insert', table: 'discovery.waypoints', row: 'auth-hardening · W8' }
];
