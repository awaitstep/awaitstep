ALTER TABLE `workflow_versions` ADD `locked` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `workflows` ADD `trigger_code` text;--> statement-breakpoint
ALTER TABLE `workflows` ADD `dependencies` text;