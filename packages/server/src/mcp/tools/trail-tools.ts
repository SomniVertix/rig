import { z } from 'zod';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SpecRepositoryError, TrailRepository } from '@rig/persistence';

import type { McpToolContext } from '../tool-registry.js';
import { withGuardrails } from '../guardrails/index.js';
import { ACTOR_DESCRIPTION, auditFrom, jsonResult, withToolErrorHandling } from './tool-helpers.js';

/**
 * Trail tools: the MCP surface of the `discovery` schema (the trails domain the
 * grilling and wayfinder skills both write into — see
 * spec-templates/spec/db/schema.sql PART 2). A TRAIL is one effort to turn a loose
 * idea into a destination; a WAYPOINT is one question being driven to a decision
 * (sighted -> marked -> claimed -> reached | bypassed). Every call is implicitly
 * scoped to the MCP session's bound `project_id` — no tool call ever carries an
 * explicit project argument.
 *
 * Every write here runs known-actor validation and inserts exactly one
 * `audit_log` row (table_name schema-qualified, e.g. 'discovery.waypoints') in
 * the same transaction as its mutation, identical to every spec-pipeline write
 * tool (cross-schema touchpoint 3).
 */
export function registerTrailTools(server: McpServer, context: McpToolContext): void {
	const repository = new TrailRepository(context.pool, context.events, { claimTtlHours: context.claimTtlHours });

	const approachSchema = z.enum(['grilling', 'research', 'prototype', 'task']);

	// ---------------------------------------------------------------------------
	// Trails
	// ---------------------------------------------------------------------------

	server.registerTool(
		'create_trail',
		{
			description:
				"Starts a new trail (one effort to turn a loose idea into a destination), scoped to this session's bound project. Both a quick grilling conversation and a long wayfinder campaign use this same entity — a grill that turns out huge upgrades in place.",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				slug: z.string().min(1).describe('Kebab-case trail slug, unique within this project.'),
				title: z.string().min(1),
				trailheadPrompt: z.string().min(1).describe("The user's initial ask, largely verbatim."),
				destination: z.string().min(1).optional().describe('What reaching the end looks like; omit until named.'),
				notes: z.string().min(1).optional().describe('Domain, skills to consult, standing preferences for this effort.')
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['slug', 'title', 'trailheadPrompt'] }, async (args) => {
				const trail = await repository.createTrail(
					{
						projectId: context.projectId,
						slug: args.slug,
						title: args.title,
						trailheadPrompt: args.trailheadPrompt,
						destination: args.destination,
						notes: args.notes
					},
					auditFrom(context, args.actor)
				);
				return jsonResult({ trail });
			})
		)
	);

	server.registerTool(
		'get_trail',
		{
			description:
				'Fetches a trail with its full computed map: decisions so far (reached), the frontier (claimable next), fog of war (sighted), out of scope (bypassed), live claims, terminology, and dependency edges. Every section is derived live from waypoint status — nothing to drift.',
			inputSchema: { trailId: z.string().min(1) }
		},
		withToolErrorHandling(async (args) => {
			const map = await repository.getTrailMap(args.trailId);
			if (map === null || map.trail.projectId !== context.projectId) {
				return jsonResult({ error: 'not_found', message: `trail not found: ${args.trailId}` });
			}
			return jsonResult(map);
		})
	);

	server.registerTool(
		'get_trail_by_spec',
		{
			description:
				"Resolves a spec's discovery provenance: the trail whose outcome_spec_id points at it (at most one), with its reached waypoints in reached order (the decisions transcript), its bypassed waypoints (out-of-scope rulings, each carrying its bypassReason — the Non-Goals source), and its terminology. This is the requirements-compiler read path.",
			inputSchema: { specId: z.string().min(1) }
		},
		withToolErrorHandling(async (args) => {
			const trail = await repository.getTrailBySpec(args.specId);
			if (trail === null || trail.projectId !== context.projectId) {
				return jsonResult({ trail: null, decisions: [], outOfScope: [], terms: [] });
			}
			const [waypoints, terms] = await Promise.all([repository.listWaypoints(trail.id), repository.listTrailTerms(trail.id)]);
			const decisions = waypoints
				.filter((waypoint) => waypoint.status === 'reached')
				.sort((a, b) => (a.reachedAt ?? '').localeCompare(b.reachedAt ?? ''));
			const outOfScope = waypoints.filter((waypoint) => waypoint.status === 'bypassed');
			return jsonResult({ trail, decisions, outOfScope, terms });
		})
	);

	server.registerTool(
		'list_trails',
		{
			description: "Lists every trail that belongs to this session's bound project.",
			inputSchema: {}
		},
		withToolErrorHandling(async () => {
			const trails = await repository.listTrails(context.projectId);
			return jsonResult({ trails });
		})
	);

	server.registerTool(
		'update_trail',
		{
			description: "Updates a trail's title/destination/notes in place (e.g. naming the destination once it comes into view).",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				trailId: z.string().min(1),
				title: z.string().min(1).optional(),
				destination: z.string().min(1).optional(),
				notes: z.string().min(1).optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['title', 'destination', 'notes'] }, async (args) => {
				const input: Partial<{ title: string; destination: string; notes: string }> = {};
				if (args.title !== undefined) {
					input.title = args.title;
				}
				if (args.destination !== undefined) {
					input.destination = args.destination;
				}
				if (args.notes !== undefined) {
					input.notes = args.notes;
				}
				const trail = await repository.updateTrail(args.trailId, input, auditFrom(context, args.actor));
				return jsonResult({ trail });
			})
		)
	);

	server.registerTool(
		'complete_trail',
		{
			description:
				"Completes an active trail with its outcome. outcomeKind 'spec' REQUIRES specSlug + featureName: it creates the spec_pipeline spec AND links outcome_spec_id in one transaction (the handoff — the only write that crosses the schema boundary). 'decision' records a locked decision with nothing further to build; 'change' records a change made in place along the way.",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				trailId: z.string().min(1),
				outcomeKind: z.enum(['spec', 'decision', 'change']),
				outcomeSummary: z.string().min(1).optional().describe('Prose record of what the trail yielded.'),
				specSlug: z.string().min(1).optional().describe("Kebab-case slug for the created spec (outcomeKind 'spec' only)."),
				featureName: z.string().min(1).optional().describe("Human-readable feature name for the created spec (outcomeKind 'spec' only).")
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['outcomeSummary', 'specSlug', 'featureName'] }, async (args) => {
				if (args.specSlug !== undefined && args.featureName === undefined) {
					throw new SpecRepositoryError('spec_input_required', 'complete_trail: featureName is required alongside specSlug');
				}
				const result = await repository.completeTrail(
					args.trailId,
					{
						outcomeKind: args.outcomeKind,
						outcomeSummary: args.outcomeSummary,
						spec:
							args.specSlug !== undefined && args.featureName !== undefined
								? { slug: args.specSlug, featureName: args.featureName }
								: undefined
					},
					auditFrom(context, args.actor)
				);
				return jsonResult(result);
			})
		)
	);

	server.registerTool(
		'abandon_trail',
		{
			description: 'Consciously stops a trail short of its destination, optionally recording why in outcomeSummary.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				trailId: z.string().min(1),
				outcomeSummary: z.string().min(1).optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['outcomeSummary'] }, async (args) => {
				const trail = await repository.abandonTrail(args.trailId, args.outcomeSummary, auditFrom(context, args.actor));
				return jsonResult({ trail });
			})
		)
	);

	// ---------------------------------------------------------------------------
	// Waypoints
	// ---------------------------------------------------------------------------

	server.registerTool(
		'add_waypoint',
		{
			description:
				"Adds a waypoint (one question driven to a decision); waypoint_number is assigned max+1. Default status is 'marked' (claimable); sighted: true drops it in the fog instead. Passing resolution + resolutionGist inserts directly at 'reached' — the grilling rhythm: one call records question and answer in the same breath. A sighted waypoint cannot carry a resolution.",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				trailId: z.string().min(1),
				title: z.string().min(1).describe('Refer-by-name: the short name humans and narration use.'),
				question: z.string().min(1),
				approach: approachSchema.optional().describe('Hint for the resolving session; omit to decide when claimed.'),
				sighted: z.boolean().optional().describe('true = fog: the question cannot be stated sharply yet. Not claimable.'),
				resolution: z.string().min(1).optional().describe('The full answer, stated plainly enough to build from. Requires resolutionGist.'),
				resolutionGist: z.string().min(1).optional().describe('One-line "Decisions so far" index entry. Requires resolution.'),
				rationale: z.string().min(1).optional(),
				reachedIn: z.string().min(1).optional().describe('Provenance stamp: identifier of the conversation that resolved it.')
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['title', 'question', 'resolution', 'resolutionGist'] }, async (args) => {
				if ((args.resolution === undefined) !== (args.resolutionGist === undefined)) {
					throw new SpecRepositoryError(
						'resolution_incomplete',
						'add_waypoint: resolution and resolutionGist are both required when either is provided'
					);
				}
				const waypoint = await repository.addWaypoint(
					args.trailId,
					{
						title: args.title,
						question: args.question,
						approach: args.approach,
						sighted: args.sighted,
						resolution:
							args.resolution !== undefined && args.resolutionGist !== undefined
								? { resolution: args.resolution, resolutionGist: args.resolutionGist, rationale: args.rationale, reachedIn: args.reachedIn }
								: undefined
					},
					auditFrom(context, args.actor)
				);
				return jsonResult({ waypoint });
			})
		)
	);

	server.registerTool(
		'update_waypoint',
		{
			description:
				"Edits a waypoint's title/question/approach in place. mark: true graduates sighted -> marked (sharpening a fog patch into a claimable question) — the only status change this tool makes; every other transition has its own verb.",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				waypointId: z.string().min(1),
				title: z.string().min(1).optional(),
				question: z.string().min(1).optional(),
				approach: approachSchema.optional(),
				mark: z.boolean().optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['title', 'question'] }, async (args) => {
				const input: Partial<{ title: string; question: string; approach: 'grilling' | 'research' | 'prototype' | 'task'; mark: boolean }> = {};
				if (args.title !== undefined) {
					input.title = args.title;
				}
				if (args.question !== undefined) {
					input.question = args.question;
				}
				if (args.approach !== undefined) {
					input.approach = args.approach;
				}
				if (args.mark !== undefined) {
					input.mark = args.mark;
				}
				const waypoint = await repository.updateWaypoint(args.waypointId, input, auditFrom(context, args.actor));
				return jsonResult({ waypoint });
			})
		)
	);

	server.registerTool(
		'claim_waypoint',
		{
			description:
				'Atomically claims a marked waypoint for a resolving conversation. A claim older than the server claim TTL (RIG_CLAIM_TTL) is stale and reclaimable in the same statement; a live claim rejects with already_claimed.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				waypointId: z.string().min(1),
				claimedBy: z.string().min(1).describe('Session identifier of the claiming conversation.')
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['claimedBy'] }, async (args) => {
				const waypoint = await repository.claimWaypoint(args.waypointId, args.claimedBy, auditFrom(context, args.actor));
				return jsonResult({ waypoint });
			})
		)
	);

	server.registerTool(
		'release_waypoint',
		{
			description: "Manually releases a claimed waypoint back to 'marked' — claim recovery usable any time, without waiting out the TTL.",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				waypointId: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const waypoint = await repository.releaseWaypoint(args.waypointId, auditFrom(context, args.actor));
				return jsonResult({ waypoint });
			})
		)
	);

	server.registerTool(
		'reach_waypoint',
		{
			description:
				"Resolves a waypoint into a decision (terminal). Legal from 'marked' (grilling — no claim step) or 'claimed' (wayfinder). resolutionGist becomes the one-line \"Decisions so far\" index entry; reachedIn stamps which conversation resolved it.",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				waypointId: z.string().min(1),
				resolution: z.string().min(1).describe('The full answer, stated plainly enough to build from without re-reading the conversation.'),
				resolutionGist: z.string().min(1),
				rationale: z.string().min(1).optional(),
				reachedIn: z.string().min(1).optional()
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['resolution', 'resolutionGist'] }, async (args) => {
				const waypoint = await repository.reachWaypoint(
					args.waypointId,
					{ resolution: args.resolution, resolutionGist: args.resolutionGist, rationale: args.rationale, reachedIn: args.reachedIn },
					auditFrom(context, args.actor)
				);
				return jsonResult({ waypoint });
			})
		)
	);

	server.registerTool(
		'bypass_waypoint',
		{
			description:
				'Consciously routes around a waypoint (out of scope, terminal), with a required reason. Legal from any non-terminal status, including sighted. Bypassed unblocks dependents just like reached — a scope ruling never deadlocks the frontier.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				waypointId: z.string().min(1),
				bypassReason: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['bypassReason'] }, async (args) => {
				const waypoint = await repository.bypassWaypoint(args.waypointId, args.bypassReason, auditFrom(context, args.actor));
				return jsonResult({ waypoint });
			})
		)
	);

	server.registerTool(
		'get_frontier',
		{
			description:
				'The edge of the known: marked (or stale-claimed) waypoints whose blockers have all terminated (reached or bypassed), in waypoint_number order. What a fresh conversation asks when it says "what should I work on next?"',
			inputSchema: { trailId: z.string().min(1) }
		},
		withToolErrorHandling(async (args) => {
			const frontier = await repository.getFrontier(args.trailId);
			return jsonResult({ frontier });
		})
	);

	// ---------------------------------------------------------------------------
	// Dependency edges
	// ---------------------------------------------------------------------------

	server.registerTool(
		'add_waypoint_dependency',
		{
			description:
				'Adds a dependency edge: "from" blocks "to" — from must terminate (reached or bypassed) before to is frontier-eligible. Both waypoints must belong to the same trail; edges that would close a cycle are rejected.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				fromWaypointId: z.string().min(1),
				toWaypointId: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				const edge = await repository.addWaypointDependency(args.fromWaypointId, args.toWaypointId, auditFrom(context, args.actor));
				return jsonResult({ edge });
			})
		)
	);

	server.registerTool(
		'remove_waypoint_dependency',
		{
			description: 'Deletes a waypoint dependency edge.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				edgeId: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, {}, async (args) => {
				await repository.removeWaypointDependency(args.edgeId, auditFrom(context, args.actor));
				return jsonResult({ deleted: true, id: args.edgeId });
			})
		)
	);

	// ---------------------------------------------------------------------------
	// Assets
	// ---------------------------------------------------------------------------

	server.registerTool(
		'add_waypoint_asset',
		{
			description:
				'Records what resolving a waypoint produced. Provide exactly one of contentMarkdown (a document stored whole — no local files) or repoPath (a prototype committed on main — no branches or worktrees, ever). commitSha only accompanies repoPath.',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				waypointId: z.string().min(1),
				kind: z.string().min(1).describe("e.g. 'research_summary', 'analysis', 'prototype_ref' (open set)."),
				title: z.string().min(1),
				contentMarkdown: z.string().min(1).optional(),
				repoPath: z.string().min(1).optional().describe('Repo-relative path on main.'),
				commitSha: z.string().min(1).optional().describe('The main-branch commit that contains it.')
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['kind', 'title', 'contentMarkdown', 'repoPath'] }, async (args) => {
				const asset = await repository.addWaypointAsset(
					args.waypointId,
					{ kind: args.kind, title: args.title, contentMarkdown: args.contentMarkdown, repoPath: args.repoPath, commitSha: args.commitSha },
					auditFrom(context, args.actor)
				);
				return jsonResult({ asset });
			})
		)
	);

	server.registerTool(
		'list_waypoint_assets',
		{
			description: "Lists a waypoint's assets in ordinal order.",
			inputSchema: { waypointId: z.string().min(1) }
		},
		withToolErrorHandling(async (args) => {
			const assets = await repository.listWaypointAssets(args.waypointId);
			return jsonResult({ assets });
		})
	);

	// ---------------------------------------------------------------------------
	// Trail terms
	// ---------------------------------------------------------------------------

	server.registerTool(
		'add_trail_term',
		{
			description: 'Pins down a piece of terminology for this trail (per-trail; a project-level glossary is consciously deferred).',
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				trailId: z.string().min(1),
				term: z.string().min(1),
				definition: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['term', 'definition'] }, async (args) => {
				const term = await repository.addTrailTerm(args.trailId, args.term, args.definition, auditFrom(context, args.actor));
				return jsonResult({ term });
			})
		)
	);

	server.registerTool(
		'update_trail_term',
		{
			description: "Sharpens a trail term's definition in place.",
			inputSchema: {
				actor: z.string().min(1).describe(ACTOR_DESCRIPTION),
				id: z.string().min(1),
				definition: z.string().min(1)
			}
		},
		withToolErrorHandling(
			withGuardrails(context.pool, { notBlank: ['definition'] }, async (args) => {
				const term = await repository.updateTrailTerm(args.id, args.definition, auditFrom(context, args.actor));
				return jsonResult({ term });
			})
		)
	);
}
