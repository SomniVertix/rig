-- =============================================================================
-- init.sql
--
-- Entrypoint to bootstrap a fresh database for the spec pipeline. Run this
-- against an empty database; it includes schema.sql (the canonical DDL) and
-- leaves the session's search_path pointed at spec_pipeline.
--
--   createdb relentless_specs
--   psql -d relentless_specs -f init.sql
--
-- schema.sql is also safe to run standalone (e.g. by migration/diff tooling)
-- since it is self-contained (creates its own extension and schema).
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

\i schema.sql

COMMIT;

\echo 'spec_pipeline schema initialized.'
