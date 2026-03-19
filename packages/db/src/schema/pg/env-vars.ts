import { pgTable, text, boolean, index, uniqueIndex, timestamp } from 'drizzle-orm/pg-core'

export const envVars = pgTable(
  'env_vars',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    value: text('value').notNull(),
    isSecret: boolean('is_secret').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_env_vars_user_name').on(table.userId, table.name),
    index('idx_env_vars_user_id').on(table.userId),
  ],
)
