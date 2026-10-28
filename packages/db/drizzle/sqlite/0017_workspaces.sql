CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`colour` text DEFAULT 'green' NOT NULL,
	`created_by` text,
	`locked_by` text,
	`locked_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workspaces_project_slug` ON `workspaces` (`project_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_workspaces_project_id` ON `workspaces` (`project_id`);--> statement-breakpoint
ALTER TABLE `projects` ADD `locked_by` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `locked_at` text;--> statement-breakpoint
ALTER TABLE `workflows` ADD `workspace_id` text REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `idx_workflows_workspace_id` ON `workflows` (`workspace_id`);--> statement-breakpoint
-- Every existing project gets a "Default" workspace, dated with the project; no author, since nobody made it.
INSERT INTO `workspaces` (`id`, `project_id`, `name`, `slug`, `colour`, `created_at`, `updated_at`)
SELECT 'ws_' || lower(hex(randomblob(8))), `id`, 'Default', 'default', 'green', `created_at`, `created_at` FROM `projects`;--> statement-breakpoint
-- Every existing workflow goes in it. One workspace per project exists at this point, so the subquery is single-valued.
UPDATE `workflows` SET `workspace_id` = (SELECT `id` FROM `workspaces` WHERE `workspaces`.`project_id` = `workflows`.`project_id`) WHERE `workspace_id` IS NULL;--> statement-breakpoint
-- Project slugs the dashboard now routes to its own pages (RESERVED_SLUGS.project in @awaitstep/ir) move to
-- `<slug>-1`, or take a random suffix when a sibling already uses that.
UPDATE `projects` SET `slug` = CASE
	WHEN EXISTS (SELECT 1 FROM `projects` `p2` WHERE `p2`.`organization_id` = `projects`.`organization_id` AND `p2`.`slug` = `projects`.`slug` || '-1')
	THEN `slug` || '-' || lower(hex(randomblob(3)))
	ELSE `slug` || '-1'
END WHERE `slug` IN ('projects', 'resources', 'audit', 'inbox', 'whats-new', 'settings', 'account', 'items');--> statement-breakpoint
-- The same for organization slugs the app's top-level paths own (RESERVED_SLUGS.org); organization slugs are global.
UPDATE `organization` SET `slug` = CASE
	WHEN EXISTS (SELECT 1 FROM `organization` `o2` WHERE `o2`.`slug` = `organization`.`slug` || '-1')
	THEN `slug` || '-' || lower(hex(randomblob(3)))
	ELSE `slug` || '-1'
END WHERE `slug` IN ('api', 'account', 'api-playground', 'choose-org', 'connections', 'dashboard', 'env-vars', 'invite', 'runs', 'settings', 'sign-in', 'workflows');
