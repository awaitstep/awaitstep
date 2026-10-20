import { pgTable, text, integer, index, uniqueIndex, timestamp } from 'drizzle-orm/pg-core'
import { workflows } from './workflows.js'

export const workflowFiles = pgTable(
  'workflow_files',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    // Bundle-relative; validated against the project-file rules on every write.
    path: text('path').notNull(),
    source: text('source').notNull(),
    // Content hash doubling as the ETag for optimistic concurrency.
    hash: text('hash').notNull(),
    // UTF-8 byte size, so listings and caps never re-measure the source.
    size: integer('size').notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_workflow_files_workflow_id').on(table.workflowId),
    uniqueIndex('idx_workflow_files_path').on(table.workflowId, table.path),
  ],
)
