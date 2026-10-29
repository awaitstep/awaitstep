import { sql } from 'drizzle-orm'
import { pgTable, text, index, check, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'
import { projects } from './projects.js'
import { organization } from './auth.js'
import { workspaces } from './workspaces.js'

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    // Exactly one of projectId / organizationId is set: a project-level key
    // carries projectId (its organization is the project's), an
    // organization-level key carries organizationId. A workspace key (B3)
    // carries its workspace's projectId and the workspace.
    projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    // The key that minted this one, when a key did: revoking or expiring the
    // parent stops it too.
    parentKeyId: text('parent_key_id').references((): AnyPgColumn => apiKeys.id, {
      onDelete: 'cascade',
    }),
    createdBy: text('created_by').notNull(),
    name: text('name').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    keyPrefix: text('key_prefix').notNull(),
    // The secret's last four characters, for "ask_p1…a71d"; null on keys minted before B3.
    keySuffix: text('key_suffix'),
    // The coarse scopes keys were checked by before B3, kept filled from
    // `permissions` until the Phase-2 cleanup drops the column.
    scopes: text('scopes').notNull(),
    // The grid: `{ "<resource>": ["<action>", …] }` from @awaitstep/ir's
    // catalog for the key's level. What auth checks.
    permissions: text('permissions').notNull().default('{}'),
    expiresAt: isoTimestamp('expires_at'),
    lastUsedAt: isoTimestamp('last_used_at'),
    revokedAt: isoTimestamp('revoked_at'),
    createdAt: isoTimestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index('idx_api_keys_project_id').on(table.projectId),
    index('idx_api_keys_organization_id').on(table.organizationId),
    index('idx_api_keys_parent_key_id').on(table.parentKeyId),
    index('idx_api_keys_key_hash').on(table.keyHash),
    index('idx_api_keys_workspace_id').on(table.workspaceId),
    check('api_keys_one_level', sql`(project_id IS NULL) <> (organization_id IS NULL)`),
  ],
)
