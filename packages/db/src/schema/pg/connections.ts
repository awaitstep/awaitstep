import { sql } from 'drizzle-orm'
import { pgTable, text, boolean, index, primaryKey } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'
import { projects } from './projects.js'

export const connections = pgTable(
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
    allProjects: boolean('all_projects').notNull().default(true),
    tokenStatus: text('token_status').notNull().default('unchecked'),
    tokenExpiresAt: isoTimestamp('token_expires_at'),
    tokenCheckedAt: isoTimestamp('token_checked_at'),
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
    index('idx_connections_token_checked').on(table.tokenCheckedAt),
  ],
)

export const connectionProjects = pgTable(
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
