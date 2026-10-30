import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'

// The organization's audit log (B7). No id carries a foreign key: a row
// outlives what it names, and deleting a project is itself an event. Words and names are snapshots, written once.
export const auditEvents = sqliteTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    // No foreign key: deleting the organization leaves its rows to the
    // 90-day purge, so the evidence outlives whoever removed it.
    organizationId: text('organization_id').notNull(),
    projectId: text('project_id'),
    workspaceId: text('workspace_id'),
    level: text('level', { enum: ['organization', 'project', 'workspace'] }).notNull(),
    kind: text('kind', {
      enum: ['danger', 'key', 'access', 'deploy', 'auth', 'lock'],
    }).notNull(),
    event: text('event').notNull(),
    actorType: text('actor_type', { enum: ['user', 'key'] }).notNull(),
    actorId: text('actor_id').notNull(),
    actorName: text('actor_name').notNull(),
    // A person's address at the time (null for a key): names are theirs to choose.
    actorEmail: text('actor_email'),
    action: text('action').notNull(),
    target: text('target').notNull(),
    detail: text('detail').notNull().default(''),
    // The facts the words came from, as JSON. Never a secret value.
    meta: text('meta').notNull().default('{}'),
    // Masked when written (`81.2.69.x`); the full address is never kept.
    ip: text('ip'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_audit_events_org_created').on(table.organizationId, table.createdAt, table.id),
    index('idx_audit_events_actor_event').on(table.actorId, table.event, table.createdAt),
    index('idx_audit_events_created').on(table.createdAt),
  ],
)
