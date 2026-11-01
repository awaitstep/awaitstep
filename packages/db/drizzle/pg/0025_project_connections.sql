CREATE TABLE "project_connections" (
	"project_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_connections_project_id_connection_id_pk" PRIMARY KEY("project_id","connection_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_connections" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"set_by" text,
	"set_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "project_connections" ADD CONSTRAINT "project_connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_connections" ADD CONSTRAINT "project_connections_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_connections" ADD CONSTRAINT "workspace_connections_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_connections" ADD CONSTRAINT "workspace_connections_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_connections_connection" ON "project_connections" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_connections_default" ON "project_connections" USING btree ("project_id") WHERE is_default = true;--> statement-breakpoint
CREATE INDEX "idx_workspace_connections_connection" ON "workspace_connections" USING btree ("connection_id");--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_connections_project_id" ON "connections" USING btree ("project_id");
--> statement-breakpoint
-- Every project starts with the accounts that served it before (2026-11-01), so no deploy stops
-- working: each added, and the default the account its latest successful deploy used, else its
-- only account, else none.
INSERT INTO project_connections (project_id, connection_id, is_default, created_by, created_at)
SELECT p.id, c.id,
  CASE WHEN c.id = COALESCE(
    (SELECT d.connection_id FROM deployments d
      INNER JOIN workflows w ON w.id = d.workflow_id
      INNER JOIN connections dc ON dc.id = d.connection_id
      WHERE w.project_id = p.id AND d.status = 'success' AND dc.organization_id = p.organization_id
        AND (dc.all_projects = true OR EXISTS (SELECT 1 FROM connection_projects dcp WHERE dcp.connection_id = dc.id AND dcp.project_id = p.id))
      ORDER BY d.created_at DESC, d.id DESC LIMIT 1),
    (SELECT CASE WHEN COUNT(*) = 1 THEN MIN(oc.id) END FROM connections oc
      WHERE oc.organization_id = p.organization_id AND (oc.all_projects = true OR EXISTS (SELECT 1 FROM connection_projects ocp WHERE ocp.connection_id = oc.id AND ocp.project_id = p.id)))
  ) THEN true ELSE false END,
  NULL, now()
FROM projects p
INNER JOIN connections c ON c.organization_id = p.organization_id
WHERE (c.all_projects = true OR EXISTS (SELECT 1 FROM connection_projects cp WHERE cp.connection_id = c.id AND cp.project_id = p.id));
--> statement-breakpoint
-- `/{org}/{project}/connections` became a page: a workspace using that slug is renamed, as 0025 did.
UPDATE workspaces SET slug = slug || '-workspace'
WHERE slug = 'connections'
  AND NOT EXISTS (
    SELECT 1 FROM workspaces taken
    WHERE taken.project_id = workspaces.project_id AND taken.slug = workspaces.slug || '-workspace'
  );
--> statement-breakpoint
UPDATE workspaces SET slug = slug || '-' || rtrim(lower(replace(substr(id, 1, 8), '_', '-')), '-')
WHERE slug = 'connections';
