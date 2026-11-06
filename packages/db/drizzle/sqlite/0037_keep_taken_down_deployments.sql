ALTER TABLE `deployments` ADD `taken_down_at` text;--> statement-breakpoint
ALTER TABLE `deployments` ADD `taken_down_by` text;--> statement-breakpoint
CREATE INDEX `idx_deployments_workflow_connection` ON `deployments` (`workflow_id`,`connection_id`);