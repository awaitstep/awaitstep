ALTER TABLE "deployments" ADD COLUMN "taken_down_at" timestamp;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "taken_down_by" text;--> statement-breakpoint
CREATE INDEX "idx_deployments_workflow_connection" ON "deployments" USING btree ("workflow_id","connection_id");