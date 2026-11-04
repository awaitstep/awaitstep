import { pgTable, text, index, primaryKey, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { isoTimestamp } from './iso-timestamp.js'
import { projects } from './projects.js'
import { organization } from './auth.js'
import { workspaces } from './workspaces.js'

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    // Every key belongs to exactly one organization — its binding. A key is
    // never reusable by another org; set at all three levels (a project/
    // workspace key's org is its project's org, denormalised here).
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // Which IR catalog the key is checked by, and which scope set it carries:
    // 'organization' reaches the whole org and has no scope rows; 'project'
    // carries a set in api_key_projects; 'workspace' a set in
    // api_key_workspaces (all workspaces in one project). "Multi-scope" is a
    // set of >1; single-scope is a set of one — the same code path.
    level: text('level').$type<'organization' | 'project' | 'workspace'>().notNull(),
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
    // The whole-key kill-switch: the owner revokes every scope at once. A
    // key is also dead once its last live scope row is revoked (then this is
    // stamped too), so request-time auth need only read this and the set.
    revokedAt: isoTimestamp('revoked_at'),
    createdAt: isoTimestamp('created_at').notNull(),
  },
  (table) => [
    index('idx_api_keys_organization_id').on(table.organizationId),
    index('idx_api_keys_parent_key_id').on(table.parentKeyId),
    index('idx_api_keys_key_hash').on(table.keyHash),
  ],
)

// The projects a project-level key reaches — one row per project. Each row
// carries its own `revoked_at`: a project revokes its own access from its own
// key page without touching the others (per-consumer revoke). The key is dead
// once no row is live. Every project_id belongs to the key's organization.
export const apiKeyProjects = pgTable(
  'api_key_projects',
  {
    keyId: text('key_id')
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    revokedAt: isoTimestamp('revoked_at'),
  },
  (table) => [
    primaryKey({ columns: [table.keyId, table.projectId] }),
    index('idx_api_key_projects_project').on(table.projectId),
  ],
)

// The workspaces a workspace-level key reaches — all within one project. Same
// per-consumer revoke as api_key_projects; the owning project is that of its
// workspaces (read through a join, never stored twice).
export const apiKeyWorkspaces = pgTable(
  'api_key_workspaces',
  {
    keyId: text('key_id')
      .notNull()
      .references(() => apiKeys.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    revokedAt: isoTimestamp('revoked_at'),
  },
  (table) => [
    primaryKey({ columns: [table.keyId, table.workspaceId] }),
    index('idx_api_key_workspaces_workspace').on(table.workspaceId),
  ],
)
