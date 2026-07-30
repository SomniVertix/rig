// Hand-authored — no session/grilling sample data exists in RL_DATA (V2 has
// no session storage at all yet, see GAPS.md §3), so this is shaped directly
// to the design handoff's §6/§7 described fields rather than lifted from
// source. See fixtures/README.md.

export interface FixtureTurn {
	n: number;
	question: string;
	answer: string;
}

export interface FixtureSession {
	id: string;
	kind: 'discovery' | 'scratch';
	executor: 'claude' | 'pi';
	model: string;
	startedAt: string;
	trailId?: string;
	outcomeSpecId?: string;
	turns: FixtureTurn[];
}

/** A completed, read-only transcript — linked to the 'structured-logging' trail. */
export const FIXTURE_COMPLETED_SESSION: FixtureSession = {
	id: 'grill-0708-a',
	kind: 'discovery',
	executor: 'claude',
	model: 'sonnet',
	startedAt: '5d ago',
	trailId: 'structured-logging',
	outcomeSpecId: 'a1f3',
	turns: [
		{
			n: 1,
			question: 'What does "structured logging" mean for this system — what shape does one log event take?',
			answer: 'A flat JSON envelope: timestamp, level, actor, table, and a payload object specific to the event.'
		},
		{
			n: 2,
			question: 'Where do these events end up — a dedicated log store, or somewhere that already exists?',
			answer: "Postgres audit_log. We don't want a second store to keep consistent with the transactional data."
		},
		{
			n: 3,
			question: 'High-frequency writes to Postgres worry me a little — any batching strategy in mind?',
			answer: 'Batch flush at 200ms or 500 rows, whichever comes first. Benched clean at p99 under load.'
		}
	]
};

/** A live, in-progress session — first two turns answered, more queued. */
export const FIXTURE_LIVE_SESSION_SCRIPT: FixtureSession = {
	id: 'grill-0714-a',
	kind: 'discovery',
	executor: 'claude',
	model: 'sonnet',
	startedAt: '2m ago',
	turns: [
		{
			n: 1,
			question: 'What\'s the itch — what should exist that doesn\'t?',
			answer: 'We keep re-deriving workspace scope from cwd. It should just be a stable identity the console can hold onto.'
		},
		{
			n: 2,
			question: 'Is "workspace" the right unit, or is it something narrower — a project, a repo?',
			answer: 'Workspace. It can span repos, and it\'s the thing specs/trails actually belong to.'
		}
	]
};

/** Questions revealed one at a time after the two seeded turns above, simulating the agent asking the next question. */
export const FIXTURE_LIVE_SESSION_UPCOMING = [
	'Where should that identity live — issued by the server, or derived client-side from something stable?',
	'What happens when two browser tabs have different workspaces open at once — is that even allowed?'
];
