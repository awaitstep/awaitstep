import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { projects } from './projects.js'

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    // One of the preset swatches (`WORKSPACE_COLOURS` in @awaitstep/ir); the API validates it.
    colour: text('colour').notNull().default('green'),
    // Null on the Default workspace the migration gave every existing project.
    createdBy: text('created_by'),
    lockedBy: text('locked_by'),
    lockedAt: text('locked_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_workspaces_project_slug').on(table.projectId, table.slug),
    index('idx_workspaces_project_id').on(table.projectId),
  ],
)
