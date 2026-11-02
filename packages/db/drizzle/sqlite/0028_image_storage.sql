CREATE TABLE `image` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_kind` text NOT NULL,
	`owner_id` text NOT NULL,
	`content_type` text NOT NULL,
	`bytes_len` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` text NOT NULL,
	`data` blob,
	`discarded_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_image_owner` ON `image` (`owner_kind`,`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_image_created` ON `image` (`created_at`);