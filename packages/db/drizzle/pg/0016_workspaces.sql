CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"colour" text DEFAULT 'green' NOT NULL,
	"created_by" text,
	"locked_by" text,
	"locked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "locked_at" timestamp;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "workspace_id" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_workspaces_project_slug" ON "workspaces" USING btree ("project_id","slug");--> statement-breakpoint
CREATE INDEX "idx_workspaces_project_id" ON "workspaces" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workflows_workspace_id" ON "workflows" USING btree ("workspace_id");--> statement-breakpoint
-- Every existing project gets a "Default" workspace, dated with the project; no author, since nobody made it.
INSERT INTO "workspaces" ("id", "project_id", "name", "slug", "colour", "created_at", "updated_at")
SELECT 'ws_' || replace(gen_random_uuid()::text, '-', ''), "id", 'Default', 'default', 'green', "created_at", "created_at" FROM "projects";--> statement-breakpoint
-- Every existing workflow goes in it, after which the column is required (sqlite keeps it nullable: see the schema).
UPDATE "workflows" SET "workspace_id" = w."id" FROM "workspaces" w WHERE w."project_id" = "workflows"."project_id" AND "workflows"."workspace_id" IS NULL;--> statement-breakpoint
ALTER TABLE "workflows" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
-- Project slugs the dashboard now routes to its own pages (RESERVED_SLUGS.project in @awaitstep/ir) move to
-- `<slug>-1`, or take a random suffix when a sibling already uses that.
UPDATE "projects" SET "slug" = CASE
	WHEN EXISTS (SELECT 1 FROM "projects" p2 WHERE p2."organization_id" = "projects"."organization_id" AND p2."slug" = "projects"."slug" || '-1')
	THEN "slug" || '-' || substr(md5(random()::text), 1, 6)
	ELSE "slug" || '-1'
END WHERE "slug" IN ('projects', 'resources', 'audit', 'inbox', 'whats-new', 'settings', 'account', 'items');--> statement-breakpoint
-- The same for organization slugs the app's top-level paths own (RESERVED_SLUGS.org); organization slugs are global.
UPDATE "organization" SET "slug" = CASE
	WHEN EXISTS (SELECT 1 FROM "organization" o2 WHERE o2."slug" = "organization"."slug" || '-1')
	THEN "slug" || '-' || substr(md5(random()::text), 1, 6)
	ELSE "slug" || '-1'
END WHERE "slug" IN ('api', 'account', 'api-playground', 'choose-org', 'connections', 'dashboard', 'env-vars', 'invite', 'runs', 'settings', 'sign-in', 'workflows');
