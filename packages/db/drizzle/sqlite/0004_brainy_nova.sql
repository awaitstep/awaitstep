PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_deployments` (
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
INSERT INTO `__new_deployments`("id", "workflow_id", "version_id", "connection_id", "service_name", "service_url", "status", "error", "created_at") SELECT "id", "workflow_id", "version_id", "connection_id", "service_name", "service_url", "status", "error", "created_at" FROM `deployments`;--> statement-breakpoint
DROP TABLE `deployments`;--> statement-breakpoint
ALTER TABLE `__new_deployments` RENAME TO `deployments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_deployments_workflow_id` ON `deployments` (`workflow_id`);--> statement-breakpoint
CREATE TABLE `__new_workflow_runs` (
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
INSERT INTO `__new_workflow_runs`("id", "workflow_id", "version_id", "connection_id", "instance_id", "status", "output", "error", "created_at", "updated_at") SELECT "id", "workflow_id", "version_id", "connection_id", "instance_id", "status", "output", "error", "created_at", "updated_at" FROM `workflow_runs`;--> statement-breakpoint
DROP TABLE `workflow_runs`;--> statement-breakpoint
ALTER TABLE `__new_workflow_runs` RENAME TO `workflow_runs`;--> statement-breakpoint
CREATE INDEX `idx_workflow_runs_workflow_id` ON `workflow_runs` (`workflow_id`);