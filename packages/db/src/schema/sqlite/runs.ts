import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { workflows } from './workflows.js'
import { workflowVersions } from './versions.js'
import { cfConnections } from './connections.js'

export const workflowRuns = sqliteTable(
  'workflow_runs',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    versionId: text('version_id')
      .notNull()
      .references(() => workflowVersions.id),
    connectionId: text('connection_id')
      .notNull()
      .references(() => cfConnections.id),
    instanceId: text('instance_id').notNull(),
    status: text('status').notNull().default('queued'),
    output: text('output'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_workflow_runs_workflow_id').on(table.workflowId)],
)
