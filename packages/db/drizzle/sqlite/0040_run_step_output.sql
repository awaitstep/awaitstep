ALTER TABLE `workflow_run_steps` ADD `output` text;--> statement-breakpoint
ALTER TABLE `workflow_run_steps` ADD `output_truncated` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_run_steps` ADD `attempts` text;