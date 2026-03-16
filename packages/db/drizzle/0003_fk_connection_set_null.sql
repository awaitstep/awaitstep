-- Recreate workflow_runs with ON DELETE SET NULL for connection_id
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
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
	FOREIGN KEY (`connection_id`) REFERENCES `cf_connections`(`id`) ON UPDATE no action ON DELETE set null
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
-- Recreate deployments with ON DELETE SET NULL for connection_id
CREATE TABLE `deployments_new` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`version_id` text NOT NULL,
	`connection_id` text,
	`worker_name` text NOT NULL,
	`worker_url` text,
	`status` text DEFAULT 'success' NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`version_id`) REFERENCES `workflow_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`connection_id`) REFERENCES `cf_connections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `deployments_new` SELECT * FROM `deployments`;
--> statement-breakpoint
DROP TABLE `deployments`;
--> statement-breakpoint
ALTER TABLE `deployments_new` RENAME TO `deployments`;
--> statement-breakpoint
CREATE INDEX `idx_deployments_workflow_id` ON `deployments` (`workflow_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
