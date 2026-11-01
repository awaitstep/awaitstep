CREATE TABLE `env_var_projects` (
	`env_var_id` text NOT NULL,
	`project_id` text NOT NULL,
	PRIMARY KEY(`env_var_id`, `project_id`),
	FOREIGN KEY (`env_var_id`) REFERENCES `env_vars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_env_var_projects_project` ON `env_var_projects` (`project_id`);--> statement-breakpoint
CREATE TABLE `env_var_workspaces` (
	`env_var_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	PRIMARY KEY(`env_var_id`, `workspace_id`),
	FOREIGN KEY (`env_var_id`) REFERENCES `env_vars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_env_var_workspaces_workspace` ON `env_var_workspaces` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `env_vars` ADD `all_places` integer DEFAULT true NOT NULL;