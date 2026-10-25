import { sql } from 'drizzle-orm'
import { sqliteTable, text, index, check } from 'drizzle-orm/sqlite-core'
import { projects } from './projects.js'
import { organization } from './auth.js'

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    // Exactly one of projectId / organizationId is set: a project-level key
    // carries projectId (its organization is the project's), an
    // organization-level key carries organizationId.
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    createdBy: text('created_by').notNull(),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    keyPrefix: text('key_prefix').notNull(),
    scopes: text('scopes').notNull(),
    expiresAt: text('expires_at'),
    lastUsedAt: text('last_used_at'),
    revokedAt: text('revoked_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_api_keys_project_id').on(table.projectId),
    index('idx_api_keys_organization_id').on(table.organizationId),
    index('idx_api_keys_key_hash').on(table.keyHash),
    check('api_keys_one_level', sql`(project_id IS NULL) <> (organization_id IS NULL)`),
  ],
)
