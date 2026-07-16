import { readdir } from 'node:fs/promises';

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
 * T6.4: boot-time known-actors registry sync. Scans `spec-templates/agents/*.md`
 * for agent names and upserts each into `known_actors` (`source =
 * 'spec-templates/agents'`), refreshing `updated_at` on every boot via `ON CONFLICT
 * (actor) DO UPDATE`.
 *
 * No Pi-equivalent local agent-definition directory exists to scan:
 * `packages/executors/src/index.ts`'s `PiExecutor` dynamically imports the
 * `@earendil-works/pi-coding-agent` npm package and calls its `createAgentSession`
 * API directly -- Pi agents are not defined via local markdown files the way Claude
 * Code's `spec-templates/agents/*.md` are, so Story 11.5's "if one exists" clause
 * resolves to false for Pi. This is a deliberate, confirmed scope boundary, not an
 * unresolved gap.
 */
export async function syncKnownActorsFromAgentDefinitions(
	pool: Pool,
	agentsDirectory: string,
	source = 'spec-templates/agents'
): Promise<string[]> {
	let entries: string[];
	try {
		entries = (await readdir(agentsDirectory, { withFileTypes: true }))
			.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
			.map((entry) => entry.name);
	} catch {
		return [];
	}

	const actors: string[] = [];
	for (const fileName of entries) {
		const actor = fileName.slice(0, fileName.length - '.md'.length);
		if (actor.length === 0) {
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
