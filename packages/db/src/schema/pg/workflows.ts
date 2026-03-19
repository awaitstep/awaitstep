import { pgTable, text, index, timestamp } from 'drizzle-orm/pg-core'

export const workflows = pgTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    currentVersionId: text('current_version_id'),
    envVars: text('env_vars'),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [index('idx_workflows_user_id').on(table.userId)],
)
