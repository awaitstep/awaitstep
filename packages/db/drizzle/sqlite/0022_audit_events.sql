CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`workspace_id` text,
	`level` text NOT NULL,
	`kind` text NOT NULL,
	`event` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`actor_email` text,
	`action` text NOT NULL,
	`target` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`ip` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_events_org_created` ON `audit_events` (`organization_id`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_actor_event` ON `audit_events` (`actor_id`,`event`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_events_created` ON `audit_events` (`created_at`);