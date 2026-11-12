CREATE TABLE `deployment_library_versions` (
	`deployment_id` text NOT NULL,
	`item_id` text NOT NULL,
	`slug` text NOT NULL,
	`version` text NOT NULL,
	PRIMARY KEY(`deployment_id`, `item_id`),
	FOREIGN KEY (`deployment_id`) REFERENCES `deployments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_deployment_library_versions_item` ON `deployment_library_versions` (`item_id`);--> statement-breakpoint
CREATE TABLE `library_item_files` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`path` text NOT NULL,
	`source` text NOT NULL,
	`hash` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `library_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_library_item_files_path` ON `library_item_files` (`item_id`,`path`);--> statement-breakpoint
CREATE TABLE `library_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`workspace_id` text,
	`kind` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_library_items_project` ON `library_items` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_library_items_slug` ON `library_items` (`project_id`,coalesce(`workspace_id`, ''),`kind`,`slug`);--> statement-breakpoint
CREATE TABLE `library_usages` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text,
	`consumer_item_id` text,
	`slug` text,
	`node_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`consumer_item_id`) REFERENCES `library_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `library_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_library_usages_workflow` ON `library_usages` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_library_usages_consumer_item` ON `library_usages` (`consumer_item_id`);--> statement-breakpoint
CREATE INDEX `idx_library_usages_slug` ON `library_usages` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_library_usages_node` ON `library_usages` (`node_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_library_usages_pair` ON `library_usages` (coalesce(`workflow_id`, ''),coalesce(`consumer_item_id`, ''),coalesce(`slug`, ''),coalesce(`node_id`, ''));--> statement-breakpoint
CREATE TABLE `library_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`version` text NOT NULL,
	`seq` integer NOT NULL,
	`files` text NOT NULL,
	`imports` text DEFAULT '[]' NOT NULL,
	`published_by` text,
	`published_at` text NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `library_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_library_versions_version` ON `library_versions` (`item_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_library_versions_seq` ON `library_versions` (`item_id`,`seq`);