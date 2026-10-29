CREATE TABLE `access_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`to_user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`already_editing` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text,
	`decided_by` text,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_access_requests_workspace_id` ON `access_requests` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_access_requests_user_id` ON `access_requests` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_access_requests_to_user_id` ON `access_requests` (`to_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_access_requests_pending` ON `access_requests` (`workspace_id`,`user_id`) WHERE status = 'pending';--> statement-breakpoint
CREATE TABLE `invitation_places` (
	`id` text PRIMARY KEY NOT NULL,
	`invitation_id` text NOT NULL,
	`project_id` text NOT NULL,
	`workspace_id` text,
	`role` text NOT NULL,
	FOREIGN KEY (`invitation_id`) REFERENCES `invitation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_invitation_places_invitation_id` ON `invitation_places` (`invitation_id`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_project_members_user_id` ON `project_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_by` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_workspace_members_user_id` ON `workspace_members` (`user_id`);--> statement-breakpoint
ALTER TABLE `invitation` ADD `askedForNewAt` text;--> statement-breakpoint
-- A member's role as better-auth stores it may be a comma-joined list ('admin,member'). The highest one
-- counts (the API's parseOrgRole rule), and from here on the SQL compares roles exactly, so it is written back as one word.
UPDATE `member` SET `role` = 'owner' WHERE `role` <> 'owner' AND (',' || replace(`role`, ' ', '') || ',') LIKE '%,owner,%';--> statement-breakpoint
UPDATE `member` SET `role` = 'admin' WHERE `role` NOT IN ('owner', 'admin') AND (',' || replace(`role`, ' ', '') || ',') LIKE '%,admin,%';--> statement-breakpoint
UPDATE `member` SET `role` = 'member' WHERE `role` NOT IN ('owner', 'admin', 'member');--> statement-breakpoint
-- The same for pending invitations better-auth wrote: accepting copies the role into the member row.
UPDATE `invitation` SET `role` = 'owner' WHERE `role` IS NOT NULL AND `role` <> 'owner' AND (',' || replace(`role`, ' ', '') || ',') LIKE '%,owner,%';--> statement-breakpoint
UPDATE `invitation` SET `role` = 'admin' WHERE `role` IS NOT NULL AND `role` NOT IN ('owner', 'admin') AND (',' || replace(`role`, ' ', '') || ',') LIKE '%,admin,%';--> statement-breakpoint
UPDATE `invitation` SET `role` = 'member' WHERE `role` IS NOT NULL AND `role` NOT IN ('owner', 'admin', 'member');--> statement-breakpoint
-- One member row per person and organization from here on (the unique index below). Should a database hold two,
-- the one with the higher role stays (the lower id on a tie).
DELETE FROM `member` WHERE `id` IN (
  SELECT `m`.`id` FROM `member` `m` WHERE EXISTS (
    SELECT 1 FROM `member` `o`
    WHERE `o`.`organizationId` = `m`.`organizationId` AND `o`.`userId` = `m`.`userId` AND `o`.`id` <> `m`.`id`
      AND ((CASE `o`.`role` WHEN 'owner' THEN 2 WHEN 'admin' THEN 1 ELSE 0 END) > (CASE `m`.`role` WHEN 'owner' THEN 2 WHEN 'admin' THEN 1 ELSE 0 END)
        OR ((CASE `o`.`role` WHEN 'owner' THEN 2 WHEN 'admin' THEN 1 ELSE 0 END) = (CASE `m`.`role` WHEN 'owner' THEN 2 WHEN 'admin' THEN 1 ELSE 0 END) AND `o`.`id` < `m`.`id`))
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_member_org_user` ON `member` (`organizationId`,`userId`);--> statement-breakpoint
-- Every member who does not run the org keeps the reach B1 gave them (every workspace, as an Editor): a project
-- member row on each project in their org. Admins trim it in the access editor. Nobody granted these rows.
INSERT INTO `project_members` (`project_id`, `user_id`, `role`, `created_by`, `created_at`)
SELECT `p`.`id`, `m`.`userId`, 'member', NULL, `m`.`createdAt` FROM `member` `m` INNER JOIN `projects` `p` ON `p`.`organization_id` = `m`.`organizationId` WHERE `m`.`role` = 'member'
ON CONFLICT DO NOTHING;
