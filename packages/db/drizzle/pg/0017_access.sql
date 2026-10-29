CREATE TABLE "access_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"already_editing" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"decided_by" text
);
--> statement-breakpoint
CREATE TABLE "invitation_places" (
	"id" text PRIMARY KEY NOT NULL,
	"invitation_id" text NOT NULL,
	"project_id" text NOT NULL,
	"workspace_id" text,
	"role" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "asked_for_new_at" timestamp;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_places" ADD CONSTRAINT "invitation_places_invitation_id_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_places" ADD CONSTRAINT "invitation_places_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_places" ADD CONSTRAINT "invitation_places_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_access_requests_workspace_id" ON "access_requests" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_access_requests_user_id" ON "access_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_access_requests_to_user_id" ON "access_requests" USING btree ("to_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_access_requests_pending" ON "access_requests" USING btree ("workspace_id","user_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "idx_invitation_places_invitation_id" ON "invitation_places" USING btree ("invitation_id");--> statement-breakpoint
CREATE INDEX "idx_project_members_user_id" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_workspace_members_user_id" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
-- A member's role as better-auth stores it may be a comma-joined list ('admin,member'). The highest one
-- counts (the API's parseOrgRole rule), and from here on the SQL compares roles exactly, so it is written back as one word.
UPDATE "member" SET "role" = 'owner' WHERE "role" <> 'owner' AND (',' || replace("role", ' ', '') || ',') LIKE '%,owner,%';--> statement-breakpoint
UPDATE "member" SET "role" = 'admin' WHERE "role" NOT IN ('owner', 'admin') AND (',' || replace("role", ' ', '') || ',') LIKE '%,admin,%';--> statement-breakpoint
UPDATE "member" SET "role" = 'member' WHERE "role" NOT IN ('owner', 'admin', 'member');--> statement-breakpoint
-- The same for pending invitations better-auth wrote: accepting copies the role into the member row.
UPDATE "invitation" SET "role" = 'owner' WHERE "role" IS NOT NULL AND "role" <> 'owner' AND (',' || replace("role", ' ', '') || ',') LIKE '%,owner,%';--> statement-breakpoint
UPDATE "invitation" SET "role" = 'admin' WHERE "role" IS NOT NULL AND "role" NOT IN ('owner', 'admin') AND (',' || replace("role", ' ', '') || ',') LIKE '%,admin,%';--> statement-breakpoint
UPDATE "invitation" SET "role" = 'member' WHERE "role" IS NOT NULL AND "role" NOT IN ('owner', 'admin', 'member');--> statement-breakpoint
-- One member row per person and organization from here on (the unique index below). Should a database hold two,
-- the one with the higher role stays (the lower id on a tie).
DELETE FROM "member" WHERE "id" IN (
  SELECT m."id" FROM "member" m WHERE EXISTS (
    SELECT 1 FROM "member" o
    WHERE o."organization_id" = m."organization_id" AND o."user_id" = m."user_id" AND o."id" <> m."id"
      AND ((CASE o."role" WHEN 'owner' THEN 2 WHEN 'admin' THEN 1 ELSE 0 END) > (CASE m."role" WHEN 'owner' THEN 2 WHEN 'admin' THEN 1 ELSE 0 END)
        OR ((CASE o."role" WHEN 'owner' THEN 2 WHEN 'admin' THEN 1 ELSE 0 END) = (CASE m."role" WHEN 'owner' THEN 2 WHEN 'admin' THEN 1 ELSE 0 END) AND o."id" < m."id"))
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_member_org_user" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
-- Every member who does not run the org keeps the reach B1 gave them (every workspace, as an Editor): a project
-- member row on each project in their org. Admins trim it in the access editor. Nobody granted these rows.
INSERT INTO "project_members" ("project_id", "user_id", "role", "created_by", "created_at")
SELECT p."id", m."user_id", 'member', NULL, m."created_at" FROM "member" m INNER JOIN "projects" p ON p."organization_id" = m."organization_id" WHERE m."role" = 'member'
ON CONFLICT DO NOTHING;
