-- =============================================================================
-- schema.sql
--
-- The COMPLETE clean-database bootstrap, applied in full on every boot (the
-- only boot-time DDL; there is no migrations runner). Cut over 2026-07-17
-- from a wiped database. It carries everything a fresh database needs — the
-- full spec pipeline (with the legacy grilling tables never existing), the
-- new discovery schema, and the run-engine tables. There are no evolution
-- ALTERs and no supersession DROPs anywhere in this file: a clean database
-- has nothing to evolve from.
--
-- Validated 2026-07-17: full apply against a fresh empty database, applied
-- twice to prove idempotent re-application.
--
-- -----------------------------------------------------------------------------
-- WHAT THIS IS
-- -----------------------------------------------------------------------------
--
-- Two domains and a substrate, in one database:
--
-- The `discovery` schema holds the trails domain, which the grilling and
-- wayfinder skills both write into. A TRAIL is one effort to turn a loose
-- idea into a destination; a WAYPOINT is one question being driven to a
-- decision. This domain replaces both the old grilling_sessions/decisions/
-- decision_terms tables and wayfinder's local file store
-- (.rig/tickets/) entirely: there is no local storage layer, and
-- skills hard-fail without the rig MCP server.
--
-- The `spec_pipeline` domain is the delivery layer: specs move through
-- requirements -> design -> tasks, each stage drafted by an agent and
-- human-gated. It is a *consumer* of a finished trail (via
-- discovery.trails.outcome_spec_id), never its parent — the ownership arrow
-- from the old grilling_sessions.spec_id design is deliberately inverted.
--
-- The `public` run-engine tables are the generic workflow engine's substrate
-- (runs, run history, human gates, artifacts, locks), kept in `public` to
-- match the unqualified table names packages/persistence has always queried.
--
-- -----------------------------------------------------------------------------
-- FULL LAYOUT
-- -----------------------------------------------------------------------------
--
-- PART 1 — THE spec_pipeline SCHEMA (delivery)
--
--   Types
--     spec_pipeline.stage_status               not_started | in_review | approved
--     spec_pipeline.spec_stage_name            requirements | design | tasks
--     spec_pipeline.ears_pattern               the six EARS criterion patterns
--   Functions
--     spec_pipeline.set_updated_at()           updated_at maintenance trigger
--     spec_pipeline.seed_spec_stages()         auto-seed requirements/design stage
--                                              rows per spec (tasks is derived, not
--                                              stored -- spec-stage-tracking-fixes W2)
--     spec_pipeline.seed_component_tasks_docs() one tasks_doc per component at
--                                              design in_review
--     spec_pipeline.reject_same_component_task_dependency_edge()
--   Tables
--     spec_pipeline.projects                   tenant/workspace root
--       -> spec_pipeline.specs                 one row per feature
--            + specs_project_id_slug_key
--            -> spec_stages                    per-stage approve/deny state
--            -> requirements                   requirements.md
--                 -> user_stories
--                      -> acceptance_criteria  EARS criteria per story
--                 -> non_goals
--                 -> assumptions_open_questions
--                 -> requirement_glossary_terms
--            -> designs                        design.md
--                 -> design_components
--                 -> design_data_model_entries
--                 -> design_traceability       (+ user_story linkage index)
--                 -> design_alternatives_considered
--                 -> design_open_risks
--                 -> design_flags
--            -> tasks_docs                     tasks.md, one per component
--                 -> task_items                Order/Task List/subtasks unified
--                      -> task_files_touched
--                 -> parallel_batches
--                      -> parallel_batch_members
--                 -> tasks_flags
--            -> task_dependency_edges          cross-component edges
--            -> definition_of_done_items       spec-wide checklist
--       -> prompts / prompt_snapshots          versioned prompt & agent library
--       -> workflows / workflow_snapshots      generic-engine definitions
--     spec_pipeline.known_actors               actor registry (boot-synced from
--                                              a Claude Code skills directory)
--     spec_pipeline.audit_log                  append-only attribution trail
--
-- PART 2 — THE discovery SCHEMA (the trails domain)
--
--   Types
--     discovery.trail_status                      active | complete | abandoned
--     discovery.trail_outcome_kind                spec | decision | change
--     discovery.waypoint_status                   sighted | marked | claimed |
--                                              reached | bypassed
--     discovery.waypoint_approach                 grilling | research |
--                                              prototype | task
--     discovery.lineage_parent_kind                session | waypoint (see
--                                              trail_lineage, wayfinder-trail-
--                                              lineage)
--   Functions
--     discovery.set_updated_at()                  updated_at maintenance trigger
--     discovery.reject_cross_trail_waypoint_edge() edges stay within one trail
--   Tables
--     discovery.sessions                          one row per wayfinder/
--                                              grilling invocation
--     discovery.trails                            one effort (a grill, short or
--       + trails_one_per_spec                   campaign-length)
--       + trails.session_id -> discovery.sessions  which invocation chartered it
--       -> discovery.waypoints                    one question each
--            + waypoints_trail_id_status_idx
--            + waypoints.spurred_to_trail_id       set by spur_waypoint; UNIQUE
--            -> discovery.waypoint_assets         what resolving it produced
--            -> discovery.waypoint_dependency_edges  "from" blocks "to"
--                 + waypoint_dependency_edges_to_idx
--       -> discovery.trail_terms                  per-trail terminology
--     discovery.trail_lineage                     a trail's parent edge
--       (session that chartered it, or waypoint that spurred it)
--   Canonical queries (documented inline beside waypoints; implemented in
--   application code, never as triggers)
--     claim_waypoint                           atomic claim UPDATE; stale-
--                                              claim reclaim built in
--     get_frontier                             marked-or-stale, all blockers
--                                              terminated, waypoint_number order
--
-- PART 3 — RUN-ENGINE TABLES (public schema)
--
--     public.runs, public.run_events, public.pending_human_interactions,
--     public.artifacts_meta, public.run_locks — verbatim from the previous
--     schema, deliberately in `public` (see Part 3 banner).
--
-- -----------------------------------------------------------------------------
-- TRAILS DESIGN MODEL
-- -----------------------------------------------------------------------------
--
-- Shape A ("one entity, behavior not schema"): there is no structural
-- difference between a quick grilling conversation and a long wayfinder
-- campaign. A grill adds a waypoint and reaches it in the same breath; a
-- campaign marks waypoints and lets later conversations claim them off the
-- frontier. A grill that turns out huge upgrades in place — nothing migrates.
--
-- Waypoint lifecycle (one status column drives everything):
--
--   sighted ──mark──> marked ──claim──> claimed ──reach──> reached
--      │                │  ^─release/TTL──┘   │      ^
--      │                ├────────reach────────│──────┘  (grilling: no claim
--      │                │                     │           step; add_waypoint
--      └──────bypass────┴───────bypass────────┴──> bypassed  may even insert
--                                                            already-reached)
--
--   reached and bypassed are terminal, and BOTH unblock dependents — a scope
--   ruling never deadlocks the frontier. Transitions are enforced by tool
--   code, not schema: wayfinder claims before reaching; grilling reaches
--   straight from marked (or inserts at reached with resolution inline); any
--   non-terminal status may be bypassed, including sighted — fog can turn
--   out to lie beyond the destination without ever being sharpened. CHECK
--   constraints refuse hollow terminals: reached requires resolution +
--   resolution_gist + reached_at; bypassed requires bypass_reason; claimed
--   requires claimed_at.
--
-- The old map-file sections are queries now, not columns — stored once,
-- never able to drift:
--   Decisions so far   waypoints WHERE status='reached' ORDER BY reached_at
--                      (resolution_gist is the index line)
--   Fog of war         waypoints WHERE status='sighted'
--   Out of scope       waypoints WHERE status='bypassed'
--   The frontier       the canonical get_frontier query
--
-- -----------------------------------------------------------------------------
-- WAYFINDER CONCORDANCE (old file concept -> new home)
-- -----------------------------------------------------------------------------
--
--   The map file           discovery.trails (one row per effort)
--   Destination / Notes    discovery.trails.destination, discovery.trails.notes
--   A ticket               discovery.waypoints (one row per question)
--   Ticket types           discovery.waypoints.approach — a hint, not a contract
--   blocked_by frontmatter discovery.waypoint_dependency_edges
--   Claiming (racy edit)   atomic claim_waypoint UPDATE
--   Linked asset files     discovery.waypoint_assets — documents stored whole;
--                          prototype code referenced by repo path + commit,
--                          always on main (no branches, no worktrees)
--   Terminology            discovery.trail_terms (project-level glossary is a
--                          consciously deferred future effort)
--   "Hand off to a spec"   outcome_kind='spec' + outcome_spec_id
--
-- -----------------------------------------------------------------------------
-- ISOLATION (settled 2026-07-17; single-file form settled later that day)
-- -----------------------------------------------------------------------------
--
--   1. The trails domain is its own Postgres schema (`discovery.*`): nothing
--      discovery-related is added to spec_pipeline, and any discovery ->
--      spec_pipeline reference must be one of the three declared touchpoints
--      below. Precedent: the
--      run-engine tables already live in `public` beside spec_pipeline.
--   2. One DDL file, not two: with the database wiped and this file authored
--      fresh, the earlier plan of a separate discovery.schema.sql applied second
--      is moot — this single file is the canonical boot DDL. The part
--      banners keep the domains legible, and the file can still be split at
--      a part boundary later without semantic change.
--   3. NOT its own database: the touchpoints are real FKs, a partial unique
--      index, and audit rows sharing a transaction with their mutations —
--      all of which require living in the same database. Splitting further
--      would mean rebuilding referential integrity in application code.
--
-- -----------------------------------------------------------------------------
-- CROSS-SCHEMA TOUCHPOINTS (deliberate, minimal — there are exactly three)
-- -----------------------------------------------------------------------------
--
--   1. discovery.trails.project_id      -> spec_pipeline.projects
--      Tenant scope. Same MCP session binding, same project scoping as specs.
--   2. discovery.trails.outcome_spec_id -> spec_pipeline.specs
--      The handoff: the complete_trail tool (outcome_kind='spec') creates the
--      spec AND sets this pointer in one transaction — the only write that
--      crosses the schema boundary. requirements-compiler then finds a spec's
--      trail through this pointer and reads its reached waypoints as the
--      decisions transcript; it never mutates trails and no longer creates
--      specs itself.
--      trails_one_per_spec allows at most one trail behind any spec — the
--      old one-decisions.md-per-spec rule with the ownership arrow inverted.
--      specs itself gains NO column.
--   3. known_actors / audit_log — shared guardrails. Every discovery write tool
--      validates its actor and inserts one audit_log row (table_name
--      qualified, e.g. 'discovery.waypoints') in the same transaction as its
--      mutation, identical to every spec-pipeline write tool.
--
-- -----------------------------------------------------------------------------
-- CLAIM RECOVERY ("both": manual release + TTL backstop)
-- -----------------------------------------------------------------------------
--
-- Claim TTL is *not* schema: claimed_at is the only stored fact. The claim
-- and frontier queries treat a claim older than RIG_CLAIM_TTL (server
-- config, recommended default 24h) as reclaimable in the same atomic UPDATE —
-- no separate steal step. release_waypoint (an MCP tool) works manually at
-- any time. The web dashboard has no trails surface in v1 — human recovery
-- of a stuck claim is the release_waypoint tool via any session, psql as the
-- override of last resort, or simply waiting out the TTL.
--
-- -----------------------------------------------------------------------------
-- HOUSE RULES
-- -----------------------------------------------------------------------------
--
-- Idempotent statements only (IF NOT EXISTS / guarded DO blocks / DROP
-- TRIGGER IF EXISTS before CREATE TRIGGER) so this single file re-applies in
-- full on every boot with no errors. No JSONB for spec-pipeline or discovery
-- data — every shape is fixed, so it is broken into real columns (the
-- run-engine tables and workflow definitions keep their JSONB as-is). COMMENT
-- ON every table. updated_at triggers on mutable tables. Kebab-case slug
-- checks. Every statement is schema-qualified, so no SET search_path is
-- needed (the old schema.sql's SET/RESET pair is gone). Requires
-- PostgreSQL >= 13 (identity columns; gen_random_uuid() is core since 13 —
-- the pgcrypto extension is kept only for parity with the previous schema).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- PART 1 — THE spec_pipeline SCHEMA (delivery)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS spec_pipeline;

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE spec_pipeline.stage_status AS ENUM (
        'not_started',
        'in_review',
        'approved'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE spec_pipeline.spec_stage_name AS ENUM (
        'requirements',
        'design',
        'tasks'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- EARS acceptance-criteria patterns, per requirements.template.md.
DO $$ BEGIN
    CREATE TYPE spec_pipeline.ears_pattern AS ENUM (
        'ubiquitous',           -- THE SYSTEM SHALL <always-true behavior>
        'event_driven',         -- WHEN <trigger>, THE SYSTEM SHALL <response>
        'state_driven',         -- WHILE <state>, THE SYSTEM SHALL <response>
        'unwanted_behavior',    -- IF <undesired condition>, THEN THE SYSTEM SHALL <response>
        'complex_conditional',  -- WHEN <trigger>, IF <condition>, THE SYSTEM SHALL <response>
        'optional_feature'      -- WHERE <feature included>, THE SYSTEM SHALL <response>
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on row modification.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION spec_pipeline.set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- projects — tenant/workspace scope for specs, trails, prompts, and workflows
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.projects (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT projects_slug_is_kebab_case CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
COMMENT ON TABLE spec_pipeline.projects IS
    'Top-level tenant scope. A NULL project_id elsewhere means a bundled/global default row. Also the tenant root for discovery.trails (cross-schema touchpoint 1).';

DROP TRIGGER IF EXISTS projects_set_updated_at ON spec_pipeline.projects;
CREATE TRIGGER projects_set_updated_at
    BEFORE UPDATE ON spec_pipeline.projects
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

-- =============================================================================
-- specs — one row per feature, scoped to a project
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.specs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID REFERENCES spec_pipeline.projects (id),
    slug          TEXT NOT NULL,
    feature_name  TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT specs_slug_is_kebab_case CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
COMMENT ON TABLE spec_pipeline.specs IS
    'One row per feature, scoped to a project. Parent of the whole delivery pipeline for that feature. Its discovery provenance (if any) is the discovery.trails row whose outcome_spec_id points here — specs itself carries no trails column (cross-schema touchpoint 2).';

CREATE UNIQUE INDEX IF NOT EXISTS specs_project_id_slug_key
    ON spec_pipeline.specs (project_id, slug);

DROP TRIGGER IF EXISTS specs_set_updated_at ON spec_pipeline.specs;
CREATE TRIGGER specs_set_updated_at
    BEFORE UPDATE ON spec_pipeline.specs
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

-- Per-stage approve/deny state: exactly one row per (spec, stage). Only 'requirements'
-- and 'design' are seeded/stored here -- the tasks stage has no aggregate row at all
-- (spec-stage-tracking-fixes W1/W2): its status is derived at read time from
-- spec_pipeline.tasks_docs (SpecRepository.deriveTasksAggregateStatus), since finalize_stage
-- never set a stage_name='tasks' row here past its seed-time default anyway.
CREATE TABLE IF NOT EXISTS spec_pipeline.spec_stages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spec_id    UUID NOT NULL REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE,
    stage_name spec_pipeline.spec_stage_name NOT NULL,
    status     spec_pipeline.stage_status NOT NULL DEFAULT 'not_started',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (spec_id, stage_name)
);
COMMENT ON TABLE spec_pipeline.spec_stages IS
    'Per-stage approve/deny state for requirements/design only. Exactly one row per (spec, stage) for those two stages. The tasks stage has no row here -- its status is derived live from tasks_docs (see SpecRepository.deriveTasksAggregateStatus).';

DROP TRIGGER IF EXISTS spec_stages_set_updated_at ON spec_pipeline.spec_stages;
CREATE TRIGGER spec_stages_set_updated_at
    BEFORE UPDATE ON spec_pipeline.spec_stages
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

-- Auto-seed the requirements/design stage rows (both not_started) whenever a spec is
-- created. No 'tasks' row is seeded (spec-stage-tracking-fixes W2) -- that stage's
-- status is always derived, never stored.
CREATE OR REPLACE FUNCTION spec_pipeline.seed_spec_stages() RETURNS trigger AS $$
BEGIN
    INSERT INTO spec_pipeline.spec_stages (spec_id, stage_name)
    VALUES (NEW.id, 'requirements'),
           (NEW.id, 'design');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS specs_seed_stages ON spec_pipeline.specs;
CREATE TRIGGER specs_seed_stages
    AFTER INSERT ON spec_pipeline.specs
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.seed_spec_stages();

-- =============================================================================
-- requirements.md
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.requirements (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spec_id      UUID NOT NULL UNIQUE REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE,
    feature_name TEXT NOT NULL,
    overview     TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE spec_pipeline.requirements IS
    'requirements.md: one row per spec. "## Overview" section lives here directly.';

DROP TRIGGER IF EXISTS requirements_set_updated_at ON spec_pipeline.requirements;
CREATE TRIGGER requirements_set_updated_at
    BEFORE UPDATE ON spec_pipeline.requirements
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

CREATE TABLE IF NOT EXISTS spec_pipeline.user_stories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirements_id UUID NOT NULL REFERENCES spec_pipeline.requirements (id) ON DELETE CASCADE,
    story_number    INTEGER NOT NULL,
    title           TEXT NOT NULL,
    role            TEXT NOT NULL,   -- "As a <role>"
    capability      TEXT NOT NULL,   -- "I want <capability>"
    benefit         TEXT NOT NULL,   -- "so that <benefit>"
    rationale       TEXT NOT NULL,
    UNIQUE (requirements_id, story_number)
);
COMMENT ON TABLE spec_pipeline.user_stories IS
    'requirements.md "### Story N" entries: the As-a/I-want/so-that line plus rationale.';

CREATE TABLE IF NOT EXISTS spec_pipeline.acceptance_criteria (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_story_id     UUID NOT NULL REFERENCES spec_pipeline.user_stories (id) ON DELETE CASCADE,
    criterion_number  INTEGER NOT NULL,
    ears_pattern      spec_pipeline.ears_pattern NOT NULL,
    trigger_clause    TEXT,          -- WHEN <trigger>
    condition_clause  TEXT,          -- IF <condition> / WHERE <feature is included>
    state_clause      TEXT,          -- WHILE <state>
    response_clause   TEXT NOT NULL, -- THE SYSTEM SHALL <response>
    full_text         TEXT NOT NULL, -- criterion exactly as authored, verbatim fallback
    UNIQUE (user_story_id, criterion_number)
);
COMMENT ON TABLE spec_pipeline.acceptance_criteria IS
    'EARS acceptance criteria grouped under each user story. full_text is the verbatim source; the other clause columns are the parsed decomposition.';

CREATE TABLE IF NOT EXISTS spec_pipeline.non_goals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirements_id UUID NOT NULL REFERENCES spec_pipeline.requirements (id) ON DELETE CASCADE,
    ordinal         INTEGER NOT NULL,
    description     TEXT NOT NULL,
    UNIQUE (requirements_id, ordinal)
);
COMMENT ON TABLE spec_pipeline.non_goals IS 'requirements.md "## Non-Goals" list items.';

CREATE TABLE IF NOT EXISTS spec_pipeline.assumptions_open_questions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirements_id UUID NOT NULL REFERENCES spec_pipeline.requirements (id) ON DELETE CASCADE,
    ordinal         INTEGER NOT NULL,
    description     TEXT NOT NULL,
    UNIQUE (requirements_id, ordinal)
);
COMMENT ON TABLE spec_pipeline.assumptions_open_questions IS
    'requirements.md "## Assumptions / Open Questions" list items.';

CREATE TABLE IF NOT EXISTS spec_pipeline.requirement_glossary_terms (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirements_id     UUID NOT NULL REFERENCES spec_pipeline.requirements (id) ON DELETE CASCADE,
    term                TEXT NOT NULL,
    definition          TEXT,
    external_reference  TEXT, -- e.g. pointer into a project-wide domain-modeling glossary instead of an inline definition
    UNIQUE (requirements_id, term),
    CONSTRAINT requirement_glossary_terms_has_definition_or_reference
        CHECK (definition IS NOT NULL OR external_reference IS NOT NULL)
);
COMMENT ON TABLE spec_pipeline.requirement_glossary_terms IS
    'requirements.md "## Glossary" entries. May link out to an external glossary instead of defining inline.';

-- =============================================================================
-- design.md
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.designs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spec_id             UUID NOT NULL UNIQUE REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE,
    feature_name        TEXT NOT NULL,
    overview            TEXT NOT NULL,
    architecture        TEXT NOT NULL, -- prose / ASCII / mermaid, per template
    data_model_overview TEXT,          -- optional intro prose before design_data_model_entries
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE spec_pipeline.designs IS
    'design.md: one row per spec. Holds "## Overview" and "## Architecture" directly.';

DROP TRIGGER IF EXISTS designs_set_updated_at ON spec_pipeline.designs;
CREATE TRIGGER designs_set_updated_at
    BEFORE UPDATE ON spec_pipeline.designs
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

CREATE TABLE IF NOT EXISTS spec_pipeline.design_components (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id    UUID NOT NULL REFERENCES spec_pipeline.designs (id) ON DELETE CASCADE,
    slug         TEXT NOT NULL,
    display_name TEXT NOT NULL,
    ordinal      INTEGER NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (design_id, slug),
    UNIQUE (design_id, ordinal),
    CONSTRAINT design_components_slug_is_kebab_case
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
COMMENT ON TABLE spec_pipeline.design_components IS
    'design.md "## Components" table rows: slug | display name | responsibility. Mandatory >=1 row is enforced at design finalize, not by schema.';

CREATE TABLE IF NOT EXISTS spec_pipeline.design_data_model_entries (
    id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id UUID NOT NULL REFERENCES spec_pipeline.designs (id) ON DELETE CASCADE,
    ordinal   INTEGER NOT NULL,
    name      TEXT NOT NULL, -- e.g. "User", "POST /users"
    kind      TEXT NOT NULL, -- e.g. 'schema', 'type', 'api_contract', 'interface'
    content   TEXT NOT NULL, -- the actual schema/type/contract body, verbatim
    UNIQUE (design_id, ordinal)
);
COMMENT ON TABLE spec_pipeline.design_data_model_entries IS
    'design.md "## Data Model / Interfaces" items: one row per schema/type/API contract.';

CREATE TABLE IF NOT EXISTS spec_pipeline.design_traceability (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id          UUID NOT NULL REFERENCES spec_pipeline.designs (id) ON DELETE CASCADE,
    user_story_id      UUID REFERENCES spec_pipeline.user_stories (id) ON DELETE SET NULL,
    requirement_label  TEXT NOT NULL, -- raw "Story N: <title>" text, kept even if user_story_id can't be resolved
    addressed_by       TEXT NOT NULL, -- design section/component that satisfies it
    ordinal            INTEGER NOT NULL,
    UNIQUE (design_id, ordinal)
);
COMMENT ON TABLE spec_pipeline.design_traceability IS
    'design.md "## Requirement Traceability" table rows, linked to user_stories where resolvable.';

CREATE INDEX IF NOT EXISTS design_traceability_user_story_id_idx
    ON spec_pipeline.design_traceability (user_story_id);

CREATE TABLE IF NOT EXISTS spec_pipeline.design_alternatives_considered (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id   UUID NOT NULL REFERENCES spec_pipeline.designs (id) ON DELETE CASCADE,
    ordinal     INTEGER NOT NULL,
    description TEXT NOT NULL,
    UNIQUE (design_id, ordinal)
);
COMMENT ON TABLE spec_pipeline.design_alternatives_considered IS
    'design.md "## Alternatives Considered" list items.';

CREATE TABLE IF NOT EXISTS spec_pipeline.design_open_risks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id   UUID NOT NULL REFERENCES spec_pipeline.designs (id) ON DELETE CASCADE,
    ordinal     INTEGER NOT NULL,
    description TEXT NOT NULL,
    UNIQUE (design_id, ordinal)
);
COMMENT ON TABLE spec_pipeline.design_open_risks IS
    'design.md "## Open Risks / Tradeoffs" list items.';

CREATE TABLE IF NOT EXISTS spec_pipeline.design_flags (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id   UUID NOT NULL REFERENCES spec_pipeline.designs (id) ON DELETE CASCADE,
    ordinal     INTEGER NOT NULL,
    description TEXT NOT NULL,
    UNIQUE (design_id, ordinal)
);
COMMENT ON TABLE spec_pipeline.design_flags IS
    'design.md "## Flags" list items: gaps/assumptions from insufficient requirements.md.';

-- =============================================================================
-- tasks.md — one tasks_docs row per declared design_component
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.tasks_docs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spec_id             UUID NOT NULL REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE,
    design_component_id UUID NOT NULL REFERENCES spec_pipeline.design_components (id) ON DELETE CASCADE,
    component_slug      TEXT NOT NULL,          -- denormalized for rendering/edge resolution
    component_name      TEXT NOT NULL,          -- display name snapshot
    feature_name        TEXT NOT NULL,
    status              spec_pipeline.stage_status NOT NULL DEFAULT 'not_started',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (spec_id, component_slug),           -- strict 1:1 mapping
    UNIQUE (design_component_id)                -- exactly one doc per component
);
COMMENT ON TABLE spec_pipeline.tasks_docs IS
    'tasks.md: one row per design_component, each with its own independent lifecycle status.';

DROP TRIGGER IF EXISTS tasks_docs_set_updated_at ON spec_pipeline.tasks_docs;
CREATE TRIGGER tasks_docs_set_updated_at
    BEFORE UPDATE ON spec_pipeline.tasks_docs
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

-- Auto-seed one tasks_docs row per declared design_component the moment design
-- reaches 'in_review' (the "Components section finalized" moment). Insert-only
-- (ON CONFLICT DO NOTHING): this trigger never deletes a tasks_docs row. The
-- delete-if-empty/reject-if-drafted redraft-reconciliation mechanic lives
-- entirely in finalize_stage('design') application code -- exactly one place
-- owns that logic.
CREATE OR REPLACE FUNCTION spec_pipeline.seed_component_tasks_docs() RETURNS trigger AS $$
BEGIN
    IF NEW.stage_name = 'design' AND NEW.status = 'in_review'
       AND OLD.status IS DISTINCT FROM 'in_review' THEN
        INSERT INTO spec_pipeline.tasks_docs
            (spec_id, design_component_id, component_slug, component_name, feature_name)
        SELECT d.spec_id, c.id, c.slug, c.display_name, d.feature_name
        FROM spec_pipeline.designs d
        JOIN spec_pipeline.design_components c ON c.design_id = d.id
        WHERE d.spec_id = NEW.spec_id
        ON CONFLICT (design_component_id) DO NOTHING;   -- idempotent re-seed
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS spec_stages_seed_component_tasks ON spec_pipeline.spec_stages;
CREATE TRIGGER spec_stages_seed_component_tasks
    AFTER UPDATE ON spec_pipeline.spec_stages
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.seed_component_tasks_docs();

-- Unifies "## Order", "## Task List", and each task's "Subtasks" into one table:
-- item_id + parent_item_id gives the tree, execution_order gives the linear
-- Order sequence, and is_checked is the single live checkbox state for both
-- the Order checklist and the Task List entry (they are the same checkbox).
CREATE TABLE IF NOT EXISTS spec_pipeline.task_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tasks_doc_id     UUID NOT NULL REFERENCES spec_pipeline.tasks_docs (id) ON DELETE CASCADE,
    item_id          TEXT NOT NULL, -- stable ID referenced by Order / Parallel Execution Schema, e.g. '1', '1.1', '2'
    parent_item_id   UUID REFERENCES spec_pipeline.task_items (id) ON DELETE CASCADE,
    execution_order  INTEGER NOT NULL, -- position in the linear Order sequence
    title            TEXT NOT NULL,
    description      TEXT NOT NULL,
    traceability     TEXT NOT NULL, -- requirement(s) + design section(s) implemented
    suggested_agent  TEXT NOT NULL DEFAULT 'none',
    acceptance_check TEXT NOT NULL,
    is_checked       BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tasks_doc_id, item_id),
    UNIQUE (tasks_doc_id, execution_order)
);
COMMENT ON TABLE spec_pipeline.task_items IS
    'tasks.md "## Order" + "## Task List" + subtasks, unified: parent_item_id builds the task/subtask tree, execution_order is the linear run sequence, is_checked is the live checklist state. Scoped to one component''s tasks_doc_id.';

CREATE INDEX IF NOT EXISTS task_items_parent_item_id_idx
    ON spec_pipeline.task_items (parent_item_id);

DROP TRIGGER IF EXISTS task_items_set_updated_at ON spec_pipeline.task_items;
CREATE TRIGGER task_items_set_updated_at
    BEFORE UPDATE ON spec_pipeline.task_items
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

CREATE TABLE IF NOT EXISTS spec_pipeline.task_files_touched (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_item_id UUID NOT NULL REFERENCES spec_pipeline.task_items (id) ON DELETE CASCADE,
    ordinal      INTEGER NOT NULL,
    file_path    TEXT NOT NULL,
    UNIQUE (task_item_id, ordinal)
);
COMMENT ON TABLE spec_pipeline.task_files_touched IS
    'tasks.md per-task "Files/areas touched" list: the auditable blast radius of a task.';

-- =============================================================================
-- task_dependency_edges — cross-component dependency graph
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.task_dependency_edges (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spec_id           UUID NOT NULL REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE,
    from_task_item_id UUID NOT NULL REFERENCES spec_pipeline.task_items (id) ON DELETE CASCADE,
    to_task_item_id   UUID NOT NULL REFERENCES spec_pipeline.task_items (id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_task_item_id, to_task_item_id),
    CONSTRAINT edge_not_self CHECK (from_task_item_id <> to_task_item_id)
);
COMMENT ON TABLE spec_pipeline.task_dependency_edges IS
    '"from" blocks "to" (from must complete before to). Additive to each component''s own intra-component Order/Parallel Execution Schema. No cycle detection on insert -- see finalize_stage''s WITH RECURSIVE check instead.';

CREATE INDEX IF NOT EXISTS task_dependency_edges_to_idx
    ON spec_pipeline.task_dependency_edges (to_task_item_id);

-- Defensive belt-and-suspenders check alongside the application-level
-- same-component rejection in add_task_dependency_edge: reject at the DB
-- layer too if both endpoints resolve to the same tasks_doc_id, even if
-- application code were bypassed.
CREATE OR REPLACE FUNCTION spec_pipeline.reject_same_component_task_dependency_edge() RETURNS trigger AS $$
DECLARE
    from_tasks_doc_id UUID;
    to_tasks_doc_id UUID;
BEGIN
    SELECT tasks_doc_id INTO from_tasks_doc_id FROM spec_pipeline.task_items WHERE id = NEW.from_task_item_id;
    SELECT tasks_doc_id INTO to_tasks_doc_id FROM spec_pipeline.task_items WHERE id = NEW.to_task_item_id;
    IF from_tasks_doc_id IS NOT DISTINCT FROM to_tasks_doc_id THEN
        RAISE EXCEPTION 'task_dependency_edges: from_task_item_id and to_task_item_id resolve to the same tasks_doc_id (same-component dependency edges are rejected)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS task_dependency_edges_reject_same_component ON spec_pipeline.task_dependency_edges;
CREATE TRIGGER task_dependency_edges_reject_same_component
    BEFORE INSERT ON spec_pipeline.task_dependency_edges
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.reject_same_component_task_dependency_edge();

-- Cycle detection is NOT a trigger (no cycle check on add). It is run
-- explicitly by finalize_stage application code for any component, walking
-- *all* of the spec's edges:
--
--   WITH RECURSIVE reach(from_id, to_id, path) AS (
--       SELECT from_task_item_id, to_task_item_id,
--              ARRAY[from_task_item_id, to_task_item_id]
--       FROM spec_pipeline.task_dependency_edges WHERE spec_id = $1
--     UNION ALL
--       SELECT r.from_id, e.to_task_item_id, r.path || e.to_task_item_id
--       FROM reach r
--       JOIN spec_pipeline.task_dependency_edges e
--         ON e.from_task_item_id = r.to_id AND e.spec_id = $1
--       WHERE NOT e.to_task_item_id = ANY(r.path)      -- prune already-visited
--   )
--   SELECT 1 FROM reach WHERE to_id = from_id LIMIT 1; -- any row => cycle

CREATE TABLE IF NOT EXISTS spec_pipeline.parallel_batches (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tasks_doc_id UUID NOT NULL REFERENCES spec_pipeline.tasks_docs (id) ON DELETE CASCADE,
    batch_label  TEXT NOT NULL,   -- 'P1', 'P2', ...
    batch_order  INTEGER NOT NULL, -- sequence in which batches run
    UNIQUE (tasks_doc_id, batch_label),
    UNIQUE (tasks_doc_id, batch_order)
);
COMMENT ON TABLE spec_pipeline.parallel_batches IS
    'tasks.md "## Parallel Execution Schema" batches (P1, P2, ...), run in batch_order sequence. Intra-component.';

CREATE TABLE IF NOT EXISTS spec_pipeline.parallel_batch_members (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id     UUID NOT NULL REFERENCES spec_pipeline.parallel_batches (id) ON DELETE CASCADE,
    task_item_id UUID NOT NULL REFERENCES spec_pipeline.task_items (id) ON DELETE CASCADE,
    UNIQUE (batch_id, task_item_id)
);
COMMENT ON TABLE spec_pipeline.parallel_batch_members IS
    'Task/subtask IDs grouped into each parallel batch. Must reference IDs that also exist in task_items (the Order list).';

CREATE INDEX IF NOT EXISTS parallel_batch_members_task_item_id_idx
    ON spec_pipeline.parallel_batch_members (task_item_id);

CREATE TABLE IF NOT EXISTS spec_pipeline.tasks_flags (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tasks_doc_id UUID NOT NULL REFERENCES spec_pipeline.tasks_docs (id) ON DELETE CASCADE,
    ordinal      INTEGER NOT NULL,
    description  TEXT NOT NULL,
    UNIQUE (tasks_doc_id, ordinal)
);
COMMENT ON TABLE spec_pipeline.tasks_flags IS
    'tasks.md "## Flags" list items: gaps/assumptions from insufficient design.md. Keyed on tasks_doc_id, i.e. per-component.';

CREATE TABLE IF NOT EXISTS spec_pipeline.definition_of_done_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spec_id     UUID NOT NULL REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE,
    ordinal     INTEGER NOT NULL,
    description TEXT NOT NULL,
    is_checked  BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (spec_id, ordinal)
);
COMMENT ON TABLE spec_pipeline.definition_of_done_items IS
    'tasks.md top-level "## Definition of Done" checklist, shared across every component tasks_doc under one spec_id.';

-- =============================================================================
-- prompts / prompt_snapshots — versioned prompt & agent library
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.prompts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES spec_pipeline.projects (id) ON DELETE CASCADE, -- NULL = bundled
    prompt_key      TEXT NOT NULL,           -- e.g. 'design-drafter'
    kind            TEXT NOT NULL,           -- 'agent' | 'prompt'
    body            TEXT NOT NULL,
    description     TEXT,
    origin          TEXT NOT NULL DEFAULT 'user',    -- 'bundled' | 'user'
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE spec_pipeline.prompts IS
    'Versioned prompt/agent library. project_id IS NULL rows are bundled defaults; a project-scoped row shadows the bundled row of the same prompt_key for that project only, never the reverse, and no per-project copy is ever created.';

CREATE UNIQUE INDEX IF NOT EXISTS prompts_project_key
    ON spec_pipeline.prompts (project_id, prompt_key) WHERE project_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS prompts_bundled_key
    ON spec_pipeline.prompts (prompt_key) WHERE project_id IS NULL;

DROP TRIGGER IF EXISTS prompts_set_updated_at ON spec_pipeline.prompts;
CREATE TRIGGER prompts_set_updated_at
    BEFORE UPDATE ON spec_pipeline.prompts
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

CREATE TABLE IF NOT EXISTS spec_pipeline.prompt_snapshots (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id   UUID NOT NULL REFERENCES spec_pipeline.prompts (id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    body        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (prompt_id, version)
);
COMMENT ON TABLE spec_pipeline.prompt_snapshots IS
    'Prior body/description captured on every prompt update, before current_version is bumped.';

-- =============================================================================
-- workflows / workflow_snapshots — generic-engine definitions
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.workflows (
    id         TEXT PRIMARY KEY,
    definition JSONB NOT NULL,
    project_id UUID REFERENCES spec_pipeline.projects (id), -- NULL = bundled
    origin     TEXT NOT NULL DEFAULT 'user',                -- 'bundled' | 'user'
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE spec_pipeline.workflows IS
    'Workflow definitions. project_id IS NULL rows are bundled defaults. The canonical write target for workflow YAMLs.';

CREATE TABLE IF NOT EXISTS spec_pipeline.workflow_snapshots (
    id            TEXT PRIMARY KEY,
    workflow_id   TEXT NOT NULL REFERENCES spec_pipeline.workflows (id) ON DELETE CASCADE,
    snapshot_hash TEXT NOT NULL,
    definition    JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE spec_pipeline.workflow_snapshots IS
    'Workflow version history, mirrored by prompt_snapshots for prompts.';

-- =============================================================================
-- known_actors / audit_log — attribution & append-only audit trail, shared by
-- BOTH schemas (cross-schema touchpoint 3)
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.known_actors (
    actor      TEXT PRIMARY KEY,
    source     TEXT NOT NULL,        -- file/dir the name was discovered in
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE spec_pipeline.known_actors IS
    'Registry of valid actor names, synced at boot from <agentsDir>/<name>/SKILL.md, a Claude Code skills directory (e.g. a bind-mounted ~/.claude/skills). Every write tool''s required actor argument — spec_pipeline and discovery alike — is validated against this table.';

CREATE TABLE IF NOT EXISTS spec_pipeline.audit_log (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor      TEXT NOT NULL,
    action     TEXT NOT NULL,        -- 'insert' | 'update' | 'delete' | 'finalize'
    table_name TEXT NOT NULL,        -- schema-qualified for trails rows, e.g. 'discovery.waypoints'
    row_id     TEXT NOT NULL,
    project_id UUID,
    ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE spec_pipeline.audit_log IS
    'Append-only: every write tool — spec_pipeline and discovery alike — inserts exactly one row in the same transaction as its mutation. No UPDATE/DELETE path is exercised by any application code.';

CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON spec_pipeline.audit_log (ts);

-- =============================================================================
-- PART 2 — THE discovery SCHEMA (the trails domain)
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS discovery;

-- -----------------------------------------------------------------------------
-- Enumerated types
-- -----------------------------------------------------------------------------

DO $$ BEGIN
    CREATE TYPE discovery.trail_status AS ENUM (
        'active',       -- being walked: waypoints still sighted/marked/claimed
        'complete',     -- destination reached; outcome_* filled in
        'abandoned'     -- consciously stopped short of the destination
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE discovery.trail_outcome_kind AS ENUM (
        'spec',         -- handed off to the spec pipeline (outcome_spec_id set)
        'decision',     -- a decision locked; nothing further to build from it
        'change'        -- a change made in place along the way (e.g. migration)
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE discovery.waypoint_status AS ENUM (
        'sighted',      -- fog: you can tell something is out there, but the
                        -- question can't be stated sharply yet. Not claimable.
        'marked',       -- sharp question, claimable (frontier-eligible once
                        -- unblocked)
        'claimed',      -- a conversation is actively resolving it
        'reached',      -- resolved: resolution + resolution_gist recorded
        'bypassed'      -- consciously routed around (out of scope), with reason
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE discovery.waypoint_approach AS ENUM (
        'grilling',     -- HITL: resolve by interviewing the human (default case)
        'research',     -- AFK: read docs/APIs/knowledge bases; produces a
                        -- document asset
        'prototype',    -- HITL: build something cheap to react to; produces a
                        -- prototype_ref asset (code lives on main, never a
                        -- branch/worktree)
        'task'          -- do-first work (provision access, move data) that
                        -- unblocks a decision; HITL or AFK
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- wayfinder-trail-lineage: a trail's parent edge is one of these kinds today;
-- extensible later (e.g. a future 'triage' kind) without redesigning
-- trail_lineage, just adding a value here plus a new nullable FK column.
DO $$ BEGIN
    CREATE TYPE discovery.lineage_parent_kind AS ENUM (
        'session',      -- trail was chartered directly by a wayfinder session
        'waypoint'      -- trail was spun off from a waypoint via spur_waypoint
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current on row modification.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION discovery.set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- sessions — one row per wayfinder/grilling invocation (a conversation),
-- stamped explicitly so trails and trail_lineage can record who chartered them
-- =============================================================================

CREATE TABLE IF NOT EXISTS discovery.sessions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor      TEXT NOT NULL,   -- validated against spec_pipeline.known_actors
                                 -- at the application layer, like every other
                                 -- write tool's actor argument
    label      TEXT,            -- optional human-readable note for this
                                 -- invocation
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE discovery.sessions IS
    'One row per wayfinder/grilling invocation, stamped explicitly by the start_session MCP tool -- no implicit/inferred session boundaries. trails.session_id and trail_lineage.parent_session_id both reference this table. The 5 trails that predate this feature keep session_id NULL (no backfill), matching how previous_status was left NULL on pre-existing waypoints in wayfinder-undo.';

-- =============================================================================
-- trails — one row per effort (a grill, short or campaign-length)
-- =============================================================================

CREATE TABLE IF NOT EXISTS discovery.trails (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id       UUID NOT NULL REFERENCES spec_pipeline.projects (id),
    slug             TEXT NOT NULL,
    title            TEXT NOT NULL,
    trailhead_prompt TEXT NOT NULL,  -- the user's initial ask, largely verbatim
    destination      TEXT,           -- what reaching the end looks like; NULL
                                     -- until named (a quick grill may never
                                     -- formalize one; wayfinder names it first)
    notes            TEXT,           -- domain, skills to consult, standing
                                     -- preferences for this effort
    status           discovery.trail_status NOT NULL DEFAULT 'active',
    outcome_kind     discovery.trail_outcome_kind,
    outcome_spec_id  UUID REFERENCES spec_pipeline.specs (id) ON DELETE SET NULL,
    outcome_summary  TEXT,           -- prose record of what the trail yielded
    session_id       UUID REFERENCES discovery.sessions (id), -- which wayfinder
                                     -- invocation chartered this trail; NULL
                                     -- for the pre-existing trails (no backfill)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, slug),
    CONSTRAINT trails_slug_is_kebab_case CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    -- No trails_outcome_only_when_complete constraint: reopen_trail
    -- deliberately restores status to 'active' while leaving outcome_kind /
    -- outcome_spec_id in place as a persisting record of the trail's most
    -- recent completion, so outcome_* no longer implies status = 'complete'.
    -- outcome_kind is still only ever *set* by complete_trail (which always
    -- sets status = 'complete' in the same statement), so this is purely a
    -- read-side loosening, not an open door for outcome_kind to appear from
    -- anywhere else.
    CONSTRAINT trails_spec_outcome_has_spec_kind
        CHECK (outcome_spec_id IS NULL OR outcome_kind = 'spec')
);
COMMENT ON TABLE discovery.trails IS
    'One effort to turn a loose idea into a destination. Both the grilling and wayfinder skills operate on this same entity; the difference is behavioral (resolve-live vs. mark-and-claim-later), never structural.';

-- Existing databases (this constraint predates reopen_trail): drop it so a
-- reopened trail can keep outcome_kind/outcome_spec_id from a prior
-- completion while status is 'active' again.
ALTER TABLE discovery.trails DROP CONSTRAINT IF EXISTS trails_outcome_only_when_complete;

-- Existing databases (this table predates session_id, added for
-- wayfinder-trail-lineage): apply the same shape without dropping data.
ALTER TABLE discovery.trails
    ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES discovery.sessions (id);

-- The handoff pointer: at most one trail behind any given spec, mirroring the
-- old one-decisions.md-per-spec rule. requirements-compiler resolves a spec's
-- provenance by looking the trail up through this index.
CREATE UNIQUE INDEX IF NOT EXISTS trails_one_per_spec
    ON discovery.trails (outcome_spec_id)
    WHERE outcome_spec_id IS NOT NULL;

DROP TRIGGER IF EXISTS trails_set_updated_at ON discovery.trails;
CREATE TRIGGER trails_set_updated_at
    BEFORE UPDATE ON discovery.trails
    FOR EACH ROW EXECUTE FUNCTION discovery.set_updated_at();

-- =============================================================================
-- waypoints — one question being driven to a decision
-- =============================================================================

CREATE TABLE IF NOT EXISTS discovery.waypoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trail_id        UUID NOT NULL REFERENCES discovery.trails (id) ON DELETE CASCADE,
    waypoint_number INTEGER NOT NULL, -- assigned max+1 by add_waypoint, like
                                      -- the old decisions.question_number;
                                      -- stable order for frontier ties and
                                      -- "W<n>" references in narration
    title           TEXT NOT NULL,    -- refer-by-name: the short name humans
                                      -- and narration use, never the id
    question        TEXT NOT NULL,    -- sighted: the loose fog-patch text;
                                      -- sharpened in place when marked
    approach        discovery.waypoint_approach, -- hint for the resolving session
                                      -- (HITL vs AFK, which skill to reach
                                      -- for); NULL = decide when claimed
    status          discovery.waypoint_status NOT NULL DEFAULT 'marked',
    claimed_by      TEXT,             -- session identifier; cleared on release
    claimed_at      TIMESTAMPTZ,      -- claim-TTL math runs off this; cleared
                                      -- on release
    resolution      TEXT,             -- the full answer, stated plainly enough
                                      -- to build from without re-reading the
                                      -- conversation (reached only)
    resolution_gist TEXT,             -- one-line index entry: the computed
                                      -- "Decisions so far" line (reached only)
    rationale       TEXT,             -- what was on the table / the user's own
                                      -- words, when it carries signal beyond
                                      -- the plain resolution (optional)
    bypass_reason   TEXT,             -- why this sits past the destination
                                      -- (bypassed only)
    previous_status discovery.waypoint_status, -- status immediately before
                                      -- bypass_waypoint terminated it ('marked'
                                      -- or 'sighted'); set by bypass_waypoint,
                                      -- cleared by unbypass_waypoint, which
                                      -- restores status to this value. Not a
                                      -- general history mechanism -- exists
                                      -- solely to make unbypass exact.
    reached_in      TEXT,             -- provenance stamp: identifier of the
                                      -- conversation that resolved it
    reached_at      TIMESTAMPTZ,
    spurred_to_trail_id UUID REFERENCES discovery.trails (id), -- set by
                                      -- spur_waypoint when this waypoint's
                                      -- resolution spun off a new trail;
                                      -- UNIQUE below enforces one waypoint
                                      -- spawns at most one trail
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (trail_id, waypoint_number),
    CONSTRAINT waypoints_claimed_has_claimed_at
        CHECK (status <> 'claimed' OR claimed_at IS NOT NULL),
    CONSTRAINT waypoints_reached_is_complete
        CHECK (status <> 'reached'
               OR (resolution IS NOT NULL AND resolution_gist IS NOT NULL
                   AND reached_at IS NOT NULL)),
    CONSTRAINT waypoints_bypassed_has_reason
        CHECK (status <> 'bypassed' OR bypass_reason IS NOT NULL),
    CONSTRAINT waypoints_previous_status_only_when_bypassed
        CHECK (previous_status IS NULL OR status = 'bypassed')
);

-- Existing databases (this table predates previous_status, added for
-- unbypass_waypoint): apply the same shape without dropping data.
ALTER TABLE discovery.waypoints
    ADD COLUMN IF NOT EXISTS previous_status discovery.waypoint_status;
ALTER TABLE discovery.waypoints
    DROP CONSTRAINT IF EXISTS waypoints_previous_status_only_when_bypassed;
ALTER TABLE discovery.waypoints
    ADD CONSTRAINT waypoints_previous_status_only_when_bypassed
        CHECK (previous_status IS NULL OR status = 'bypassed');

-- Existing databases (this table predates spurred_to_trail_id, added for
-- wayfinder-trail-lineage): apply the same shape without dropping data.
ALTER TABLE discovery.waypoints
    ADD COLUMN IF NOT EXISTS spurred_to_trail_id UUID REFERENCES discovery.trails (id);
CREATE UNIQUE INDEX IF NOT EXISTS waypoints_spurred_to_trail_id_key
    ON discovery.waypoints (spurred_to_trail_id)
    WHERE spurred_to_trail_id IS NOT NULL;
COMMENT ON TABLE discovery.waypoints IS
    'The unified question lifecycle: sighted (fog) -> marked (frontier-eligible) -> claimed -> reached (a decision) | bypassed (out of scope). A grilling conversation reaches straight from marked — add_waypoint accepts an inline resolution and inserts directly at reached; a wayfinder campaign leaves marked waypoints for later conversations to claim. Only marked waypoints are claimable (enforced by the canonical claim UPDATE, not schema).';

CREATE INDEX IF NOT EXISTS waypoints_trail_id_status_idx
    ON discovery.waypoints (trail_id, status);

DROP TRIGGER IF EXISTS waypoints_set_updated_at ON discovery.waypoints;
CREATE TRIGGER waypoints_set_updated_at
    BEFORE UPDATE ON discovery.waypoints
    FOR EACH ROW EXECUTE FUNCTION discovery.set_updated_at();

-- Canonical claim (claim_waypoint) — atomic; the WHERE clause is the whole
-- concurrency story, replacing wayfinder's racy read-then-edit frontmatter
-- claim. A stale claim (older than the TTL) is reclaimable in the same
-- statement; a live claim makes this a no-op the tool surfaces as
-- 'already_claimed':
--
--   UPDATE discovery.waypoints
--   SET status = 'claimed', claimed_by = $2, claimed_at = now()
--   WHERE id = $1
--     AND (status = 'marked'
--          OR (status = 'claimed' AND claimed_at < now() - $3::interval))
--   RETURNING *;   -- zero rows => not claimable (wrong status or live claim)

-- Canonical frontier (get_frontier) — the edge of the known: marked (or
-- stale-claimed) waypoints whose blockers have all terminated (reached or
-- bypassed), in waypoint_number order:
--
--   SELECT w.*
--   FROM discovery.waypoints w
--   WHERE w.trail_id = $1
--     AND (w.status = 'marked'
--          OR (w.status = 'claimed' AND w.claimed_at < now() - $2::interval))
--     AND NOT EXISTS (
--         SELECT 1
--         FROM discovery.waypoint_dependency_edges e
--         JOIN discovery.waypoints blocker ON blocker.id = e.from_waypoint_id
--         WHERE e.to_waypoint_id = w.id
--           AND blocker.status NOT IN ('reached', 'bypassed'))
--   ORDER BY w.waypoint_number;

-- =============================================================================
-- waypoint_dependency_edges — "from" blocks "to", replacing ticket-frontmatter
-- blocked_by lists
-- =============================================================================

CREATE TABLE IF NOT EXISTS discovery.waypoint_dependency_edges (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_waypoint_id UUID NOT NULL REFERENCES discovery.waypoints (id) ON DELETE CASCADE,
    to_waypoint_id   UUID NOT NULL REFERENCES discovery.waypoints (id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_waypoint_id, to_waypoint_id),
    CONSTRAINT waypoint_edge_not_self CHECK (from_waypoint_id <> to_waypoint_id)
);
COMMENT ON TABLE discovery.waypoint_dependency_edges IS
    '"from" must terminate (reached or bypassed) before "to" is frontier-eligible. No cycle detection on insert, matching task_dependency_edges; add_waypoint_dependency application code runs the same WITH RECURSIVE walk documented beside task_dependency_edges.';

CREATE INDEX IF NOT EXISTS waypoint_dependency_edges_to_idx
    ON discovery.waypoint_dependency_edges (to_waypoint_id);

-- Defensive belt-and-suspenders alongside the application-level check
-- (mirroring reject_same_component_task_dependency_edge, inverted: waypoint
-- edges must stay WITHIN one trail).
CREATE OR REPLACE FUNCTION discovery.reject_cross_trail_waypoint_edge() RETURNS trigger AS $$
DECLARE
    from_trail_id UUID;
    to_trail_id UUID;
BEGIN
    SELECT trail_id INTO from_trail_id FROM discovery.waypoints WHERE id = NEW.from_waypoint_id;
    SELECT trail_id INTO to_trail_id FROM discovery.waypoints WHERE id = NEW.to_waypoint_id;
    IF from_trail_id IS DISTINCT FROM to_trail_id THEN
        RAISE EXCEPTION 'waypoint_dependency_edges: from_waypoint_id and to_waypoint_id belong to different trails (cross-trail edges are rejected)';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS waypoint_dependency_edges_reject_cross_trail ON discovery.waypoint_dependency_edges;
CREATE TRIGGER waypoint_dependency_edges_reject_cross_trail
    BEFORE INSERT ON discovery.waypoint_dependency_edges
    FOR EACH ROW EXECUTE FUNCTION discovery.reject_cross_trail_waypoint_edge();

-- =============================================================================
-- waypoint_assets — what resolving a waypoint produced
-- =============================================================================

CREATE TABLE IF NOT EXISTS discovery.waypoint_assets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    waypoint_id      UUID NOT NULL REFERENCES discovery.waypoints (id) ON DELETE CASCADE,
    ordinal          INTEGER NOT NULL,
    kind             TEXT NOT NULL,  -- e.g. 'research_summary', 'analysis',
                                     -- 'prototype_ref' (open set, like
                                     -- design_data_model_entries.kind)
    title            TEXT NOT NULL,
    content_markdown TEXT,           -- document assets: stored whole, rendered
                                     -- in the dashboard like spec docs
    repo_path        TEXT,           -- prototype assets: repo-relative path on
                                     -- main (no branches/worktrees, ever)
    commit_sha       TEXT,           -- the main-branch commit that contains it
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (waypoint_id, ordinal),
    CONSTRAINT waypoint_assets_document_xor_reference
        CHECK (num_nonnulls(content_markdown, repo_path) = 1),
    CONSTRAINT waypoint_assets_sha_requires_path
        CHECK (commit_sha IS NULL OR repo_path IS NOT NULL)
);
COMMENT ON TABLE discovery.waypoint_assets IS
    'Everything a waypoint''s resolution produced. Documents live here whole (no local files); prototype code lives in the repo on main and is referenced by path + commit. Exactly one of content_markdown / repo_path per row.';

-- =============================================================================
-- trail_terms — per-trail terminology pinned down mid-interview
-- =============================================================================

CREATE TABLE IF NOT EXISTS discovery.trail_terms (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trail_id   UUID NOT NULL REFERENCES discovery.trails (id) ON DELETE CASCADE,
    term       TEXT NOT NULL,
    definition TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (trail_id, term)
);
COMMENT ON TABLE discovery.trail_terms IS
    'Terminology pinned down while walking this trail (the old decision_terms). Definitions sharpen mid-trail via update_trail_term. Deliberately per-trail for now; promoting to a project-level ubiquitous-language glossary is a consciously deferred future effort.';

DROP TRIGGER IF EXISTS trail_terms_set_updated_at ON discovery.trail_terms;
CREATE TRIGGER trail_terms_set_updated_at
    BEFORE UPDATE ON discovery.trail_terms
    FOR EACH ROW EXECUTE FUNCTION discovery.set_updated_at();

-- =============================================================================
-- trail_lineage — a trail's parent edge (the session that chartered it, or
-- the waypoint that spurred it), replacing the free-text bypassReason "see
-- trail X" pattern with a real, atomically-created edge
-- =============================================================================

CREATE TABLE IF NOT EXISTS discovery.trail_lineage (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_trail_id     UUID NOT NULL UNIQUE REFERENCES discovery.trails (id) ON DELETE CASCADE,
    parent_kind        discovery.lineage_parent_kind NOT NULL,
    parent_session_id  UUID REFERENCES discovery.sessions (id),
    parent_waypoint_id UUID REFERENCES discovery.waypoints (id),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT trail_lineage_parent_matches_kind CHECK (
        (parent_kind = 'session'  AND parent_session_id  IS NOT NULL AND parent_waypoint_id IS NULL) OR
        (parent_kind = 'waypoint' AND parent_waypoint_id IS NOT NULL AND parent_session_id  IS NULL)
    )
);
COMMENT ON TABLE discovery.trail_lineage IS
    'Each trail''s single parent edge (child_trail_id is UNIQUE: at most one parent per trail). parent_kind is typed with dedicated FK columns per kind (not one opaque parent_id) so future parent kinds (e.g. a later "triage" kind) can be added by extending discovery.lineage_parent_kind plus a new nullable FK column, without redesigning this table, while keeping parent_waypoint_id directly queryable. spur_waypoint creates the child trail AND this row atomically in one transaction -- no bare pointer to a trail that may not exist yet. unspur_waypoint removes this row without touching the now-parentless child trail.';

CREATE INDEX IF NOT EXISTS trail_lineage_parent_waypoint_id_idx
    ON discovery.trail_lineage (parent_waypoint_id);
CREATE INDEX IF NOT EXISTS trail_lineage_parent_session_id_idx
    ON discovery.trail_lineage (parent_session_id);

-- =============================================================================
-- PART 3 — RUN-ENGINE TABLES (public schema)
--
-- The generic workflow engine's substrate (packages/engine /
-- packages/persistence PostgresRunStore, PostgresArtifactStore). Deliberately
-- created in the `public` schema to match the exact, unqualified table names
-- the run engine has always queried by in packages/persistence/src/index.ts --
-- moving them would require re-qualifying every run-engine query, which stays
-- out of scope for this rewrite. Carried over verbatim.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.runs (
    id text primary key,
    workflow_id text not null,
    snapshot_hash text not null,
    status text not null,
    current_node_id text not null,
    context jsonb not null default '{}'::jsonb,
    inputs jsonb not null default '{}'::jsonb,
    started_at timestamptz not null,
    ended_at timestamptz null,
    ended_at_node text null,
    workspace_path text not null,
    claimed_by text null,
    claimed_at timestamptz null,
    workflow_snapshot_yaml text null
);

CREATE TABLE IF NOT EXISTS public.run_events (
    run_id text not null references public.runs(id) on delete cascade,
    seq bigint not null,
    type text not null,
    ts timestamptz not null,
    payload jsonb not null,
    primary key (run_id, seq)
);

CREATE TABLE IF NOT EXISTS public.pending_human_interactions (
    run_id text primary key references public.runs(id) on delete cascade,
    node_id text not null,
    prompt text not null,
    allowed_signals jsonb not null,
    payload_schema jsonb null,
    deadline timestamptz null,
    resolved_at timestamptz null,
    resolved_signal text null,
    resolved_payload jsonb null
);

CREATE TABLE IF NOT EXISTS public.artifacts_meta (
    run_id text not null references public.runs(id) on delete cascade,
    name text not null,
    path text not null,
    content_hash text not null,
    version integer not null,
    authoring_node text not null,
    ts timestamptz not null,
    primary key (run_id, name)
);

CREATE TABLE IF NOT EXISTS public.run_locks (
    run_id text primary key references public.runs(id) on delete cascade,
    claimed_by text not null,
    claimed_at timestamptz not null
);
