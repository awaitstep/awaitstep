import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core'
import { workflows } from './workflows.js'
import { workflowVersions } from './versions.js'
import { connections } from './connections.js'

export const deployments = sqliteTable(
  'deployments',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    versionId: text('version_id').references(() => workflowVersions.id, {
      onDelete: 'set null',
    }),
    // The version's number, kept when the version itself is deleted.
    versionNumber: integer('version_number'),
    connectionId: text('connection_id').references(() => connections.id, { onDelete: 'set null' }),
    serviceName: text('service_name').notNull(),
    serviceUrl: text('service_url'),
    status: text('status').notNull().default('success'),
    error: text('error'),
    configSnapshot: text('config_snapshot'),
    // Who deployed it: a user id, as workflows.created_by. Null on rows from before it was recorded.
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_deployments_workflow_id').on(table.workflowId),
    index('idx_deployments_workflow_version').on(table.workflowId, table.versionId),
  ],
)
