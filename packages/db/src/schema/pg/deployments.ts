import { sql } from 'drizzle-orm'
import { pgTable, text, index } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'
import { workflows } from './workflows.js'
import { workflowVersions } from './versions.js'
import { connections } from './connections.js'

export const deployments = pgTable(
  'deployments',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    versionId: text('version_id').references(() => workflowVersions.id, {
      onDelete: 'set null',
    }),
    connectionId: text('connection_id').references(() => connections.id, { onDelete: 'set null' }),
    serviceName: text('service_name').notNull(),
    serviceUrl: text('service_url'),
    status: text('status').notNull().default('success'),
    error: text('error'),
    configSnapshot: text('config_snapshot'),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_deployments_workflow_id').on(table.workflowId),
    index('idx_deployments_workflow_version').on(table.workflowId, table.versionId),
  ],
)
