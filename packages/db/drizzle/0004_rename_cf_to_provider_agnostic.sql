-- Step 1: Rename cf_connections → connections and replace columns
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`name` text NOT NULL,
	`credentials` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `connections` (`id`, `user_id`, `provider`, `name`, `credentials`, `created_at`, `updated_at`)
  SELECT `id`, `user_id`, 'cloudflare', `name`, json_object('accountId', `account_id`, 'apiToken', `api_token`), `created_at`, `updated_at`
  FROM `cf_connections`;
--> statement-breakpoint
DROP TABLE `cf_connections`;
--> statement-breakpoint
CREATE INDEX `idx_connections_user_id` ON `connections` (`user_id`);
--> statement-breakpoint
-- Step 2: Recreate workflow_runs with FK to connections
CREATE TABLE `workflow_runs_new` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`version_id` text NOT NULL,
	`connection_id` text,
	`instance_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`output` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `workflow_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `workflow_runs_new` SELECT * FROM `workflow_runs`;
--> statement-breakpoint
DROP TABLE `workflow_runs`;
--> statement-breakpoint
ALTER TABLE `workflow_runs_new` RENAME TO `workflow_runs`;
--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workflow_id` ON `workflow_runs` (`workflow_id`);
--> statement-breakpoint
-- Step 3: Recreate deployments with FK to connections and renamed columns
CREATE TABLE `deployments_new` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`version_id` text NOT NULL,
	`connection_id` text,
	`service_name` text NOT NULL,
	`service_url` text,
	`status` text DEFAULT 'success' NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `workflow_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `deployments_new` (`id`, `workflow_id`, `version_id`, `connection_id`, `service_name`, `service_url`, `status`, `error`, `created_at`)
  SELECT `id`, `workflow_id`, `version_id`, `connection_id`, `worker_name`, `worker_url`, `status`, `error`, `created_at`
  FROM `deployments`;
--> statement-breakpoint
DROP TABLE `deployments`;
--> statement-breakpoint
ALTER TABLE `deployments_new` RENAME TO `deployments`;
--> statement-breakpoint
CREATE INDEX `idx_deployments_workflow_id` ON `deployments` (`workflow_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
