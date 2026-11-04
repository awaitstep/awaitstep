ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "level" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "project_id";--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "workspace_id";