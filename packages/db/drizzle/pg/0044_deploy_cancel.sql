ALTER TABLE "deployments" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "cancelled_by" text;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "cancelled_at" timestamp;