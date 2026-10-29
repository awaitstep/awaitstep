import { sql } from 'drizzle-orm'
import { pgTable, text, index } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'
import { projects } from './projects.js'
import { workspaces } from './workspaces.js'

export const workflows = pgTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
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
    sharedAt: isoTimestamp('shared_at'),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: isoTimestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_workflows_project_id').on(table.projectId),
    index('idx_workflows_workspace_id').on(table.workspaceId),
    index('idx_workflows_created_by').on(table.createdBy),
  ],
)
