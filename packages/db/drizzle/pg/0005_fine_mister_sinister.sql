ALTER TABLE "deployments" DROP CONSTRAINT "deployments_version_id_workflow_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "workflow_runs" DROP CONSTRAINT "workflow_runs_version_id_workflow_versions_id_fk";
--> statement-breakpoint
ALTER TABLE "deployments" ALTER COLUMN "version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "workflow_runs" ALTER COLUMN "version_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_version_id_workflow_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."workflow_versions"("id") ON DELETE set null ON UPDATE no action;