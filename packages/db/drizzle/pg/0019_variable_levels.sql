ALTER TABLE "env_vars" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "env_vars" ADD CONSTRAINT "env_vars_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_env_vars_workspace_id" ON "env_vars" USING btree ("workspace_id");--> statement-breakpoint
DROP INDEX "idx_env_vars_org_name";--> statement-breakpoint
-- A project moved to another organization before B4 left its variables on the old one (the move
-- never re-homed them): every row names its project's organization again.
UPDATE "env_vars" SET "organization_id" = "projects"."organization_id" FROM "projects"
WHERE "projects"."id" = "env_vars"."project_id" AND "env_vars"."organization_id" <> "projects"."organization_id";--> statement-breakpoint
-- The old index never stopped two org-wide rows sharing a name (NULLs are distinct in a unique
-- index), and a re-created variable beside a left-behind one shares its project's. Before one name
-- per level is enforced, the newest of such a pair stays.
DELETE FROM "env_vars" WHERE "project_id" IS NULL AND "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (PARTITION BY "organization_id", "name" ORDER BY "created_at" DESC, "id" DESC) AS rn
    FROM "env_vars" WHERE "project_id" IS NULL
  ) ranked WHERE rn > 1
);--> statement-breakpoint
DELETE FROM "env_vars" WHERE "project_id" IS NOT NULL AND "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (PARTITION BY "project_id", "name" ORDER BY "created_at" DESC, "id" DESC) AS rn
    FROM "env_vars" WHERE "project_id" IS NOT NULL
  ) ranked WHERE rn > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_env_vars_organization_name" ON "env_vars" USING btree ("organization_id","name") WHERE project_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_env_vars_project_name" ON "env_vars" USING btree ("project_id","name") WHERE project_id is not null and workspace_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_env_vars_workspace_name" ON "env_vars" USING btree ("workspace_id","name") WHERE workspace_id is not null;
