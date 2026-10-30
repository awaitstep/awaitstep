CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`event` text NOT NULL,
	`group_key` text NOT NULL,
	`project_id` text,
	`workspace_id` text,
	`access_request_id` text,
	`meta` text DEFAULT '{}' NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`needs_action` integer DEFAULT false NOT NULL,
	`read_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`access_request_id`) REFERENCES `access_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notifications_user_group` ON `notifications` (`user_id`,`group_key`);--> statement-breakpoint
CREATE INDEX `idx_notifications_inbox` ON `notifications` (`organization_id`,`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_updated` ON `notifications` (`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_notifications_access_request` ON `notifications` (`access_request_id`);--> statement-breakpoint
CREATE TABLE `release_visits` (
	`user_id` text PRIMARY KEY NOT NULL,
	`seen_at` text NOT NULL,
	`seen_ids` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Requests already waiting (B2) reach their addressee's Inbox: asking again can't.
INSERT INTO `notifications` (`id`, `organization_id`, `user_id`, `kind`, `event`, `group_key`, `project_id`, `workspace_id`, `access_request_id`, `meta`, `count`, `needs_action`, `read_at`, `created_at`, `updated_at`)
SELECT 'ntf_backfill_' || r.`id`, p.`organization_id`, r.`to_user_id`, 'request', 'access_request.create', 'access_request:' || r.`id`, p.`id`, w.`id`, r.`id`,
  json_object('person', coalesce(nullif(u.`name`, ''), u.`email`), 'workspace', w.`name`), 1, 1, NULL, r.`created_at`, r.`created_at`
FROM `access_requests` r
INNER JOIN `workspaces` w ON w.`id` = r.`workspace_id`
INNER JOIN `projects` p ON p.`id` = w.`project_id`
INNER JOIN `user` u ON u.`id` = r.`user_id`
WHERE r.`status` = 'pending'
ON CONFLICT DO NOTHING;
