import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { projects } from './projects.js'
import { workspaces } from './workspaces.js'

export const workflows = sqliteTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Nullable in SQLite only because the column was added after the fact: every
    // row is set (the migration backfilled it) and the adapter never writes null.
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    kind: text('kind', { enum: ['workflow', 'script'] })
      .notNull()
      .default('workflow'),
    currentVersionId: text('current_version_id'),
    envVars: text('env_vars'),
    triggerCode: text('trigger_code'),
    dependencies: text('dependencies'),
    deployConfig: text('deploy_config'),
    // Shared to the project: both set, or both null (as a lock). No FK, as `locked_by`.
    sharedBy: text('shared_by'),
    sharedAt: text('shared_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_workflows_project_id').on(table.projectId),
    index('idx_workflows_workspace_id').on(table.workspaceId),
    index('idx_workflows_created_by').on(table.createdBy),
  ],
)
