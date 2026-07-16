-- =============================================================================
-- schema.sql
--
-- Canonical Postgres schema for the spec pipeline defined in ../README.md and
-- the three stage templates (requirements.template.md, design.template.md,
-- tasks.template.md) plus the grilling-session decisions.md artifact and
-- status.json pipeline state.
--
-- One "project" (spec_pipeline.projects) is the tenant scope for everything
-- below it; project_id NULL on a row means a bundled/global default (bundled
-- prompts/agents, bundled workflows).
--
-- One "spec" (spec_pipeline.specs) is the parent of everything else, scoped to
-- a project:
--   projects
--     -> specs
--          -> spec_stages                 (status.json: per-stage approve/deny state)
--          -> grilling_sessions           (decisions.md header)
--              -> decisions               (decisions.md "## Decisions" Q&A entries)
--              -> decision_terms          (decisions.md "## Terminology")
--          -> requirements                (requirements.md)
--              -> user_stories            (requirements.md "## User Stories")
--                  -> acceptance_criteria (EARS criteria under each story)
--              -> non_goals
--              -> assumptions_open_questions
--              -> requirement_glossary_terms
--          -> designs                     (design.md)
--              -> design_components       (design.md "## Components", Story 15)
--              -> design_data_model_entries
--              -> design_traceability
--              -> design_alternatives_considered
--              -> design_open_risks
--              -> design_flags
--          -> tasks_docs                  (tasks.md, one row per design_component, Story 15/16)
--              -> task_items              (Order + Task List + Subtasks, unified)
--                  -> task_files_touched
--              -> parallel_batches
--                  -> parallel_batch_members
--              -> tasks_flags
--          -> task_dependency_edges       (cross-component edges between task_items, Story 16)
--          -> definition_of_done_items    (spec-wide scope, Story 16.9)
--     -> prompts / workflows              (project_id NULL = bundled default, Story 3, 4)
--          -> prompt_snapshots / workflow_snapshots (version history)
--
-- known_actors / audit_log (Story 11, 14.4) track attribution across every
-- write tool in the feature, independent of any single spec/project.
--
-- Also consolidates the run-engine tables (runs, run_events,
-- pending_human_interactions, artifacts_meta, run_locks) formerly shipped in
-- packages/persistence/migrations/001_init.sql. They are deliberately kept in
-- the `public` schema (not spec_pipeline) to match the unqualified table names
-- packages/persistence/src/index.ts has always queried them by -- moving them
-- into spec_pipeline would additionally require re-qualifying every run-engine
-- query, which is out of scope for this schema evolution (Story 13.1, 13.2).
--
-- Deliberately avoids JSONB for spec-pipeline data: every element the
-- templates define has a fixed, known shape, so it is broken into real
-- columns/rows instead of a blob. (The pre-existing run-engine tables and
-- workflow definitions keep their JSONB columns as-is.)
--
-- Requires PostgreSQL >= 13 (identity columns, gen_random_uuid() available via
-- pgcrypto below). Every statement below is written to be idempotent --
-- CREATE ... IF NOT EXISTS, CREATE OR REPLACE, guarded ALTER / DROP CONSTRAINT
-- IF EXISTS, or a DO block catching duplicate_object -- so this single file
-- can be re-applied in full against an already-migrated database with no
-- errors (Story 13.1). This is the only boot-time DDL script; there is no
-- separate migrations runner/directory (Story 13.2).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS spec_pipeline;

SET search_path TO spec_pipeline;

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

DO $$ BEGIN
    CREATE TYPE spec_pipeline.grilling_status AS ENUM (
        'in_progress',
        'complete',
        'abandoned'
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
-- projects — tenant/workspace scope for specs, prompts, and workflows (Story 4)
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
    'Top-level tenant scope. A NULL project_id elsewhere means a bundled/global default row (Story 4.3, 4.5).';

DROP TRIGGER IF EXISTS projects_set_updated_at ON spec_pipeline.projects;
CREATE TRIGGER projects_set_updated_at
    BEFORE UPDATE ON spec_pipeline.projects
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

-- =============================================================================
-- specs — one row per feature-slug folder (.relentless/specs/<feature-slug>/),
-- scoped to a project.
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.specs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID REFERENCES spec_pipeline.projects (id),
    slug          TEXT NOT NULL,
    feature_name  TEXT NOT NULL,
    current_stage spec_pipeline.spec_stage_name NOT NULL DEFAULT 'requirements',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT specs_slug_is_kebab_case CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
COMMENT ON TABLE spec_pipeline.specs IS
    'One row per .relentless/specs/<feature-slug>/ folder, scoped to a project. Parent of the whole pipeline for a feature.';

-- Evolution from a pre-project database: add project scoping and move slug
-- uniqueness from global to per-project so two projects can share a slug
-- (Story 4.1).
ALTER TABLE spec_pipeline.specs ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES spec_pipeline.projects (id);
ALTER TABLE spec_pipeline.specs DROP CONSTRAINT IF EXISTS specs_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS specs_project_id_slug_key
    ON spec_pipeline.specs (project_id, slug);

DROP TRIGGER IF EXISTS specs_set_updated_at ON spec_pipeline.specs;
CREATE TRIGGER specs_set_updated_at
    BEFORE UPDATE ON spec_pipeline.specs
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

-- status.json: {"stage": ..., "requirements": ..., "design": ..., "tasks": ...}
CREATE TABLE IF NOT EXISTS spec_pipeline.spec_stages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spec_id    UUID NOT NULL REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE,
    stage_name spec_pipeline.spec_stage_name NOT NULL,
    status     spec_pipeline.stage_status NOT NULL DEFAULT 'not_started',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (spec_id, stage_name)
);
COMMENT ON TABLE spec_pipeline.spec_stages IS
    'status.json per-stage approve/deny state. Exactly one row per (spec, stage). For stage_name=''tasks'' this is a spec-wide aggregate/cache: finalize_stage never sets it directly (Story 16.5, 16.7).';

DROP TRIGGER IF EXISTS spec_stages_set_updated_at ON spec_pipeline.spec_stages;
CREATE TRIGGER spec_stages_set_updated_at
    BEFORE UPDATE ON spec_pipeline.spec_stages
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

-- Auto-seed the three stage rows (all not_started) whenever a spec is created,
-- matching README.md's "brand new spec" default.
CREATE OR REPLACE FUNCTION spec_pipeline.seed_spec_stages() RETURNS trigger AS $$
BEGIN
    INSERT INTO spec_pipeline.spec_stages (spec_id, stage_name)
    VALUES (NEW.id, 'requirements'),
           (NEW.id, 'design'),
           (NEW.id, 'tasks');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS specs_seed_stages ON spec_pipeline.specs;
CREATE TRIGGER specs_seed_stages
    AFTER INSERT ON spec_pipeline.specs
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.seed_spec_stages();

-- =============================================================================
-- decisions.md — grilling-session provenance record
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.grilling_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spec_id            UUID REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE,
    session_name       TEXT NOT NULL,
    start_date         TIMESTAMPTZ NOT NULL,
    last_updated_date  TIMESTAMPTZ NOT NULL,
    status             spec_pipeline.grilling_status NOT NULL DEFAULT 'in_progress',
    initial_prompt     TEXT NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE spec_pipeline.grilling_sessions IS
    'decisions.md header/front-matter: the raw Q&A interview that precedes requirements.md.';

-- Only one decisions.md per spec, but a session may exist before a spec_id is assigned.
CREATE UNIQUE INDEX IF NOT EXISTS grilling_sessions_one_per_spec
    ON spec_pipeline.grilling_sessions (spec_id)
    WHERE spec_id IS NOT NULL;

DROP TRIGGER IF EXISTS grilling_sessions_set_updated_at ON spec_pipeline.grilling_sessions;
CREATE TRIGGER grilling_sessions_set_updated_at
    BEFORE UPDATE ON spec_pipeline.grilling_sessions
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

CREATE TABLE IF NOT EXISTS spec_pipeline.decisions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES spec_pipeline.grilling_sessions (id) ON DELETE CASCADE,
    question_number INTEGER NOT NULL,
    question_text   TEXT NOT NULL,
    resolution      TEXT NOT NULL,
    rationale       TEXT,
    UNIQUE (session_id, question_number)
);
COMMENT ON TABLE spec_pipeline.decisions IS
    'decisions.md "## Decisions" entries: one row per Q<n> resolved during the interview.';

CREATE TABLE IF NOT EXISTS spec_pipeline.decision_terms (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES spec_pipeline.grilling_sessions (id) ON DELETE CASCADE,
    term       TEXT NOT NULL,
    definition TEXT NOT NULL,
    UNIQUE (session_id, term)
);
COMMENT ON TABLE spec_pipeline.decision_terms IS
    'decisions.md "## Terminology" entries introduced during the session.';

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

-- =============================================================================
-- design_components — design.md "## Components" (Story 15)
-- =============================================================================

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
    'design.md "## Components" table rows: slug | display name | responsibility. Mandatory >=1 row is enforced at design finalize, not by schema (Story 15.1, 15.2).';

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
-- tasks.md — one tasks_docs row per declared design_component (Stories 15, 16)
-- =============================================================================

-- Evolution of the pre-component tasks_docs table:
--   * drop UNIQUE(spec_id) (one row per spec -> one row per component)
--   * add component linkage + per-component status
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
    UNIQUE (spec_id, component_slug),           -- strict 1:1 mapping (Story 15.7)
    UNIQUE (design_component_id)                -- exactly one doc per component
);
COMMENT ON TABLE spec_pipeline.tasks_docs IS
    'tasks.md: one row per design_component, each with its own independent lifecycle status (Story 16.5).';

-- Evolution from a pre-component database: add the new linkage columns
-- (nullable at the ALTER layer so an already-populated pre-evolution table
-- doesn't fail the ADD COLUMN; a fresh install gets the NOT NULL shape above
-- directly) and drop the old single-row-per-spec constraint.
ALTER TABLE spec_pipeline.tasks_docs ADD COLUMN IF NOT EXISTS design_component_id UUID REFERENCES spec_pipeline.design_components (id) ON DELETE CASCADE;
ALTER TABLE spec_pipeline.tasks_docs ADD COLUMN IF NOT EXISTS component_slug TEXT;
ALTER TABLE spec_pipeline.tasks_docs ADD COLUMN IF NOT EXISTS component_name TEXT;
ALTER TABLE spec_pipeline.tasks_docs ADD COLUMN IF NOT EXISTS status spec_pipeline.stage_status NOT NULL DEFAULT 'not_started';
ALTER TABLE spec_pipeline.tasks_docs DROP CONSTRAINT IF EXISTS tasks_docs_spec_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_docs_spec_id_component_slug_key
    ON spec_pipeline.tasks_docs (spec_id, component_slug);
CREATE UNIQUE INDEX IF NOT EXISTS tasks_docs_design_component_id_key
    ON spec_pipeline.tasks_docs (design_component_id);

DROP TRIGGER IF EXISTS tasks_docs_set_updated_at ON spec_pipeline.tasks_docs;
CREATE TRIGGER tasks_docs_set_updated_at
    BEFORE UPDATE ON spec_pipeline.tasks_docs
    FOR EACH ROW EXECUTE FUNCTION spec_pipeline.set_updated_at();

-- Auto-seed one tasks_docs row per declared design_component the moment design
-- reaches 'in_review' (the "Components section finalized" moment). Insert-only
-- (ON CONFLICT DO NOTHING): this trigger never deletes a tasks_docs row. The
-- delete-if-empty/reject-if-drafted redraft-reconciliation mechanic lives
-- entirely in finalize_stage('design') application code (T5.6) -- exactly one
-- place owns that logic (Story 15.5, 15.6).
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
-- task_dependency_edges — cross-component dependency graph (Story 16)
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
    '"from" blocks "to" (from must complete before to). Additive to each component''s own intra-component Order/Parallel Execution Schema (Story 16.1). No cycle detection on insert (Story 16.3) -- see finalize_stage''s WITH RECURSIVE check instead (Story 16.4).';

CREATE INDEX IF NOT EXISTS task_dependency_edges_to_idx
    ON spec_pipeline.task_dependency_edges (to_task_item_id);

-- Defensive belt-and-suspenders check alongside the application-level
-- same-component rejection in add_task_dependency_edge (Story 16.2): reject at
-- the DB layer too if both endpoints resolve to the same tasks_doc_id, even if
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

-- Cycle detection is NOT a trigger (Story 16.3: no cycle check on add). It is
-- run explicitly by finalize_stage application code for any component,
-- walking *all* of the spec's edges:
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
    'tasks.md "## Parallel Execution Schema" batches (P1, P2, ...), run in batch_order sequence. Intra-component (Story 16.1).';

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
    'tasks.md "## Flags" list items: gaps/assumptions from insufficient design.md. Stays keyed on tasks_doc_id, i.e. per-component (Story 16.10).';

-- =============================================================================
-- definition_of_done_items — moved to spec scope, shared across a spec's
-- component tasks_docs (Story 16.9)
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.definition_of_done_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spec_id     UUID NOT NULL REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE,
    ordinal     INTEGER NOT NULL,
    description TEXT NOT NULL,
    is_checked  BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (spec_id, ordinal)
);
COMMENT ON TABLE spec_pipeline.definition_of_done_items IS
    'tasks.md top-level "## Definition of Done" checklist, shared across every component tasks_doc under one spec_id (Story 16.9).';

-- Evolution from a pre-component database where this table was keyed on
-- tasks_doc_id instead: add the new spec_id linkage (nullable at the ALTER
-- layer; a fresh install gets the NOT NULL shape above directly), drop the old
-- per-tasks_doc uniqueness and the old column.
ALTER TABLE spec_pipeline.definition_of_done_items ADD COLUMN IF NOT EXISTS spec_id UUID REFERENCES spec_pipeline.specs (id) ON DELETE CASCADE;
ALTER TABLE spec_pipeline.definition_of_done_items DROP CONSTRAINT IF EXISTS definition_of_done_items_tasks_doc_id_ordinal_key;
ALTER TABLE spec_pipeline.definition_of_done_items DROP COLUMN IF EXISTS tasks_doc_id;
CREATE UNIQUE INDEX IF NOT EXISTS definition_of_done_items_spec_id_ordinal_key
    ON spec_pipeline.definition_of_done_items (spec_id, ordinal);

-- =============================================================================
-- prompts / prompt_snapshots — versioned prompt & agent library (Stories 3, 4, 13)
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.prompts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID REFERENCES spec_pipeline.projects (id) ON DELETE CASCADE, -- NULL = bundled
    prompt_key      TEXT NOT NULL,           -- e.g. 'design-drafter'
    kind            TEXT NOT NULL,           -- 'agent' | 'prompt'
    body            TEXT NOT NULL,
    description     TEXT,
    origin          TEXT NOT NULL DEFAULT 'user',    -- 'bundled' | 'user' (Story 13.5)
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE spec_pipeline.prompts IS
    'Versioned prompt/agent library. project_id IS NULL rows are bundled defaults; a project-scoped row shadows the bundled row of the same prompt_key for that project only (Story 4.4), never the reverse, and no per-project copy is ever created (Story 4.5).';

-- project-scoped uniqueness AND a distinct project-less (bundled) uniqueness:
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
    'Prior body/description captured on every prompt update, before current_version is bumped (Story 3.2, 3.3).';

-- =============================================================================
-- workflows / workflow_snapshots — brought into the canonical DDL from the
-- now-retired packages/persistence/migrations/001_init.sql, extended with
-- project scoping + origin (Story 2, 13.3-13.5)
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.workflows (
    id         TEXT PRIMARY KEY,
    definition JSONB NOT NULL,
    project_id UUID REFERENCES spec_pipeline.projects (id), -- NULL = bundled
    origin     TEXT NOT NULL DEFAULT 'user',                -- 'bundled' | 'user' (Story 13.5)
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE spec_pipeline.workflows IS
    'Workflow definitions. project_id IS NULL rows are bundled defaults (Story 2, 4.3). Previously dormant in the public schema via 001_init.sql; now the canonical write target replacing the file-based .relentless/workflows/*.yaml path for normal operation (Story 2.1-2.3).';

ALTER TABLE spec_pipeline.workflows ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES spec_pipeline.projects (id);
ALTER TABLE spec_pipeline.workflows ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'user';

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
-- known_actors / audit_log — attribution & append-only audit trail (Story 11, 14.4)
-- =============================================================================

CREATE TABLE IF NOT EXISTS spec_pipeline.known_actors (
    actor      TEXT PRIMARY KEY,
    source     TEXT NOT NULL,        -- file/dir the name was discovered in
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE spec_pipeline.known_actors IS
    'Registry of valid actor names, synced at boot from spec-templates/agents/*.md (Story 11.5). Every write tool''s required actor argument is validated against this table.';

CREATE TABLE IF NOT EXISTS spec_pipeline.audit_log (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor      TEXT NOT NULL,
    action     TEXT NOT NULL,        -- 'insert' | 'update' | 'delete' | 'finalize'
    table_name TEXT NOT NULL,
    row_id     TEXT NOT NULL,
    project_id UUID,
    ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE spec_pipeline.audit_log IS
    'Append-only: every write tool inserts exactly one row in the same transaction as its mutation (Story 11.2). No UPDATE/DELETE path is exercised by any application code in this feature (Story 11.3), and no row-count constraint is imposed (Story 14.4).';

CREATE INDEX IF NOT EXISTS audit_log_ts_idx ON spec_pipeline.audit_log (ts);

-- =============================================================================
-- Run-engine tables (packages/engine / packages/persistence PostgresRunStore,
-- PostgresArtifactStore). Consolidated here from the now-removed
-- packages/persistence/migrations/001_init.sql (Story 13.1, 13.2) so a fresh
-- database boots with zero manual bootstrap step. Deliberately created in the
-- `public` schema (not spec_pipeline) to match the exact, unqualified table
-- names the run engine has always queried by in
-- packages/persistence/src/index.ts -- moving them into spec_pipeline would
-- additionally require re-qualifying every run-engine query, which is out of
-- scope for this schema evolution.
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

-- The `SET search_path TO spec_pipeline;` above is a session-level setting; it
-- must not leak onto the pooled connection this script ran on, or every later
-- unqualified query issued by a different part of the app over that same
-- reused connection (e.g. PostgresRunStore's unqualified `runs`/`run_events`
-- queries, which intentionally live in the public schema, see above) would
-- silently stop resolving. Reset it back to the connection's default before
-- this client is released back into the pool.
RESET search_path;
