import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import type { Pool } from 'pg';

import { GuardrailError } from './errors.js';

/**
 * T6.2: actor/attribution requirement + known-actors validation. Every write tool
 * already requires an `actor` argument at the zod schema layer (T5's
 * `ACTOR_DESCRIPTION`/`z.string().min(1)`, present on every write tool's input
 * schema) -- that alone rejects a missing/blank actor before this ever runs (Story
 * 11.1). This module adds the second half: checking the supplied actor against
 * `spec_pipeline.known_actors` (Story 11.4).
 */
export async function requireKnownActor(pool: Pool, actor: unknown): Promise<string> {
	if (typeof actor !== 'string' || actor.trim().length === 0) {
		throw new GuardrailError('missing_actor', 'actor is required for this write');
	}
	const result = await pool.query('select 1 from spec_pipeline.known_actors where actor = $1', [actor]);
	if (result.rowCount === 0) {
		throw new GuardrailError('unknown_actor', `actor is not registered in known_actors: ${actor}`);
	}
	return actor;
}

/**
 * T6.4 (revised, Story 11.5-follow-up): boot-time known-actors registry sync.
 *
 * Agents and Claude Code skills are separate concepts. An "actor" here means
 * something that is actually allowed to attribute a write to a rig MCP
 * tool -- the seven pipeline agents (`requirements-compiler`, `design-drafter`,
 * `tasks-drafter`, `spec-implementation-orchestrator`, `code-implementer`,
 * `test-writer`, `code-reviewer`) plus the discovery-stage skills that write
 * directly (`grilling`, and `wayfinder` if present). It does NOT mean "anything
 * that happens to be installed as a Claude Code skill" -- unrelated skills like
 * a caveman-mode formatter or a keybindings helper have no business attributing
 * a spec-pipeline write and must never be registered just because they live in
 * the same `~/.claude/skills` tree.
 *
 * This function therefore scans a **curated actors directory**
 * (`<actorsDirectory>/<name>`), never the general Claude Code skills directory.
 * That directory is expected to contain, for every legitimate actor, either a
 * symlink back into `~/.claude/skills/<name>` (for actors that are also
 * runnable skills, which is every actor today) or a real directory -- either
 * way it must resolve to something containing a `SKILL.md`, which doubles as
 * an integrity check that the entry isn't a stale/typo'd reference to a skill
 * that no longer exists. The actor name is the directory name, not a filename.
 *
 * Every entry found here is registered into `known_actors`
 * (`source = 'claude-skills'`), refreshing `updated_at` on every boot via
 * `ON CONFLICT (actor) DO UPDATE`. Re-running only refreshes `updated_at`; it
 * never removes an actor no longer present on disk.
 *
 * No Pi-equivalent local agent-definition directory exists to scan:
 * `packages/executors/src/index.ts`'s `PiExecutor` dynamically imports the
 * `@earendil-works/pi-coding-agent` npm package and calls its `createAgentSession`
 * API directly -- Pi agents are not defined via local skill/subagent files the way
 * Claude Code's are, so Story 11.5's "if one exists" clause resolves to false for
 * Pi. This is a deliberate, confirmed scope boundary, not an unresolved gap.
 */
export async function syncKnownActorsFromActorsDirectory(
	pool: Pool,
	actorsDirectory: string,
	source = 'claude-skills'
): Promise<string[]> {
	let dirEntries;
	try {
		// Dirent.isDirectory() never follows symlinks, but every actor entry here
		// is documented above to typically BE a symlink -- so isDirectory()-only
		// filtering silently drops all of them. The stat() below (which does
		// follow symlinks) is what actually validates each entry resolves to a
		// real directory with a SKILL.md.
		dirEntries = (await readdir(actorsDirectory, { withFileTypes: true })).filter(
			(entry) => entry.isDirectory() || entry.isSymbolicLink()
		);
	} catch {
		return [];
	}

	const actors: string[] = [];
	for (const dirEntry of dirEntries) {
		const actor = dirEntry.name;
		if (actor.length === 0) {
			continue;
		}
		try {
			const skillFileStat = await stat(join(actorsDirectory, actor, 'SKILL.md'));
			if (!skillFileStat.isFile()) {
				continue;
			}
		} catch {
			continue;
		}
		actors.push(actor);
		await pool.query(
			`insert into spec_pipeline.known_actors (actor, source, updated_at)
			 values ($1, $2, now())
			 on conflict (actor) do update set source = excluded.source, updated_at = now()`,
			[actor, source]
		);
	}
	return actors;
}
