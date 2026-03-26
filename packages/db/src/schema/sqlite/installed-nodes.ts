import { sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const installedNodes = sqliteTable(
  'installed_nodes',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').notNull(),
    nodeId: text('node_id').notNull(),
    version: text('version').notNull(),
    bundle: text('bundle').notNull(),
    installedBy: text('installed_by').notNull(),
    installedAt: text('installed_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_installed_nodes_org_node').on(table.organizationId, table.nodeId),
    index('idx_installed_nodes_org_id').on(table.organizationId),
  ],
)
