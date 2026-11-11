ALTER TABLE "workflow_run_steps" ADD COLUMN "output" text;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD COLUMN "output_truncated" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_run_steps" ADD COLUMN "attempts" text;