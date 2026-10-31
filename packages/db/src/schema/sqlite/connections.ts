import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core'
import { projects } from './projects.js'

export const connections = sqliteTable(
  'connections',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    createdBy: text('created_by').notNull(),
    provider: text('provider').notNull(),
    name: text('name').notNull(),
    credentials: text('credentials').notNull(),
    // B9: an account serves every project unless narrowed to the rows in
    // connection_projects; the token's health as Cloudflare last told it.
    allProjects: integer('all_projects', { mode: 'boolean' }).notNull().default(true),
    tokenStatus: text('token_status').notNull().default('unchecked'),
    tokenExpiresAt: text('token_expires_at'),
    tokenCheckedAt: text('token_checked_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_connections_org_id').on(table.organizationId),
    index('idx_connections_created_by').on(table.createdBy),
    index('idx_connections_token_checked').on(table.tokenCheckedAt),
  ],
)

export const connectionProjects = sqliteTable(
  'connection_projects',
  {
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.projectId] }),
    index('idx_connection_projects_project').on(table.projectId),
  ],
)
