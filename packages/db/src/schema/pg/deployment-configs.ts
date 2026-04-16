import { pgTable, text, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { workflows } from './workflows.js'
import { connections } from './connections.js'

export const deploymentConfigs = pgTable(
  'deployment_configs',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .notNull()
      .references(() => connections.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    config: text('config').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string' }).notNull().defaultNow(),
    updatedBy: text('updated_by'),
  },
  (table) => [
    uniqueIndex('idx_deployment_configs_workflow_connection').on(
      table.workflowId,
      table.connectionId,
    ),
    index('idx_deployment_configs_workflow_id').on(table.workflowId),
  ],
)
