PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`organization_id` text,
	`created_by` text NOT NULL,
	`name` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`scopes` text NOT NULL,
	`expires_at` text,
	`last_used_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "api_keys_one_level" CHECK((project_id IS NULL) <> (organization_id IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_api_keys`("id", "project_id", "organization_id", "created_by", "name", "key_hash", "key_prefix", "scopes", "expires_at", "last_used_at", "revoked_at", "created_at") SELECT "id", "project_id", NULL, "created_by", "name", "key_hash", "key_prefix", "scopes", "expires_at", "last_used_at", "revoked_at", "created_at" FROM `api_keys`;--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
ALTER TABLE `__new_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_hash_unique` ON `api_keys` (`key_hash`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_project_id` ON `api_keys` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_organization_id` ON `api_keys` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_api_keys_key_hash` ON `api_keys` (`key_hash`);