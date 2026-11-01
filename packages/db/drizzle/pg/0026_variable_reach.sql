CREATE TABLE "env_var_projects" (
	"env_var_id" text NOT NULL,
	"project_id" text NOT NULL,
	CONSTRAINT "env_var_projects_env_var_id_project_id_pk" PRIMARY KEY("env_var_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "env_var_workspaces" (
	"env_var_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	CONSTRAINT "env_var_workspaces_env_var_id_workspace_id_pk" PRIMARY KEY("env_var_id","workspace_id")
);
--> statement-breakpoint
ALTER TABLE "env_vars" ADD COLUMN "all_places" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "env_var_projects" ADD CONSTRAINT "env_var_projects_env_var_id_env_vars_id_fk" FOREIGN KEY ("env_var_id") REFERENCES "public"."env_vars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_var_projects" ADD CONSTRAINT "env_var_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_var_workspaces" ADD CONSTRAINT "env_var_workspaces_env_var_id_env_vars_id_fk" FOREIGN KEY ("env_var_id") REFERENCES "public"."env_vars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "env_var_workspaces" ADD CONSTRAINT "env_var_workspaces_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_env_var_projects_project" ON "env_var_projects" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_env_var_workspaces_workspace" ON "env_var_workspaces" USING btree ("workspace_id");