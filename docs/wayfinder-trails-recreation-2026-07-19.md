# Wayfinder trails — recreation reference (2026-07-19)

**Why this file exists:** on 2026-07-19, a session tearing down the old
`relentless`-named Postgres volume (as part of finishing the Rig rebrand's
deferred DB-rename step) ran `docker compose down -v` against the wrong
mental model and wiped the *entire* `rig` Postgres database — not just
disposable data, but the live `spec_pipeline` and `discovery` schemas backing
every wayfinder trail and spec in this project. The `rig-rebrand-and-
workspace-binding` trail was rebuilt from the conversation transcript that
same session (see Trail A below) and is alive in the DB again as of this
writing. But a second trail that was *referenced* throughout that work —
`rig-workspace-binding` — turns out to have **never actually been created**
as a real trail entity (it was only ever a bypass-reason pointer), and a
`workspace-based-project-binding` **spec** that briefly existed was wiped
along with everything else while still empty (`requirements`/`not_started`,
no real content). Neither can be "recreated" from the database — they must
be built fresh, using the context in this file.

This file is the safety net: if the database is ever wiped again before
`rig-workspace-binding` is chartered, everything needed to redo this
cleanly — without re-deriving the design from scratch — lives here.

---

## Trail A: `rig-rebrand-and-workspace-binding` (COMPLETE, live in DB)

As of 2026-07-19 this trail exists in the `development` project with:
- `trailId`: `6433c139-45b9-4d7b-a542-8c4cdadcbb14`
- `projectId`: `70612970-9fd8-49b8-bff2-42edc132108d`
- `status`: `complete`, `outcomeKind`: `change`

If this ever needs recreating again (e.g. another accidental volume wipe),
this section is the exact recipe: call `create_trail`, then `add_waypoint`
ten times **in this exact order** (waypoint numbers are assigned
`max+1` in insertion order, so order matters for the numbering to come out
1–10 as below), then `bypass_waypoint` on W9/W10, then wire all 10 edges,
then `add_trail_term`, then `complete_trail`. All text below is verbatim —
copy it exactly, don't paraphrase.

### create_trail

```
actor: wayfinder
slug: rig-rebrand-and-workspace-binding
title: Rebrand to Rig + VS Code-workspace-centered spec ecosystem
trailheadPrompt: |
  Let's work through some big changes for relentless: 1. Rebrand the
  relentless application to Rig (fits the overall application goal better).
  2. Have the spec ecosystem we've built be centered around VS Code
  workspaces (research VS Code workspace options). 3. Update any/all local
  skills, documents, and agents to use/point to the right MCP built for Rig.
destination: |
  Every relentless-branded identifier (repo, npm packages, MCP tool prefix,
  env vars, docker/infra, GitHub remote, local folder) is renamed to Rig per
  an agreed mapping; the spec ecosystem's MCP project binding is redesigned
  to follow a VS Code workspace instead of a per-repo URL slug; and every
  local skill, agent, and mirrored template file is updated to reference the
  new mcp__rig__* MCP and the current binding model. Nothing left to decide
  or update: codebase, infra, GitHub repo, local folder, and all local
  skills/agents match the new Rig identity.
notes: |
  Domain: "relentless" is an AI workflow engine + spec-driven dev pipeline
  monorepo at /Users/somniactic/Development/relentless (npm workspace
  "relentless-monorepo"; MCP tool server + Postgres + web dashboard) — the
  very source of the mcp__relentless__* tools this session used to chart
  this trail. Rig = the broader product/platform this tool is becoming one
  part of; user chose a full technical rename, not cosmetic-only.

  New home: github.com/SomniVertix/rig (already created by the user; plan is
  copy-paste, not a GitHub repo-rename) and local folder ~/Development/rig
  (renamed from ~/Development/relentless).

  Rename surface found during recon: packages/*/package.json names;
  docker-compose.yml env vars (RELENTLESS_DEFAULT_EXECUTOR,
  RELENTLESS_MCP_BEARER_TOKEN, RELENTLESS_MCP_PORT, RELENTLESS_LOG_LEVEL,
  RELENTLESS_WEB_PORT, RELENTLESS_ACTORS_DIR, RELENTLESS_CLAUDE_HOST_DIR,
  RELENTLESS_CLAIM_TTL, RELENTLESS_DEFAULT_MODEL,
  RELENTLESS_CONCURRENCY_CAP) + Postgres DB name "relentless";
  .env/.env.example; .mcp.json (server key "relentless" + URL path
  /mcp/relentless); MCP tool prefix + McpServer name in
  packages/server/src/mcp/*; actors dir (~/.claude/relentless-actors
  symlink farm + RELENTLESS_ACTORS_DIR mount); README/FUNCTIONALITY.md/
  KNOWN-ISSUES.md. Local skills referencing relentless:
  ~/.claude/skills/{wayfinder,grilling,design-drafter,tasks-drafter,
  requirements-compiler,spec-implementation-orchestrator}/SKILL.md. Local
  agents: ~/.claude/agents/{design-drafter,tasks-drafter,
  spec-implementation-orchestrator,requirements-compiler,README}.md. These
  are mirrored inside the repo at spec-templates/agents/*.md and
  spec-templates/spec/README.md — FUNCTIONALITY.md notes both copies must
  match.

  Current project binding (packages/server/src/mcp/session.ts): each MCP
  session binds to a project via a `:projectSlug` baked into the URL path of
  each repo's own .mcp.json (e.g. /mcp/relentless) — not literally
  cwd-based, but per-repo-config-based. User's ask for VS Code-workspace-
  centering: project binding should instead follow a VS Code workspace (so
  multiple repos opened in one multi-root workspace share one project)
  rather than being fixed per-repo.

  Skills to consult when walking: /grilling and /domain-modeling for
  decision-shaped waypoints; /prototype not expected to be needed.

  EXECUTION OVERRIDE (plan-don't-do is relaxed here): this trail carries
  execution, not just decisions. Task waypoints should actually perform the
  rename/migration/doc-update work once naming (and, where relevant, the
  workspace-binding design) is settled — a full requirements→design→tasks→
  implementation spec pipeline is unnecessary overhead for a rebrand +
  doc-update effort. Default complete_trail to outcomeKind "change" when
  done. If the VS Code workspace-binding redesign turns out to be
  substantial new-feature work in its own right, flag that explicitly
  rather than silently forcing it through this trail's task waypoints — it
  may deserve its own spec instead.
```

### W1 — Define the Rig rename mapping (`add_waypoint`, approach: grilling)

question: `What is the exact new name for every relentless-branded identifier — repo/npm package & workspace names, MCP server key + tool prefix (mcp__relentless__* → ?), env var prefix (RELENTLESS_* → ?), docker service/image/network/DB names, bearer token var, actors dir name, local dot-dir (.relentless → ?), and any other relentless-branded string — mapped old to new?`

resolution:
```
Full old→new mapping for the Rig rename, verified against the actual current identifiers in the repo (2026-07-18 recon). Capitalization convention mirrors the existing relentless/RELENTLESS pattern: `Rig` in prose/display, `rig` lowercase in identifiers/slugs/paths, `RIG` uppercase in env vars.

**npm packages** (user confirmed: keep scoped convention)
- Root `package.json` name: `relentless-monorepo` → `rig-monorepo` (user confirmed: keep the `-monorepo` suffix rather than bare `rig`, since these packages are workspace-local and never published — no collision risk either way, but this preserves the existing convention 1:1).
- Scope: `@relentless/*` → `@rig/*` for all 9 packages: `@rig/library`, `@rig/persistence`, `@rig/server`, `@rig/engine`, `@rig/test-support`, `@rig/executors`, `@rig/web`, `@rig/proto`, `@rig/schema`. All internal `workspace:*` cross-deps update in lockstep (mechanical rename, no new deps).

**Postgres**
- `POSTGRES_DB` / `DATABASE_URL` path (docker-compose.yml): `relentless` → `rig`.

**Env vars** (docker-compose.yml, Dockerfile, .env.example, packages/server/src/config/*) — uniform prefix swap `RELENTLESS_` → `RIG_` across all found instances: `RIG_DEFAULT_EXECUTOR`, `RIG_MCP_BEARER_TOKEN`, `RIG_MCP_PORT`, `RIG_LOG_LEVEL`, `RIG_WEB_PORT`, `RIG_ACTORS_DIR`, `RIG_CLAUDE_HOST_DIR`, `RIG_CLAIM_TTL`, `RIG_DEFAULT_MODEL`, `RIG_CONCURRENCY_CAP`, `RIG_SKILLS_HOST_DIR`, `RIG_MCP_HOST`, `RIG_WEB_HOST`, `RIG_WORKSPACE_ROOT`, `RIG_CONFIG`, `RIG_MIRROR_ROOT`, `RIG_LIBRARY_SEARCH_PATHS`, `RIG_MAX_NODE_EXECUTIONS`, `RIG_DEFAULT_TIMEOUT_MS`. (Note: `RIG_WORKSPACES_DIR`, the new env var introduced by W3's workspace-binding design, already follows this convention natively — no rename needed for it.)

**MCP surface**
- `.mcp.json` server key: `"relentless"` → `"rig"` — this is what drives the client-visible tool prefix `mcp__relentless__*` → `mcp__rig__*` (no server-side tool-name code change needed; the prefix is derived client-side from the config key). Every repo/workspace `.mcp.json` that registers this server must use the new key.
- `McpServer({ name: 'relentless-spec-pipeline' })` in `packages/server/src/mcp/session.ts:49` → `'rig-spec-pipeline'` (protocol-level server identity, separate from but should match the branding of the tool-prefix key).

**Filesystem paths**
- Actors dir: `~/.claude/relentless-actors` → `~/.claude/rig-actors`; container mount path `/claude/relentless-actors` → `/claude/rig-actors`.
- Local dot-dir (still-live paths, not the removed wayfinder file store): `.relentless/{agents,prompts,workflows,runs,specs}` → `.rig/{agents,prompts,workflows,runs,specs}` in `packages/server/src/composition/build-composition.ts`, `packages/server/src/rpc/index.ts`, `packages/persistence/src/library-store.ts`, `packages/library/src/index.ts`, and doc mentions in FUNCTIONALITY.md / spec-templates.
- GitHub remote and local repo folder: already settled in trail notes — `github.com/SomniVertix/rig` (copy-paste migration, already created) and `~/Development/rig` (renamed from `~/Development/relentless`). Not re-litigated here.

**Proto / generated code / bundled workflow**
- `packages/proto/proto/relentless.proto` → `rig.proto`; its generated output `packages/proto/src/generated/relentless.ts` → `rig.ts` (regenerated, not hand-renamed).
- Bundled default workflow `packages/library/bundled/workflows/relentless-default.yaml` (id `relentless-default`) → `rig-default.yaml` (id `rig-default`).

**Docker services/images/networks**: no rename needed beyond the env vars and DB name above — docker-compose.yml doesn't hardcode "relentless" into service names, image names, or network names; Compose derives the project name from the directory, which the local-folder rename (`~/Development/rig`) already covers.

**Prose docs**: README.md (none currently at repo root — N/A), FUNCTIONALITY.md, KNOWN-ISSUES.md, FEATURE-PLANS.md — all "relentless"/"Relentless" mentions updated to "rig"/"Rig" per this mapping when the execution waypoints touch them.

This mapping is the single source of truth for every downstream rename/execution waypoint in this trail — apply it verbatim rather than re-deciding names file-by-file.
```

resolutionGist: `Full relentless→rig mapping: npm scope @relentless/*→@rig/* (root pkg relentless-monorepo→rig-monorepo), Postgres DB relentless→rig, env prefix RELENTLESS_*→RIG_* (19 vars), .mcp.json server key relentless→rig (drives mcp__relentless__*→mcp__rig__* tool prefix client-side), McpServer name relentless-spec-pipeline→rig-spec-pipeline, actors dir relentless-actors→rig-actors, dot-dir .relentless→.rig, proto/workflow files relentless.proto/relentless-default.yaml→rig.proto/rig-default.yaml. GitHub remote + local folder already settled in trail notes. Docker service/image/network names need no separate rename (not currently branded).`

rationale: `Read the actual current identifiers across package.json files, docker-compose.yml, Dockerfile, .env.example, .mcp.json, and MCP source (session.ts, tool-registry.ts) rather than working from the trail notes' recon summary alone, to catch anything the earlier pass missed (found: proto file, bundled workflow name, additional env vars beyond the notes' list). Asked the user to resolve the two genuinely ambiguous points (npm scope style, root package name) via direct choice since everything else was a mechanical 1:1 substitution with no real decision content.`

reachedIn: `wayfinder-session-2026-07-18-w1-rename-mapping`

### W2 — Research VS Code workspace mechanisms for project binding (`add_waypoint`, approach: research)

question: `What mechanisms does VS Code (multi-root .code-workspace files, the MCP "roots" capability, .mcp.json variable substitution, or other client-side signals) offer for communicating workspace identity to an MCP server, and which one(s) could replace relentless's current per-repo URL-slug project binding (packages/server/src/mcp/session.ts) so that multiple repos opened together in one VS Code workspace share a single project?`

resolution:
```
VS Code has no built-in way to expose a multi-root workspace's stable identity to a remote MCP server. The only durable workspace identifier (`vscode.workspace.workspaceFile`, the .code-workspace file's own URI) is visible only to extensions — no MCP-config variable exposes it (${workspaceFolder} is per-folder, not per-workspace; no ${workspaceFile} equivalent exists). The MCP protocol does define a `roots` capability (client sends the client's workspace folder URIs to the server via roots/list) that maps well conceptually onto multi-root workspaces, but VS Code's implementation is undocumented for multi-root behavior, absent from VS Code's own June 2025 "full spec support" announcement, and has an open unresolved bug report showing roots not being delivered over stdio or SSE. Adopting roots would also require rearchitecting relentless's session.ts, since project binding there happens synchronously at connection time from the URL path, before an MCP `initialize` handshake (which is a prerequisite for roots/list) completes.

Five candidate mechanisms were identified and ranked (full detail + tradeoff table in the attached research_summary asset — NOTE: that asset was never actually attached via add_waypoint_asset before the wipe, so only this prose summary survives):
A. Shared projectSlug convention — every repo's own .mcp.json in the workspace manually points at the same URL/slug. Zero new code, works today, but manual sync risk across N files.
B. Custom VS Code extension reads workspace.workspaceFile, derives a stable slug, and injects it (via header or by rewriting each registered MCP server's URL) so binding is automatic and workspace-scoped. Requires a small server-side change (accept slug via header) plus building/maintaining an extension.
C. MCP roots — deprioritized: unreliable in VS Code today and requires a nontrivial rearchitecture of session.ts's connection-time binding for a payoff that isn't reliably delivering yet.
D. Manual per-repo HTTP header carrying workspace path — same manual-sync drawback as A, just header instead of URL.
E. Server-side inference from git-remote/org metadata against a user-declared workspace registry — no client signal needed, but relies on server-side heuristics and a new registry.

Recommendation for the follow-up design waypoint (W3): ship A (shared-slug convention) first as a zero-code MVP to validate the product value of shared-project binding, then build B (companion extension) as the real long-term mechanism, since it's the only option with a single automatic source of truth that works uniformly over HTTP and doesn't depend on VS Code's unreliable roots support.
```

resolutionGist: `VS Code exposes no stable workspace identity to a remote MCP server by default; MCP roots is spec-defined but unreliable in VS Code and would need a session.ts rearchitecture. Recommended path: shared-projectSlug convention as a zero-code MVP now, a small companion VS Code extension (reading workspace.workspaceFile) as the real long-term fix.`

rationale: `Researched VS Code's multi-root workspace file format/identity model, the MCP roots capability's spec definition and VS Code's (unreliable, undocumented) support for it, and VS Code's native MCP config/variable-substitution mechanisms, then ranked five candidate binding mechanisms on extension requirement, HTTP-transport viability, drift risk, and server-side change cost.`

reachedIn: `wayfinder-session-2026-07-18-w2-research`

**depends on:** nothing (frontier from start)

### W3 — Design workspace-based project binding (`add_waypoint`, approach: grilling) — **THE CORE DESIGN — this is what rig-workspace-binding must build**

question: `Given the VS Code workspace research findings, how should MCP session→project binding change from a static per-repo URL projectSlug to something derived from the active VS Code workspace, and what's the transition/compat story for projects already bound the old way?`

resolution:
```
Workspace-based project binding replaces relentless's current per-repo URL-slug model entirely, as follows:

1. **Discovery**: a new server-side env var `RIG_WORKSPACES_DIR` (mounted into the server container the same way `RELENTLESS_CLAUDE_HOST_DIR` is today) points at a root directory. The server recursively scans it for `.code-workspace` files. The directory is curated by the user to contain only workspace definitions, so no marker-file filtering is needed beyond "find every .code-workspace file."

2. **Identity lives in the file, not its path**: each `.code-workspace` file carries a custom top-level `rig` field (VS Code tolerates unrecognized top-level keys), e.g. `"rig": {"projectId": "backend-workspace"}`. This makes identity durable across renames/moves of the file — unlike deriving identity from the file's path. On first scan of a file lacking this field, the server auto-generates one: a slug derived from the filename, with a numeric suffix appended only if that slug collides with an existing one (not a UUID — kept human-troubleshootable) — and writes it back into the file. Subsequent scans read the existing field back idempotently and match/auto-provision the corresponding Postgres project row (replacing today's `ensureProject(pool, projectSlug)` call, which was keyed off the URL path segment).

3. **Single-repo projects are just one-folder workspaces**: this resolves the transition/compat question directly — there's no separate "standalone repo" fallback path to design or maintain. A repo that wants Rig on its own simply gets its own trivial `.code-workspace` file (`folders: [{path: "."}]`) with the same auto-injected `rig.projectId` field. One mechanism covers both single- and multi-repo cases.

4. **Transport — a shared local resolver, not direct-to-HTTP config, for all three clients**: because it's unverified whether VS Code can read a custom JSON field out of a `.code-workspace` file into its own MCP config, the design routes VS Code, Claude Code CLI, and Pi through the same small local resolver process rather than assuming VS Code has special native capability. Each client's MCP entry launches this resolver via a stdio `command` (VS Code's MCP client already supports local stdio servers, same as Claude Code/Pi). The resolver: walks up from its own launch location to find the nearest `.code-workspace` file (same pattern as git finding `.git`), reads `rig.projectId`, and proxies the MCP session to the real Rig HTTP server with that ID attached as a header.

5. **Per-repo `.mcp.json` is retired.** Clients are configured to launch the resolver from a workspace-rooted location (or any location inside a workspace's folder tree) instead of each repo carrying its own standalone HTTP-pointing config.

Why this over the alternatives considered: a fully global static MCP config was ruled out because none of the three clients can dynamically inject "which workspace am I in" into a truly single shared config today (no native `${workspaceFile}`-equivalent in VS Code, no workspace concept in Claude Code CLI/Pi beyond cwd). MCP's `roots` capability was ruled out per the W2 research (undocumented multi-root behavior, an open unresolved VS Code bug report showing it not delivering over stdio/SSE, and it would require rearchitecting session.ts's connection-time binding). Server-side OS-level path discovery (matching a TCP connection to a client PID's cwd) was ruled out because the server runs inside a Docker container while clients run on the host — no shared process namespace for any `/proc/pid/cwd`-style introspection, and it would be fragile/insecure even without containerization.

Flag for the next session: this has grown from a binding-config decision into real new-feature engineering — a recursive scanner with file-mutation, and a new local resolver/proxy component. Per this trail's execution-override notes, that may be substantial enough to warrant its own formal spec (requirements → design → tasks → implementation) rather than being executed as informal task waypoints in this rebrand-focused trail — worth deciding explicitly before implementation starts. **[As of 2026-07-19: this decision still has not been made — it's the first thing rig-workspace-binding needs to settle.]**
```

resolutionGist: `Workspace binding: server recursively scans RIG_WORKSPACES_DIR for .code-workspace files, each carrying a durable auto-injected rig.projectId field (filename-derived slug, collision-suffixed, not a UUID); a single shared local resolver process (launched via stdio by VS Code, Claude Code CLI, and Pi alike) finds the nearest .code-workspace file and forwards its projectId to the real HTTP server as a header. Single-repo projects are just one-folder workspaces — no separate legacy path. Per-repo .mcp.json is retired.`

rationale: `Ruled out a fully global MCP config (no client can dynamically inject workspace identity into it today), MCP roots (unreliable in VS Code per W2 research, requires rearchitecting session.ts), and server-side OS introspection (impossible across the Docker container boundary). Converged on identity-in-file (survives renames) + a uniform local resolver (avoids relying on unverified VS Code-specific field-embedding support) after walking through each mechanism's concrete failure mode with the user.`

reachedIn: `wayfinder-session-2026-07-18-w3-design`

**depends on:** W2

### W4 — Migrate the repo to its new home (`add_waypoint`, approach: task)

question: `Copy the (renamed) codebase into github.com/SomniVertix/rig, rename the local working folder to ~/Development/rig, and repoint git remotes and any hardcoded local paths.`

resolution: (see git history / commit ec5ea56 and surrounding commits for full detail — this waypoint is historical scaffolding, not needed to build rig-workspace-binding. Full verbatim text is in the live DB trail as of 2026-07-19; omitted here for brevity since it has no bearing on the workspace-binding work.)

resolutionGist: `Committed the ~6800 lines of unrelated uncommitted work as 5 logical commits first, then renamed ~/Development/relentless→~/Development/rig, repointed origin to github.com/SomniVertix/rig (copy-paste, old repo untouched), and pushed main + a stray branch. Also fixed two rename side-effects: pinned docker-compose's project name to avoid orphaning the existing Postgres volume, and fixed two stale absolute paths in local (gitignored) Claude settings.`

reachedIn: `wayfinder-session-2026-07-18-w4-migrate-repo`

**depends on:** W1

### W5 — Apply the rename across code and infra (`add_waypoint`, approach: task)

resolutionGist: `Applied W1's relentless->rig mapping across the whole monorepo (npm scope, env vars, .mcp.json key, MCP server name, actors-dir, .rig dot-dir, proto package, bundled default workflow, docs/templates) via commit 7833de5, pushed to origin/main. Deliberately left the .mcp.json URL project-slug alone (this server hosts multiple unrelated projects) and the Postgres DB/volume rename as a documented manual migration step rather than live execution. Validated via clean typecheck + 109/109 passing unit tests.`

(Full verbatim resolution is in the live DB trail — omitted here, not needed for rig-workspace-binding.)

reachedIn: `wayfinder-session-2026-07-18-w5-apply-rename`

**depends on:** W1

### W6 — Update local skills, agents, and mirrored spec-templates (`add_waypoint`, approach: task)

resolutionGist: `Renamed mcp__relentless__* -> mcp__rig__* and relentless->rig prose across all ~/.claude/skills/*/SKILL.md, ~/.claude/agents/*.md, and their repo mirrors (spec-templates/agents/*.md, spec-templates/spec/README.md), committed as 1e884f0 and pushed. Left "relentlessly" (an ordinary adverb) and all "bound project"/binding-model conceptual wording untouched — the latter is W7's job.`

reachedIn: `wayfinder-session-2026-07-18-w6-update-skills-agents`

**depends on:** W1

### W7 — Reconcile binding wording in skill docs with the resolver design (`add_waypoint`, approach: task)

resolutionGist: `Checked the workspace-based-project-binding spec first: still requirements/not_started, so the actual resolver mechanism doesn't exist yet — the current binding is still the per-repo .mcp.json URL slug. User confirmed docs should describe the new model as planned/future, not present fact. Added a short "today vs. planned" note (pointing at the workspace-based-project-binding spec) to wayfinder/SKILL.md and spec-templates/spec/README.md (committed 14c9b1d, pushed) rather than rewriting existing text.`

**IMPORTANT for rig-workspace-binding:** the note added to `~/.claude/skills/wayfinder/SKILL.md` and `spec-templates/spec/README.md` still points at the `workspace-based-project-binding` spec by name/id. That spec no longer exists (wiped, was empty anyway). Once rig-workspace-binding produces a real spec or trail, **update that note** to point at whatever the new spec/trail is actually called, so the doc doesn't dangle.

reachedIn: `wayfinder-session-2026-07-18-w7-reconcile-binding-wording`

**depends on:** W1, W10

### W8 — External references to the old relentless name (`add_waypoint`, approach: task)

resolutionGist: `Swept ~/Development, global ~/.claude config, shell rc, cron, and launchd for external "relentless" references. Fixed the one safe mechanical one directly (~/Development/.mcp.json server key relentless->rig). Left everything else for the user: a stray empty ~/Development/relentless/ leftover dir, the deprecated ~/Development/.relentless/ file-store archive, a likely-broken mi-pi repo test asserting the old file-store layout, stale-but-inert permission entries in ~/Development/.claude/settings*.json, and whether to add a "moved" notice to the untouched old GitHub repo.`

reachedIn: `wayfinder-session-2026-07-18-w8-external-refs`

**depends on:** nothing

### W9 — Implement server-side workspace scan and identity auto-injection (`add_waypoint`, approach: task, `sighted: true` then `bypass_waypoint`)

question: `Build the RIG_WORKSPACES_DIR recursive scanner: discover .code-workspace files, auto-generate and write back a collision-safe rig.projectId field into files that lack one, and auto-provision/match the corresponding Postgres project row (replacing today's URL-slug ensureProject call in packages/server/src/mcp/session.ts).`

bypassReason: `Real new-feature engineering (recursive scanner that mutates user files + Postgres project-matching), not a rename task — moved to its own trail/spec ("rig-workspace-binding") for proper requirements/design/tasks treatment rather than being executed as an informal task waypoint here. See trail rig-workspace-binding for the implementation.`

**depends on:** W1, W3 — **this exact question is rig-workspace-binding's first real waypoint.**

### W10 — Build the workspace-identity resolver process (`add_waypoint`, approach: task, `sighted: true` then `bypass_waypoint`)

question: `Build the small local resolver that VS Code, Claude Code CLI, and Pi all launch via stdio: walks up from its launch location to find the nearest .code-workspace file, reads rig.projectId, and proxies the MCP session to the real HTTP server with that ID attached as a header — replacing direct per-repo HTTP .mcp.json entries.`

bypassReason: `Real new-feature engineering (a new local resolver/proxy binary shared by three clients), not a rename task — moved to its own trail/spec ("rig-workspace-binding") for proper requirements/design/tasks treatment rather than being executed as an informal task waypoint here. See trail rig-workspace-binding for the implementation.`

**depends on:** W1, W3 — **this exact question is rig-workspace-binding's second real waypoint.**

### Edges (`add_waypoint_dependency`, from → to, by waypoint number)

```
W2  -> W3
W1  -> W4
W1  -> W5
W1  -> W6
W1  -> W9
W3  -> W9
W1  -> W10
W3  -> W10
W1  -> W7
W10 -> W7
```

### Trail term (`add_trail_term`)

term: `Rig`
definition: `The broader product/platform that the "relentless" monorepo (AI workflow engine + spec-driven dev pipeline) is becoming one part of. This trail is a full technical rename of relentless to Rig — not an umbrella-with-subcomponent split, and not cosmetic-only.`

### complete_trail

outcomeKind: `change`
outcomeSummary: (see live DB trail for the exact current text — it already includes a note about the 2026-07-19 recreation and the actor-registry bug fix)

---

## Trail B: `rig-workspace-binding` (DOES NOT EXIST YET — build this)

This trail was referenced throughout Trail A's W3/W9/W10 as if it already
existed. **It does not.** `list_trails` and `list_specs` both came back
empty for the `development` project on 2026-07-19. Nothing to resume here —
build it fresh using the design already locked in Trail A's W3 (reproduced
above in full). Do not re-research or re-design the mechanism unless
something concrete has changed since 2026-07-18 — W2 and W3 already did that
work.

### What still needs deciding before implementation starts

W3's resolution explicitly flagged this and it was never resolved:

> This has grown from a binding-config decision into real new-feature
> engineering — a recursive scanner with file-mutation, and a new local
> resolver/proxy component. That may be substantial enough to warrant its
> own formal spec (requirements → design → tasks → implementation) rather
> than being executed as informal task waypoints — worth deciding explicitly
> before implementation starts.

So the *first* waypoint of `rig-workspace-binding` should be exactly that
question: **spec pipeline (requirements→design→tasks→implementation) vs.
informal task waypoints directly in this trail** (mirroring how Trail A's
own notes carried an "EXECUTION OVERRIDE" for a rebrand-sized effort — this
is a different size of effort, a real scanner + a new local resolver
process/binary, and probably does warrant the formal spec pipeline given its
size).

### The two known real waypoints, already fully specified (from Trail A's W9/W10)

1. **Server-side workspace scan + identity auto-injection** — the
   `RIG_WORKSPACES_DIR` recursive scanner (see W9's question above, verbatim).
2. **The workspace-identity resolver process** — the shared stdio-launched
   resolver used by VS Code, Claude Code CLI, and Pi (see W10's question
   above, verbatim).

W10 depends on nothing that W9 doesn't also depend on structurally, but
logically the resolver (W10) needs the scanner's `rig.projectId` contract
(W9) to exist first — preserve that ordering if charting fresh waypoints.

### Suggested destination framing for `create_trail`

```
destination: MCP session→project binding is derived from the nearest
.code-workspace file's durable rig.projectId field (auto-injected by a
server-side recursive scanner over RIG_WORKSPACES_DIR) rather than a
per-repo .mcp.json URL slug, via a shared local resolver process that VS
Code, Claude Code CLI, and Pi all launch over stdio. Per-repo .mcp.json
entries pointing directly at the HTTP server are retired. Nothing left to
decide: the scanner is built and scanning correctly, the resolver is built
and proxying correctly for all three clients, and at least one real
multi-repo VS Code workspace is bound and working end-to-end.
```

### Lost spec: `workspace-based-project-binding`

Old id `e1d73f9f-fe1f-44c2-bebb-a8bf437b5331` — **gone, and don't bother
trying to recreate it by that id.** It was created but never actually
populated (`requirements` stage, status `not_started`) before the wipe, so
there is no lost content to recover — it was an empty shell. If the "full
spec pipeline" option above is chosen, just create a fresh spec via
`complete_trail(outcomeKind: "spec", specSlug: ..., featureName: ...)` once
`rig-workspace-binding`'s own charting is done, same as any other trail→spec
handoff.

---

## Known gotchas discovered 2026-07-19 (useful for whoever touches this server next)

1. **`.env`'s `RIG_CLAUDE_HOST_DIR` must point at the whole `~/.claude`
   directory**, not at `~/.claude/rig-actors` directly. The docker-compose.yml
   comment explains why: relative symlinks in the actors farm
   (`wayfinder -> ../skills/wayfinder`) only resolve correctly if the
   container's `/claude` mount is the *parent* of `rig-actors`, matching the
   host's real directory structure. Pointing the mount directly at
   `rig-actors` breaks the `../skills/<name>` relative resolution.

2. **`syncKnownActorsFromActorsDirectory`
   (`packages/server/src/mcp/guardrails/actor-registry.ts`) had a real bug**,
   fixed in commit `1814f83`: it filtered directory entries with
   `entry.isDirectory()`, but `Dirent.isDirectory()` never follows symlinks —
   and the curated actors directory (`~/.claude/rig-actors`) is *entirely*
   symlinks by design. This silently registered **zero actors** every time
   the server booted via Docker (existing unit tests never caught it because
   their fixtures used real directories, not symlinks). If a fresh database
   ever reports `unknown_actor` for `wayfinder` or any pipeline agent again,
   check `select * from spec_pipeline.known_actors` first — if it's empty,
   confirm this fix (filter must accept `entry.isDirectory() ||
   entry.isSymbolicLink()`) is actually present in the running image, not
   just in source.

3. **The Docker Compose project name is pinned to `name: rig`** in
   `docker-compose.yml` — a plain `docker compose down -v` only tears down
   whatever project name the *current* compose file says, not necessarily
   whatever is actually running. If containers/volumes were created under a
   different pinned name in the past (as happened with the leftover
   `relentless`-named stack found and torn down on 2026-07-19), you must
   target that old name explicitly (`docker compose -p <old-name> down -v`)
   or the old volume is silently orphaned rather than removed — check
   `docker ps -a` / `docker volume ls` for stale project names before
   assuming `down -v` covers everything.

## Outstanding items from Trail A's W8 (not yet actioned, not urgent)

- `~/Development/relentless/` — stray near-empty leftover dir, recommend
  deleting.
- `~/Development/.relentless/` — deprecated pre-database wayfinder file
  store holding real historical content (`surf-reskin-*`,
  `ai-workflow-engine-state-machines` specs) unrelated to Rig; user's call
  whether to archive or delete.
- `~/Development/mi-pi/tests/skill-precheck/grilling-integration.sh` — a
  separate repo's test likely already broken against the retired
  `.relentless/specs/` file-store layout; not this repo's problem to fix.
- `~/Development/.claude/settings.json` / `settings.local.json` — stale but
  inert permission-allowlist entries referencing the old path/scope/tool
  names; cosmetic only.
- `github.com/SomniVertix/relentless` (old repo) has no pointer to its new
  home at `github.com/SomniVertix/rig`; whether to add one is the user's
  call (it means pushing to a different, separate repo).
