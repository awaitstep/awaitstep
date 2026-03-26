CREATE TABLE "installed_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"node_id" text NOT NULL,
	"version" text NOT NULL,
	"bundle" text NOT NULL,
	"installed_by" text NOT NULL,
	"installed_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_installed_nodes_org_node" ON "installed_nodes" USING btree ("organization_id","node_id");--> statement-breakpoint
CREATE INDEX "idx_installed_nodes_org_id" ON "installed_nodes" USING btree ("organization_id");