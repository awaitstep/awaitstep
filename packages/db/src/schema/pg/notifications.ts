import { pgTable, text, integer, boolean, index, uniqueIndex } from 'drizzle-orm/pg-core'
import { organization, user } from './auth.js'
import { accessRequests } from './access.js'
import { isoTimestamp } from './iso-timestamp.js'

// The Inbox (B8): one row per recipient. Places carry no foreign key — the
// Inbox names what is gone as gone — but a request row goes with its request.
export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: ['failure', 'request', 'expiry', 'people', 'deploy'],
    }).notNull(),
    event: text('event').notNull(),
    // What repeats fold into: one row per person and key.
    groupKey: text('group_key').notNull(),
    projectId: text('project_id'),
    workspaceId: text('workspace_id'),
    accessRequestId: text('access_request_id').references(() => accessRequests.id, {
      onDelete: 'cascade',
    }),
    // The facts the sentence is written from, as JSON: names as they were.
    meta: text('meta').notNull().default('{}'),
    count: integer('count').notNull().default(1),
    needsAction: boolean('needs_action').notNull().default(false),
    readAt: isoTimestamp('read_at'),
    createdAt: isoTimestamp('created_at').notNull(),
    updatedAt: isoTimestamp('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('uq_notifications_user_group').on(table.userId, table.groupKey),
    index('idx_notifications_inbox').on(table.organizationId, table.userId, table.updatedAt),
    index('idx_notifications_updated').on(table.updatedAt),
    index('idx_notifications_access_request').on(table.accessRequestId),
  ],
)

// When each person last closed What's new: the notes are the same everywhere.
export const releaseVisits = pgTable('release_visits', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  seenAt: isoTimestamp('seen_at').notNull(),
  // The notes that visit showed (ids, as JSON): later ones are new to them.
  seenIds: text('seen_ids').notNull().default('[]'),
})
