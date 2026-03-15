import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'

export const cfConnections = sqliteTable(
  'cf_connections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    accountId: text('account_id').notNull(),
    apiToken: text('api_token').notNull(),
    name: text('name').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_cf_connections_user_id').on(table.userId)],
)
