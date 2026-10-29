import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { invitation, user } from './auth.js'
import { projects } from './projects.js'
import { workspaces } from './workspaces.js'

// Roles below the organization (B2). better-auth's `member` row says who is
// in the org and whether they run it; these say which projects and
// workspaces a plain member reaches. The role table that reads them is
// `resolveRoles` in @awaitstep/ir and `RoleFields` in the adapters.

export const projectMembers = sqliteTable(
  'project_members',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
    // Null on rows the migration backfilled: nobody granted them.
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index('idx_project_members_user_id').on(table.userId),
  ],
)

export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'editor', 'viewer'] }).notNull(),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('idx_workspace_members_user_id').on(table.userId),
  ],
)

/** Where an invitation lets someone work once accepted: a project role, or a role in one workspace. */
export const invitationPlaces = sqliteTable(
  'invitation_places',
  {
    id: text('id').primaryKey(),
    invitationId: text('invitation_id')
      .notNull()
      .references(() => invitation.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Null for a project-wide place.
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (table) => [index('idx_invitation_places_invitation_id').on(table.invitationId)],
)

/** A Viewer's "Ask for edit access", addressed to one of the workspace's admins. */
export const accessRequests = sqliteTable(
  'access_requests',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'approved', 'declined'] })
      .notNull()
      .default('pending'),
    // Approved when they could already edit (raised meanwhile): nothing was granted.
    alreadyEditing: integer('already_editing', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
    decidedAt: text('decided_at'),
    decidedBy: text('decided_by'),
  },
  (table) => [
    index('idx_access_requests_workspace_id').on(table.workspaceId),
    index('idx_access_requests_user_id').on(table.userId),
    index('idx_access_requests_to_user_id').on(table.toUserId),
    // One open request per person and workspace, whatever two asks at once do.
    uniqueIndex('uq_access_requests_pending')
      .on(table.workspaceId, table.userId)
      .where(sql`status = 'pending'`),
  ],
)
