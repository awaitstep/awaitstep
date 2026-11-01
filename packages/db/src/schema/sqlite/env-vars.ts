import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { projects } from './projects.js'
import { workspaces } from './workspaces.js'

// A variable at one of three levels (B4): org-wide (no project), a
// project's (project only), or a workspace's (its workspace and that
// workspace's project). One name per level: NULLs are distinct in a unique
// index, so each level has its own partial index.
export const envVars = sqliteTable(
  'env_vars',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(),
    name: text('name').notNull(),
    value: text('value').notNull(),
    isSecret: integer('is_secret', { mode: 'boolean' }).notNull().default(false),
    // A project's variable reaches every workspace, an organization's every
    // project, unless narrowed to the rows in env_var_workspaces / env_var_projects.
    allPlaces: integer('all_places', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_env_vars_organization_name')
      .on(table.organizationId, table.name)
      .where(sql`project_id is null`),
    uniqueIndex('idx_env_vars_project_name')
      .on(table.projectId, table.name)
      .where(sql`project_id is not null and workspace_id is null`),
    uniqueIndex('idx_env_vars_workspace_name')
      .on(table.workspaceId, table.name)
      .where(sql`workspace_id is not null`),
    index('idx_env_vars_org_id').on(table.organizationId),
    index('idx_env_vars_project_id').on(table.projectId),
    index('idx_env_vars_workspace_id').on(table.workspaceId),
  ],
)

// Which workspaces a project's variable reaches, and which projects an
// organization's reaches, when `all_places` is off. A place with its own
// row of the same name is skipped by the resolved reads, listed or not.
export const envVarWorkspaces = sqliteTable(
  'env_var_workspaces',
  {
    envVarId: text('env_var_id')
      .notNull()
      .references(() => envVars.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.envVarId, table.workspaceId] }),
    index('idx_env_var_workspaces_workspace').on(table.workspaceId),
  ],
)

export const envVarProjects = sqliteTable(
  'env_var_projects',
  {
    envVarId: text('env_var_id')
      .notNull()
      .references(() => envVars.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.envVarId, table.projectId] }),
    index('idx_env_var_projects_project').on(table.projectId),
  ],
)
