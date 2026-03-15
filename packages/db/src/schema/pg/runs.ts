import { pgTable, text, index, timestamp } from 'drizzle-orm/pg-core'
import { workflows } from './workflows.js'
import { workflowVersions } from './versions.js'
import { cfConnections } from './connections.js'

export const workflowRuns = pgTable(
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
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('idx_workflow_runs_workflow_id').on(table.workflowId)],
)
