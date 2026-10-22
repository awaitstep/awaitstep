import { pgTable, text, integer, uniqueIndex, index, timestamp } from 'drizzle-orm/pg-core'
import { workflows } from './workflows.js'

export const workflowVersions = pgTable(
  'workflow_versions',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    ir: text('ir').notNull(),
    // All four are dead since W0 removed the stored-source mode: the IR is
    // the only source of truth, so every row reads 'generated' with the
    // other three null. `manifest` has no reader either — a deploy pins the
    // step manifest it shipped in its own config_snapshot, which is where
    // run telemetry joins step labels to nodes. Kept because migrations here
    // are additive only; dropped in the Phase 2 cleanup beside
    // workflows.triggerCode/dependencies/envVars.
    sourceMode: text('source_mode').notNull().default('generated'),
    source: text('source'),
    manifest: text('manifest'),
    baseGeneratedHash: text('base_generated_hash'),
    locked: integer('locked').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_workflow_version_unique').on(table.workflowId, table.version),
    index('idx_workflow_versions_workflow_id').on(table.workflowId),
  ],
)
