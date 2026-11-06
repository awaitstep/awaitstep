-- A run started from the dashboard recorded the workflow's latest saved version,
-- not the one deployed on the account it went to. Point each such run at the
-- newest successful deploy on its account from before it started. A run with no
-- such deploy left, or whose deployed version was since deleted or isn't its
-- workflow's own, keeps what it has.
UPDATE `workflow_runs` SET `version_id` = COALESCE((
  SELECT `v`.`id` FROM `workflow_versions` `v`
  WHERE `v`.`workflow_id` = `workflow_runs`.`workflow_id` AND `v`.`id` = (
    SELECT `d`.`version_id` FROM `deployments` `d`
    WHERE `d`.`workflow_id` = `workflow_runs`.`workflow_id` AND `d`.`connection_id` = `workflow_runs`.`connection_id`
      AND `d`.`status` = 'success' AND `d`.`created_at` <= `workflow_runs`.`created_at`
    ORDER BY `d`.`created_at` DESC, `d`.`id` DESC LIMIT 1
  )
), `version_id`) WHERE `connection_id` IS NOT NULL;--> statement-breakpoint
-- Each deployment and run keeps its version's number, so it still says which
-- version it was once that version is deleted. Rows whose version is already
-- gone stay without one.
UPDATE `deployments` SET `version_number` = (
  SELECT `v`.`version` FROM `workflow_versions` `v` WHERE `v`.`id` = `deployments`.`version_id`
) WHERE `version_id` IS NOT NULL;--> statement-breakpoint
UPDATE `workflow_runs` SET `version_number` = (
  SELECT `v`.`version` FROM `workflow_versions` `v` WHERE `v`.`id` = `workflow_runs`.`version_id`
) WHERE `version_id` IS NOT NULL;
