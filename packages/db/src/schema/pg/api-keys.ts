import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, index, check } from 'drizzle-orm/pg-core'
import { projects } from './projects.js'
import { organization } from './auth.js'

export const apiKeys = pgTable(
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
    expiresAt: timestamp('expires_at', { mode: 'string' }),
    lastUsedAt: timestamp('last_used_at', { mode: 'string' }),
    revokedAt: timestamp('revoked_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_api_keys_project_id').on(table.projectId),
    index('idx_api_keys_organization_id').on(table.organizationId),
    index('idx_api_keys_key_hash').on(table.keyHash),
    check('api_keys_one_level', sql`(project_id IS NULL) <> (organization_id IS NULL)`),
  ],
)
