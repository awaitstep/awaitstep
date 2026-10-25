import { sql } from 'drizzle-orm'
import { pgTable, text, index } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'
import { workflows } from './workflows.js'
import { workflowVersions } from './versions.js'
import { connections } from './connections.js'

export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    versionId: text('version_id').references(() => workflowVersions.id, {
      onDelete: 'set null',
    }),
    connectionId: text('connection_id').references(() => connections.id, { onDelete: 'set null' }),
    instanceId: text('instance_id').notNull(),
    status: text('status').notNull().default('queued'),
    output: text('output'),
    error: text('error'),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: isoTimestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index('idx_workflow_runs_workflow_id').on(table.workflowId)],
)
