import { sql } from 'drizzle-orm'
import { pgTable, text, integer, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'
import { workflowRuns } from './runs.js'

export const workflowRunSteps = pgTable(
  'workflow_run_steps',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),
    // Null when the provider reported a step the manifest can't map (e.g. a
    // deploy predating manifests, or a loop label mangled beyond matching).
    nodeId: text('node_id'),
    stepName: text('step_name').notNull(),
    kind: text('kind').notNull(),
    // 1-based occurrence per (run, step_name, kind): a label repeated by a
    // loop appears once per iteration in provider order.
    stepIndex: integer('step_index').notNull().default(1),
    status: text('status').notNull(),
    attemptCount: integer('attempt_count').notNull().default(1),
    error: text('error'),
    startedAt: text('started_at'),
    endedAt: text('ended_at'),
    // What the step returned (JSON text), cut at the stored size; read one step at a time.
    output: text('output'),
    outputTruncated: integer('output_truncated').notNull().default(0),
    // Each try, oldest first: [{ start, end, error }] as JSON text.
    attempts: text('attempts'),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: isoTimestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_workflow_run_steps_run_id').on(table.runId),
    uniqueIndex('idx_workflow_run_steps_identity').on(
      table.runId,
      table.stepName,
      table.kind,
      table.stepIndex,
    ),
  ],
)
