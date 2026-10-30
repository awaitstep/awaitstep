CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"event" text NOT NULL,
	"group_key" text NOT NULL,
	"project_id" text,
	"workspace_id" text,
	"access_request_id" text,
	"meta" text DEFAULT '{}' NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"needs_action" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_visits" (
	"user_id" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp NOT NULL,
	"seen_ids" text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_access_request_id_access_requests_id_fk" FOREIGN KEY ("access_request_id") REFERENCES "public"."access_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_visits" ADD CONSTRAINT "release_visits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notifications_user_group" ON "notifications" USING btree ("user_id","group_key");--> statement-breakpoint
CREATE INDEX "idx_notifications_inbox" ON "notifications" USING btree ("organization_id","user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_updated" ON "notifications" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_notifications_access_request" ON "notifications" USING btree ("access_request_id");--> statement-breakpoint
-- Requests already waiting (B2) reach their addressee's Inbox: asking again can't.
INSERT INTO "notifications" ("id", "organization_id", "user_id", "kind", "event", "group_key", "project_id", "workspace_id", "access_request_id", "meta", "count", "needs_action", "read_at", "created_at", "updated_at")
SELECT 'ntf_backfill_' || r."id", p."organization_id", r."to_user_id", 'request', 'access_request.create', 'access_request:' || r."id", p."id", w."id", r."id",
  json_build_object('person', coalesce(nullif(u."name", ''), u."email"), 'workspace', w."name")::text, 1, true, NULL, r."created_at", r."created_at"
FROM "access_requests" r
INNER JOIN "workspaces" w ON w."id" = r."workspace_id"
INNER JOIN "projects" p ON p."id" = w."project_id"
INNER JOIN "user" u ON u."id" = r."user_id"
WHERE r."status" = 'pending'
ON CONFLICT DO NOTHING;
