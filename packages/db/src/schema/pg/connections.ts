import { sql } from 'drizzle-orm'
import { pgTable, text, boolean, index, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'
import { projects } from './projects.js'
import { workspaces } from './workspaces.js'

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
    // Set: the account belongs to that project alone ("This project only"),
    // never listed or usable anywhere else; null: an organization account.
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
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
    index('idx_connections_project_id').on(table.projectId),
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

// The accounts a project deploys to (23a): the organization accounts it has
// added and the ones it owns, one of them its default.
export const projectConnections = pgTable(
  'project_connections',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    isDefault: boolean('is_default').notNull().default(false),
    // Null on the rows the migration added for accounts that served the project.
    createdBy: text('created_by'),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.connectionId] }),
    index('idx_project_connections_connection').on(table.connectionId),
    uniqueIndex('uq_project_connections_default')
      .on(table.projectId)
      .where(sql`is_default = true`),
  ],
)

// A workspace that deploys somewhere other than its project's default.
export const workspaceConnections = pgTable(
  'workspace_connections',
  {
    workspaceId: text('workspace_id')
      .primaryKey()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    setBy: text('set_by'),
    setAt: isoTimestamp('set_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index('idx_workspace_connections_connection').on(table.connectionId)],
)
