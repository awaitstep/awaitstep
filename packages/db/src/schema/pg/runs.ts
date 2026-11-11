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
    // The name the run was started under on the provider (the deploy's name for the workflow),
    // so a rename and redeploy later doesn't lose it. Null on runs from before it was kept.
    // How it was started ('dashboard' | 'api'), and the payload it was started with (JSON).
    // Null on runs from before they were kept.
    trigger: text('trigger'),
    params: text('params'),
    // A function call's answer: its HTTP status and how long it took. Null for workflow runs.
    responseStatus: integer('response_status'),
    durationMs: integer('duration_ms'),
    deployedName: text('deployed_name'),
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
