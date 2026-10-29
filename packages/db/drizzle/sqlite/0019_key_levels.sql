ALTER TABLE `api_keys` ADD `workspace_id` text REFERENCES workspaces(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `key_suffix` text;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `permissions` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_api_keys_workspace_id` ON `api_keys` (`workspace_id`);--> statement-breakpoint
-- Keys minted before B3 carried coarse scopes; each becomes the grid it amounted to at its level.
-- Org keys: read → read on projects, connections, resources; write → write and delete on them too.
-- Project keys: read on workspaces, workflows, runs, variables (not members: the people lists were
-- closed to keys before B3); write → write and delete on workflows, workspaces, variables; deploy →
-- deploy and run on workflows. `scopes` stays filled for the Phase-2 cleanup that drops it.
UPDATE `api_keys` SET `permissions` = CASE
  WHEN `organization_id` IS NOT NULL THEN CASE WHEN `scopes` LIKE '%"write"%' THEN '{"projects":["read","write","delete"],"connections":["read","write","delete"],"resources":["read","write","delete"]}' ELSE '{"projects":["read"],"connections":["read"],"resources":["read"]}' END
  WHEN `scopes` LIKE '%"write"%' AND `scopes` LIKE '%"deploy"%' THEN '{"workspaces":["read","write","delete"],"workflows":["read","write","delete","deploy","run"],"runs":["read"],"variables":["read","write","delete"]}'
  WHEN `scopes` LIKE '%"write"%' THEN '{"workspaces":["read","write","delete"],"workflows":["read","write","delete"],"runs":["read"],"variables":["read","write","delete"]}'
  WHEN `scopes` LIKE '%"deploy"%' THEN '{"workspaces":["read"],"workflows":["read","deploy","run"],"runs":["read"],"variables":["read"]}'
  ELSE '{"workspaces":["read"],"workflows":["read"],"runs":["read"],"variables":["read"]}' END
WHERE `permissions` = '{}';
