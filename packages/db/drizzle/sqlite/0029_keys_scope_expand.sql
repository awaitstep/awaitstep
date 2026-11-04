CREATE TABLE `api_key_projects` (
	`key_id` text NOT NULL,
	`project_id` text NOT NULL,
	`revoked_at` text,
	PRIMARY KEY(`key_id`, `project_id`),
	FOREIGN KEY (`key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_api_key_projects_project` ON `api_key_projects` (`project_id`);--> statement-breakpoint
CREATE TABLE `api_key_workspaces` (
	`key_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`revoked_at` text,
	PRIMARY KEY(`key_id`, `workspace_id`),
	FOREIGN KEY (`key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_api_key_workspaces_workspace` ON `api_key_workspaces` (`workspace_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`organization_id` text,
	`workspace_id` text,
	`level` text,
	`parent_key_id` text,
	`created_by` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`key_suffix` text,
	`scopes` text NOT NULL,
	`permissions` text DEFAULT '{}' NOT NULL,
	`expires_at` text,
	`last_used_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_keys`("id", "project_id", "organization_id", "workspace_id", "level", "parent_key_id", "created_by", "name", "key_hash", "key_prefix", "key_suffix", "scopes", "permissions", "expires_at", "last_used_at", "revoked_at", "created_at") SELECT "id", "project_id", COALESCE("organization_id", (SELECT "organization_id" FROM `projects` WHERE `projects`.`id` = `api_keys`.`project_id`)), "workspace_id", CASE WHEN "workspace_id" IS NOT NULL THEN 'workspace' WHEN "project_id" IS NOT NULL THEN 'project' ELSE 'organization' END, "parent_key_id", "created_by", "name", "key_hash", "key_prefix", "key_suffix", "scopes", "permissions", "expires_at", "last_used_at", "revoked_at", "created_at" FROM `api_keys`;--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
ALTER TABLE `__new_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_organization_id` ON `api_keys` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_parent_key_id` ON `api_keys` (`parent_key_id`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_key_hash` ON `api_keys` (`key_hash`);