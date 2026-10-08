CREATE TABLE "workflow_run_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"node_id" text,
	"step_name" text NOT NULL,
	"kind" text NOT NULL,
	"step_index" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"error" text,
	"started_at" text,
	"ended_at" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD CONSTRAINT "workflow_run_steps_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workflow_run_steps_run_id" ON "workflow_run_steps" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_workflow_run_steps_identity" ON "workflow_run_steps" USING btree ("run_id","step_name","kind","step_index");