import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { workflows } from './workflows.js'
import { workflowVersions } from './versions.js'
import { cfConnections } from './connections.js'

export const deployments = sqliteTable(
  'deployments',
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
    workerName: text('worker_name').notNull(),
    workerUrl: text('worker_url'),
    status: text('status').notNull().default('success'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_deployments_workflow_id').on(table.workflowId)],
)
