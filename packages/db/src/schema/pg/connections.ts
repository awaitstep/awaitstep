import { pgTable, text, index, timestamp } from 'drizzle-orm/pg-core'

export const cfConnections = pgTable(
  'cf_connections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    accountId: text('account_id').notNull(),
    apiToken: text('api_token').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('idx_cf_connections_user_id').on(table.userId)],
)
