CREATE TABLE "deployment_library_versions" (
	"deployment_id" text NOT NULL,
	"item_id" text NOT NULL,
	"slug" text NOT NULL,
	"version" text NOT NULL,
	CONSTRAINT "deployment_library_versions_deployment_id_item_id_pk" PRIMARY KEY("deployment_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "library_item_files" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"path" text NOT NULL,
	"source" text NOT NULL,
	"hash" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_items" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"workspace_id" text,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_usages" (
	"id" text PRIMARY KEY NOT NULL,
	"workflow_id" text,
	"consumer_item_id" text,
	"slug" text,
	"node_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"version" text NOT NULL,
	"seq" integer NOT NULL,
	"files" text NOT NULL,
	"imports" text DEFAULT '[]' NOT NULL,
	"published_by" text,
	"published_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deployment_library_versions" ADD CONSTRAINT "deployment_library_versions_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_item_files" ADD CONSTRAINT "library_item_files_item_id_library_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_usages" ADD CONSTRAINT "library_usages_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_usages" ADD CONSTRAINT "library_usages_consumer_item_id_library_items_id_fk" FOREIGN KEY ("consumer_item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_usages" ADD CONSTRAINT "library_usages_node_id_library_items_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_versions" ADD CONSTRAINT "library_versions_item_id_library_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."library_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_deployment_library_versions_item" ON "deployment_library_versions" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_library_item_files_path" ON "library_item_files" USING btree ("item_id","path");--> statement-breakpoint
CREATE INDEX "idx_library_items_project" ON "library_items" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_library_items_slug" ON "library_items" USING btree ("project_id",coalesce("workspace_id", ''),"kind","slug");--> statement-breakpoint
CREATE INDEX "idx_library_usages_workflow" ON "library_usages" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_library_usages_consumer_item" ON "library_usages" USING btree ("consumer_item_id");--> statement-breakpoint
CREATE INDEX "idx_library_usages_slug" ON "library_usages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_library_usages_node" ON "library_usages" USING btree ("node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_library_usages_pair" ON "library_usages" USING btree (coalesce("workflow_id", ''),coalesce("consumer_item_id", ''),coalesce("slug", ''),coalesce("node_id", ''));--> statement-breakpoint
CREATE UNIQUE INDEX "idx_library_versions_version" ON "library_versions" USING btree ("item_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_library_versions_seq" ON "library_versions" USING btree ("item_id","seq");