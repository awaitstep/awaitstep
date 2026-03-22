PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`created_by` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` text,
	`last_used_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_keys`("id", "project_id", "created_by", "name", "key_hash", "key_prefix", "scopes", "expires_at", "last_used_at", "revoked_at", "created_at") SELECT "id", "project_id", "created_by", "name", "key_hash", "key_prefix", "scopes", "expires_at", "last_used_at", "revoked_at", "created_at" FROM `api_keys`;--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
ALTER TABLE `__new_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_project_id` ON `api_keys` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_key_hash` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE TABLE `__new_env_vars` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`created_by` text NOT NULL,
	`name` text NOT NULL,
	`value` text NOT NULL,
	`is_secret` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_env_vars`("id", "organization_id", "project_id", "created_by", "name", "value", "is_secret", "created_at", "updated_at") SELECT "id", "organization_id", "project_id", "created_by", "name", "value", "is_secret", "created_at", "updated_at" FROM `env_vars`;--> statement-breakpoint
DROP TABLE `env_vars`;--> statement-breakpoint
ALTER TABLE `__new_env_vars` RENAME TO `env_vars`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_env_vars_org_name` ON `env_vars` (`organization_id`,`project_id`,`name`);--> statement-breakpoint
CREATE INDEX `idx_env_vars_org_id` ON `env_vars` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_env_vars_project_id` ON `env_vars` (`project_id`);--> statement-breakpoint
CREATE TABLE `__new_workflows` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`created_by` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`current_version_id` text,
	`env_vars` text,
	`trigger_code` text,
	`dependencies` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_workflows`("id", "project_id", "created_by", "name", "description", "current_version_id", "env_vars", "trigger_code", "dependencies", "created_at", "updated_at") SELECT "id", "project_id", "created_by", "name", "description", "current_version_id", "env_vars", "trigger_code", "dependencies", "created_at", "updated_at" FROM `workflows`;--> statement-breakpoint
DROP TABLE `workflows`;--> statement-breakpoint
ALTER TABLE `__new_workflows` RENAME TO `workflows`;--> statement-breakpoint
CREATE INDEX `idx_workflows_project_id` ON `workflows` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_workflows_created_by` ON `workflows` (`created_by`);