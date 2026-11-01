import { sql } from 'drizzle-orm'
import { pgTable, text, boolean, index, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'
import { projects } from './projects.js'
import { workspaces } from './workspaces.js'

// A variable at one of three levels (B4): org-wide (no project), a
// project's (project only), or a workspace's (its workspace and that
// workspace's project). One name per level: NULLs are distinct in a unique
// index, so each level has its own partial index.
export const envVars = pgTable(
  'env_vars',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(),
    name: text('name').notNull(),
    value: text('value').notNull(),
    isSecret: boolean('is_secret').notNull().default(false),
    // A project's variable reaches every workspace, an organization's every
    // project, unless narrowed to the rows in env_var_workspaces / env_var_projects.
    allPlaces: boolean('all_places').notNull().default(true),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: isoTimestamp('updated_at')
      .notNull()
      .default(sql`now()`),
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
export const envVarWorkspaces = pgTable(
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

export const envVarProjects = pgTable(
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
