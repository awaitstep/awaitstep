CREATE TABLE `connection_projects` (
	`connection_id` text NOT NULL,
	`project_id` text NOT NULL,
	PRIMARY KEY(`connection_id`, `project_id`),
	FOREIGN KEY (`connection_id`) REFERENCES `connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_connection_projects_project` ON `connection_projects` (`project_id`);--> statement-breakpoint
ALTER TABLE `connections` ADD `all_projects` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `connections` ADD `token_status` text DEFAULT 'unchecked' NOT NULL;--> statement-breakpoint
ALTER TABLE `connections` ADD `token_expires_at` text;--> statement-breakpoint
ALTER TABLE `connections` ADD `token_checked_at` text;--> statement-breakpoint
CREATE INDEX `idx_connections_token_checked` ON `connections` (`token_checked_at`);