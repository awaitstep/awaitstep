DROP INDEX "idx_workflow_runs_workflow_id";--> statement-breakpoint
CREATE INDEX "idx_workflow_runs_workflow_created" ON "workflow_runs" USING btree ("workflow_id","created_at");