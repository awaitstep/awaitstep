import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { workflows } from './workflows.js'
import { workflowVersions } from './versions.js'

/**
 * Disposable workers running a workflow before it is deployed. Rows exist so
 * idle TTL, concurrency and quotas can be enforced across requests — the
 * Workers runtime keeps nothing between them.
 *
 * A row is written as `starting` *before* the container is created, which is
 * what makes the container reachable by the reaper if the start fails or the
 * client disappears; `process_id` and `port` are filled in once the worker
 * reports back.
 *
 * Deleting a workflow nulls `workflow_id` rather than cascading the row away:
 * the row is the only record of a running container, so cascading it left the
 * container running and billing with nothing able to find it.
 *
 * `slot` is what makes the concurrency cap hold under a race. A reservation
 * claims the next slot above every live one, and the partial unique index
 * rejects the loser when two arrive at once — `INSERT … SELECT` counting rows
 * is not atomic on postgres, so the count alone let a double-click through.
 */
export const testSessions = sqliteTable(
  'test_sessions',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id').references(() => workflows.id, { onDelete: 'set null' }),
    versionId: text('version_id').references(() => workflowVersions.id, {
      onDelete: 'set null',
    }),
    userId: text('user_id').notNull(),
    runtime: text('runtime', { enum: ['sandbox', 'node'] }).notNull(),
    containerId: text('container_id').notNull(),
    processId: text('process_id'),
    port: integer('port'),
    slot: integer('slot').notNull().default(0),
    status: text('status', { enum: ['starting', 'running', 'stopped', 'failed'] })
      .notNull()
      .default('starting'),
    error: text('error'),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at').notNull(),
    stoppedAt: text('stopped_at'),
  },
  (table) => [
    index('idx_test_sessions_workflow_id').on(table.workflowId),
    index('idx_test_sessions_user_status').on(table.userId, table.status),
    index('idx_test_sessions_status_last_used').on(table.status, table.lastUsedAt),
    // The per-project quota counts a window of a workflow's sessions on
    // every start; without this it reads every session the project ever had.
    index('idx_test_sessions_workflow_created').on(table.workflowId, table.createdAt),
    uniqueIndex('idx_test_sessions_live_slot')
      .on(table.userId, table.slot)
      .where(sql`${table.status} in ('starting', 'running')`),
  ],
)
