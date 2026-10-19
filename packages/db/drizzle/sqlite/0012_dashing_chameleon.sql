CREATE TABLE `workflow_files` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text NOT NULL,
	`path` text NOT NULL,
	`source` text NOT NULL,
	`hash` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workflow_files_workflow_id` ON `workflow_files` (`workflow_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_workflow_files_path` ON `workflow_files` (`workflow_id`,`path`);