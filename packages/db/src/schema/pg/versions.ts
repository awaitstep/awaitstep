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
    // 'generated' = IR is truth, code derived (v1 behavior).
    // 'ejected'   = user edits stored source; IR retained, drift-validated.
    // 'sdk'       = source authoritative (CLI push), IR derived.
    sourceMode: text('source_mode').notNull().default('generated'),
    // JSON GeneratedBundle when sourceMode !== 'generated'; null otherwise.
    source: text('source'),
    // JSON step manifest (nodeId → stepName/filePath) for drift validation.
    manifest: text('manifest'),
    // Hash of the freshly generated bundle at eject time — the drift baseline.
    baseGeneratedHash: text('base_generated_hash'),
    locked: integer('locked').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'string' }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_workflow_version_unique').on(table.workflowId, table.version),
    index('idx_workflow_versions_workflow_id').on(table.workflowId),
  ],
)
