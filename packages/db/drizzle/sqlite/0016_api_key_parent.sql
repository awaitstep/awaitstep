ALTER TABLE `api_keys` ADD `parent_key_id` text REFERENCES api_keys(id) ON DELETE cascade;--> statement-breakpoint
CREATE INDEX `idx_api_keys_parent_key_id` ON `api_keys` (`parent_key_id`);