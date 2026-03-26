import { pgTable, text, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core'

export const installedNodes = pgTable(
  'installed_nodes',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    nodeId: text('node_id').notNull(),
    version: text('version').notNull(),
    bundle: text('bundle').notNull(),
    installedBy: text('installed_by').notNull(),
    installedAt: timestamp('installed_at', { mode: 'string' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_installed_nodes_org_node').on(table.organizationId, table.nodeId),
    index('idx_installed_nodes_org_id').on(table.organizationId),
  ],
)
