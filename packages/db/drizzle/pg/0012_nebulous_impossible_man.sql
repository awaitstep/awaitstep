CREATE TABLE "test_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text,
	"version_id" text,
	"user_id" text NOT NULL,
	"runtime" text NOT NULL,
	"container_id" text NOT NULL,
	"process_id" text,
	"port" integer,
	"slot" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'starting' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp DEFAULT now() NOT NULL,
	"stopped_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_test_sessions_workflow_id" ON "test_sessions" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_test_sessions_user_status" ON "test_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_test_sessions_status_last_used" ON "test_sessions" USING btree ("status","last_used_at");--> statement-breakpoint
CREATE INDEX "idx_test_sessions_workflow_created" ON "test_sessions" USING btree ("workflow_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_test_sessions_live_slot" ON "test_sessions" USING btree ("user_id","slot") WHERE "test_sessions"."status" in ('starting', 'running');