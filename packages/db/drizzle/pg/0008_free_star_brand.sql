ALTER TABLE "workflow_versions" ADD COLUMN "source_mode" text DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD COLUMN "manifest" text;--> statement-breakpoint
ALTER TABLE "workflow_versions" ADD COLUMN "base_generated_hash" text;