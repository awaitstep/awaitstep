CREATE TABLE "api_key_projects" (
	"key_id" text NOT NULL,
	"project_id" text NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "api_key_projects_key_id_project_id_pk" PRIMARY KEY("key_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "api_key_workspaces" (
	"key_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "api_key_workspaces_key_id_workspace_id_pk" PRIMARY KEY("key_id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT "api_keys_one_level";--> statement-breakpoint
DROP INDEX "idx_api_keys_project_id";--> statement-breakpoint
DROP INDEX "idx_api_keys_workspace_id";--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "api_key_projects" ADD CONSTRAINT "api_key_projects_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_projects" ADD CONSTRAINT "api_key_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_workspaces" ADD CONSTRAINT "api_key_workspaces_key_id_api_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_workspaces" ADD CONSTRAINT "api_key_workspaces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_key_projects_project" ON "api_key_projects" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_api_key_workspaces_workspace" ON "api_key_workspaces" USING btree ("workspace_id");--> statement-breakpoint
UPDATE "api_keys" SET "level" = CASE WHEN "workspace_id" IS NOT NULL THEN 'workspace' WHEN "project_id" IS NOT NULL THEN 'project' ELSE 'organization' END;--> statement-breakpoint
UPDATE "api_keys" SET "organization_id" = "projects"."organization_id" FROM "projects" WHERE "api_keys"."project_id" = "projects"."id" AND "api_keys"."organization_id" IS NULL;--> statement-breakpoint
INSERT INTO "api_key_projects" ("key_id", "project_id", "revoked_at") SELECT "id", "project_id", NULL FROM "api_keys" WHERE "project_id" IS NOT NULL AND "workspace_id" IS NULL;--> statement-breakpoint
INSERT INTO "api_key_workspaces" ("key_id", "workspace_id", "revoked_at") SELECT "id", "workspace_id", NULL FROM "api_keys" WHERE "workspace_id" IS NOT NULL;