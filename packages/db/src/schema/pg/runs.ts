import { sql } from 'drizzle-orm'
import { pgTable, integer, text, index } from 'drizzle-orm/pg-core'
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
    // The version's number, kept when the version itself is deleted.
    versionNumber: integer('version_number'),
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
  // One workflow's runs, newest first or since a time; also serves workflow-only lookups.
  (table) => [index('idx_workflow_runs_workflow_created').on(table.workflowId, table.createdAt)],
)
