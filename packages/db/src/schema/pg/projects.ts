import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_projects_org_slug').on(table.organizationId, table.slug),
    index('idx_projects_org_id').on(table.organizationId),
  ],
)
