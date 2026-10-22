-- W0 removed eject: the IR is the only source of truth, so no row may claim
-- a stored bundle the code will never read. Data only — the source_mode,
-- source and base_generated_hash columns stay until the Phase 2 cleanup
-- migration drops them, and nothing is deployed, so these rows exist only
-- in development databases.
UPDATE "workflow_versions" SET "source_mode" = 'generated', "source" = NULL, "base_generated_hash" = NULL WHERE "source_mode" <> 'generated';
