import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { workflows } from './workflows.js'

export const workflowFiles = sqliteTable(
  'workflow_files',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    // Bundle-relative, always under lib/ (validated before every write).
    path: text('path').notNull(),
    source: text('source').notNull(),
    // Content hash doubling as the ETag for optimistic concurrency.
    hash: text('hash').notNull(),
    // UTF-8 byte size, so listings and caps never re-measure the source.
    size: integer('size').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_workflow_files_workflow_id').on(table.workflowId),
    uniqueIndex('idx_workflow_files_path').on(table.workflowId, table.path),
  ],
)
