CREATE TABLE "workflow_files" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"path" text NOT NULL,
	"source" text NOT NULL,
	"hash" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_files" ADD CONSTRAINT "workflow_files_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workflow_files_workflow_id" ON "workflow_files" USING btree ("workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_workflow_files_path" ON "workflow_files" USING btree ("workflow_id","path");