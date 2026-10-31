CREATE TABLE "connection_projects" (
	"connection_id" text NOT NULL,
	"project_id" text NOT NULL,
	CONSTRAINT "connection_projects_connection_id_project_id_pk" PRIMARY KEY("connection_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "all_projects" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "token_status" text DEFAULT 'unchecked' NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "token_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "connection_projects" ADD CONSTRAINT "connection_projects_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_projects" ADD CONSTRAINT "connection_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_connection_projects_project" ON "connection_projects" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_connections_token_checked" ON "connections" USING btree ("token_checked_at");