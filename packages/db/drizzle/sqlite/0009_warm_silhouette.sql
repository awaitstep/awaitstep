ALTER TABLE `workflow_versions` ADD `source_mode` text DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_versions` ADD `source` text;--> statement-breakpoint
ALTER TABLE `workflow_versions` ADD `manifest` text;--> statement-breakpoint
ALTER TABLE `workflow_versions` ADD `base_generated_hash` text;