import { sql } from 'drizzle-orm'
import { pgTable, text, index } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'

export const connections = pgTable(
  'connections',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    createdBy: text('created_by').notNull(),
    provider: text('provider').notNull(),
    name: text('name').notNull(),
    credentials: text('credentials').notNull(),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: isoTimestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_connections_org_id').on(table.organizationId),
    index('idx_connections_created_by').on(table.createdBy),
  ],
)
