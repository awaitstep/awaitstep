CREATE TABLE `project_connections` (
	`project_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `connection_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_project_connections_connection` ON `project_connections` (`connection_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_project_connections_default` ON `project_connections` (`project_id`) WHERE is_default = 1;--> statement-breakpoint
CREATE TABLE `workspace_connections` (
	`workspace_id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`set_by` text,
	`set_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_connections_connection` ON `workspace_connections` (`connection_id`);--> statement-breakpoint
ALTER TABLE `connections` ADD `project_id` text REFERENCES projects(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `idx_connections_project_id` ON `connections` (`project_id`);
--> statement-breakpoint
-- Every project starts with the accounts that served it before (2026-11-01), so no deploy stops
-- working: each added, and the default the account its latest successful deploy used, else its
-- only account, else none.
INSERT INTO project_connections (project_id, connection_id, is_default, created_by, created_at)
SELECT p.id, c.id,
  CASE WHEN c.id = COALESCE(
    (SELECT d.connection_id FROM deployments d
      INNER JOIN workflows w ON w.id = d.workflow_id
      INNER JOIN connections dc ON dc.id = d.connection_id
      WHERE w.project_id = p.id AND d.status = 'success' AND dc.organization_id = p.organization_id
        AND (dc.all_projects = 1 OR EXISTS (SELECT 1 FROM connection_projects dcp WHERE dcp.connection_id = dc.id AND dcp.project_id = p.id))
      ORDER BY d.created_at DESC, d.id DESC LIMIT 1),
    (SELECT CASE WHEN COUNT(*) = 1 THEN MIN(oc.id) END FROM connections oc
      WHERE oc.organization_id = p.organization_id AND (oc.all_projects = 1 OR EXISTS (SELECT 1 FROM connection_projects ocp WHERE ocp.connection_id = oc.id AND ocp.project_id = p.id)))
  ) THEN 1 ELSE 0 END,
  NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM projects p
INNER JOIN connections c ON c.organization_id = p.organization_id
WHERE (c.all_projects = 1 OR EXISTS (SELECT 1 FROM connection_projects cp WHERE cp.connection_id = c.id AND cp.project_id = p.id));
--> statement-breakpoint
-- `/{org}/{project}/connections` became a page: a workspace using that slug is renamed, as 0025 did.
UPDATE workspaces SET slug = slug || '-workspace'
WHERE slug = 'connections'
  AND NOT EXISTS (
    SELECT 1 FROM workspaces taken
    WHERE taken.project_id = workspaces.project_id AND taken.slug = workspaces.slug || '-workspace'
  );
--> statement-breakpoint
UPDATE workspaces SET slug = slug || '-' || rtrim(lower(replace(substr(id, 1, 8), '_', '-')), '-')
WHERE slug = 'connections';
