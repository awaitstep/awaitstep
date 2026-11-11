import { sql } from 'drizzle-orm'
import { pgTable, integer, text, index } from 'drizzle-orm/pg-core'
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
    // The version's number, kept when the version itself is deleted.
    versionNumber: integer('version_number'),
    connectionId: text('connection_id').references(() => connections.id, { onDelete: 'set null' }),
    serviceName: text('service_name').notNull(),
    serviceUrl: text('service_url'),
    // The provider's name for what was deployed, which its runs are found under (a Cloudflare
    // Workflow's name). Null on rows from before it was recorded: the workflow's name stands in.
    deployedName: text('deployed_name'),
    status: text('status').notNull().default('success'),
    error: text('error'),
    configSnapshot: text('config_snapshot'),
    // Who deployed it: a user id, as workflows.created_by. Null on rows from before it was recorded.
    createdBy: text('created_by'),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
    // When it was taken down from its account, and by whom (a user id): the row stays as history.
    takenDownAt: isoTimestamp('taken_down_at'),
    takenDownBy: text('taken_down_by'),
  },
  (table) => [
    index('idx_deployments_workflow_id').on(table.workflowId),
    index('idx_deployments_workflow_version').on(table.workflowId, table.versionId),
    index('idx_deployments_workflow_connection').on(table.workflowId, table.connectionId),
  ],
)
