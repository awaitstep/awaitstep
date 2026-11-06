-- Takedown used to clear workflows.current_version_id, which is the latest saved
-- version (the editor's), not the deployed one. Point each such workflow back at
-- its newest version; a workflow with no version keeps NULL.
UPDATE `workflows` SET `current_version_id` = (
  SELECT `v`.`id` FROM `workflow_versions` `v`
  WHERE `v`.`workflow_id` = `workflows`.`id`
  ORDER BY `v`.`version` DESC LIMIT 1
) WHERE `current_version_id` IS NULL;
