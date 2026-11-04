CREATE TABLE `__scope_backfill` (`key_id` text, `project_id` text, `workspace_id` text);--> statement-breakpoint
INSERT INTO `__scope_backfill` ("key_id", "project_id", "workspace_id") SELECT "id", "project_id", "workspace_id" FROM `api_keys`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`level` text NOT NULL,
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
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_key_id`) REFERENCES `api_keys`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_keys`("id", "organization_id", "level", "parent_key_id", "created_by", "name", "key_hash", "key_prefix", "key_suffix", "scopes", "permissions", "expires_at", "last_used_at", "revoked_at", "created_at") SELECT "id", "organization_id", "level", "parent_key_id", "created_by", "name", "key_hash", "key_prefix", "key_suffix", "scopes", "permissions", "expires_at", "last_used_at", "revoked_at", "created_at" FROM `api_keys`;--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
ALTER TABLE `__new_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_organization_id` ON `api_keys` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_parent_key_id` ON `api_keys` (`parent_key_id`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_key_hash` ON `api_keys` (`key_hash`);--> statement-breakpoint
INSERT INTO `api_key_projects` ("key_id", "project_id", "revoked_at") SELECT "key_id", "project_id", NULL FROM `__scope_backfill` WHERE "project_id" IS NOT NULL AND "workspace_id" IS NULL;--> statement-breakpoint
INSERT INTO `api_key_workspaces` ("key_id", "workspace_id", "revoked_at") SELECT "key_id", "workspace_id", NULL FROM `__scope_backfill` WHERE "workspace_id" IS NOT NULL;--> statement-breakpoint
DROP TABLE `__scope_backfill`;