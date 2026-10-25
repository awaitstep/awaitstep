import { sql } from 'drizzle-orm'
import { pgTable, text, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'
import { projects } from './projects.js'

export const envVars = pgTable(
  'env_vars',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(),
    name: text('name').notNull(),
    value: text('value').notNull(),
    isSecret: boolean('is_secret').notNull().default(false),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
    updatedAt: isoTimestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex('idx_env_vars_org_name').on(table.organizationId, table.projectId, table.name),
    index('idx_env_vars_org_id').on(table.organizationId),
    index('idx_env_vars_project_id').on(table.projectId),
  ],
)
