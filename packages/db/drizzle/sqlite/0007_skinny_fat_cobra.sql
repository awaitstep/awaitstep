CREATE TABLE `deployment_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`provider` text NOT NULL,
	`config` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_deployment_configs_workflow_connection` ON `deployment_configs` (`workflow_id`,`connection_id`);--> statement-breakpoint
CREATE INDEX `idx_deployment_configs_workflow_id` ON `deployment_configs` (`workflow_id`);--> statement-breakpoint
ALTER TABLE `deployments` ADD `config_snapshot` text;