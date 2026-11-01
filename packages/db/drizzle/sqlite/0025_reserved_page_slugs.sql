-- Slugs that became a page's URL (2026-11-01): a workspace called `members` would be hidden by
-- `/{org}/{project}/members`, a project called `api-keys` by `/{org}/api-keys`. Each is renamed with
-- a readable suffix, or its id when that is taken too (lowercased, `_` as `-`, so it stays a valid
-- slug), so the unique index never stops the migration.
UPDATE workspaces SET slug = slug || '-workspace'
WHERE slug IN ('workspaces', 'shared', 'members', 'api-keys', 'variables')
  AND NOT EXISTS (
    SELECT 1 FROM workspaces taken
    WHERE taken.project_id = workspaces.project_id AND taken.slug = workspaces.slug || '-workspace'
  );
--> statement-breakpoint
UPDATE workspaces SET slug = slug || '-' || rtrim(lower(replace(substr(id, 1, 8), '_', '-')), '-')
WHERE slug IN ('workspaces', 'shared', 'members', 'api-keys', 'variables');
--> statement-breakpoint
UPDATE projects SET slug = slug || '-project'
WHERE slug IN ('connections', 'api-keys')
  AND NOT EXISTS (
    SELECT 1 FROM projects taken
    WHERE taken.organization_id = projects.organization_id AND taken.slug = projects.slug || '-project'
  );
--> statement-breakpoint
UPDATE projects SET slug = slug || '-' || rtrim(lower(replace(substr(id, 1, 8), '_', '-')), '-')
WHERE slug IN ('connections', 'api-keys');
