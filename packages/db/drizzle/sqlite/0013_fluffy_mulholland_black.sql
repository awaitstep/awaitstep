CREATE TABLE `test_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_id` text,
	`version_id` text,
	`user_id` text NOT NULL,
	`runtime` text NOT NULL,
	`container_id` text NOT NULL,
	`process_id` text,
	`port` integer,
	`slot` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'starting' NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`last_used_at` text NOT NULL,
	`stopped_at` text,
	FOREIGN KEY (`workflow_id`) REFERENCES `workflows`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`version_id`) REFERENCES `workflow_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_test_sessions_workflow_id` ON `test_sessions` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `idx_test_sessions_user_status` ON `test_sessions` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_test_sessions_status_last_used` ON `test_sessions` (`status`,`last_used_at`);--> statement-breakpoint
CREATE INDEX `idx_test_sessions_workflow_created` ON `test_sessions` (`workflow_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_test_sessions_live_slot` ON `test_sessions` (`user_id`,`slot`) WHERE "test_sessions"."status" in ('starting', 'running');