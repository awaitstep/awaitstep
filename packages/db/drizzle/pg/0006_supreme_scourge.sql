CREATE TABLE "deployment_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"provider" text NOT NULL,
	"config" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "config_snapshot" text;--> statement-breakpoint
ALTER TABLE "deployment_configs" ADD CONSTRAINT "deployment_configs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_configs" ADD CONSTRAINT "deployment_configs_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_deployment_configs_workflow_connection" ON "deployment_configs" USING btree ("workflow_id","connection_id");--> statement-breakpoint
CREATE INDEX "idx_deployment_configs_workflow_id" ON "deployment_configs" USING btree ("workflow_id");