// Extracted from RL_DATA.actors (spec_pipeline.known_actors) — see README.md.
export interface FixtureActor {
	actor: string;
	source: string;
	synced: string;
}

export const FIXTURE_ACTORS: FixtureActor[] = [
	{ actor: 'grilling', source: '/skills/grilling/SKILL.md', synced: 'boot · 2h ago' },
	{ actor: 'wayfinder', source: '/skills/wayfinder/SKILL.md', synced: 'boot · 2h ago' },
	{ actor: 'requirements-compiler', source: '/skills/requirements-compiler/SKILL.md', synced: 'boot · 2h ago' },
	{ actor: 'design-drafter', source: '/skills/design-drafter/SKILL.md', synced: 'boot · 2h ago' },
	{ actor: 'tasks-drafter', source: '/skills/tasks-drafter/SKILL.md', synced: 'boot · 2h ago' },
	{ actor: 'spec-implementation-orchestrator', source: '/skills/spec-implementation-orchestrator/SKILL.md', synced: 'boot · 2h ago' },
	{ actor: 'code-implementer', source: '/skills/code-implementer/SKILL.md', synced: 'boot · 2h ago' },
	{ actor: 'test-writer', source: '/skills/test-writer/SKILL.md', synced: 'boot · 2h ago' },
	{ actor: 'code-reviewer', source: '/skills/code-reviewer/SKILL.md', synced: 'boot · 2h ago' }
];
