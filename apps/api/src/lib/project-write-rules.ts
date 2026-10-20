import {
  handlerEntry,
  hasHandlerModules,
  loadArtifact,
  projectHandlerModules,
  projectWriteErrors,
  type ProjectWriteError,
} from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow } from '@awaitstep/db'

/**
 * A file a request would write or remove. `source: null` is a removal, and a
 * removal is not a write — the rules judge what arrives, not what leaves.
 */
export interface ProjectFileChange {
  path: string
  source: string | null
}

export interface ProjectWriteRuleInput {
  db: DatabaseAdapter
  workflow: Workflow
  /** The project's files as stored. Only their paths are read. */
  existing: readonly { path: string }[]
  changes: readonly ProjectFileChange[]
}

/**
 * The entry-handler source a project still carries in the annotation model,
 * and where it lives. The column is the usual home, but an IR that arrived
 * with inline `runtime.triggerCode` (an import, an older client) is just as
 * real: the generators read it, so everything else must too.
 */
export async function legacyTriggerCode(
  db: DatabaseAdapter,
  workflow: Workflow,
): Promise<{ source: string; origin: 'setting' | 'version' } | null> {
  if (workflow.triggerCode?.trim()) return { source: workflow.triggerCode, origin: 'setting' }
  if (!workflow.currentVersionId) return null
  const version = await db.getWorkflowVersionById(workflow.currentVersionId)
  if (!version || version.workflowId !== workflow.id) return null
  const loaded = loadArtifact(version.ir)
  const source = loaded.ok ? loaded.value.runtime?.triggerCode : undefined
  return source?.trim() ? { source, origin: 'version' } : null
}

/**
 * Why a set of changes may not be written, or empty.
 *
 * The one authority for write-time rules, so an endpoint that *checks* a
 * candidate and an endpoint that *writes* it can never disagree about what
 * is allowed. The path rules are pure and live in `@awaitstep/ir`
 * ({@link projectWriteErrors}); the legacy trigger-code rule needs the
 * database, which is the only reason it lives here rather than beside them.
 *
 * The database is read only when it can matter — a change that gives the
 * project its first handler module — and never once a path rule has already
 * refused the write.
 */
export async function projectWriteRuleErrors(
  input: ProjectWriteRuleInput,
): Promise<ProjectWriteError[]> {
  const removed = new Set(
    input.changes.filter((change) => change.source === null).map((change) => change.path),
  )
  const written = input.changes
    .filter((change) => change.source !== null)
    .map((change) => change.path)
  const merged = new Set([
    ...input.existing.map((file) => file.path).filter((path) => !removed.has(path)),
    ...written,
  ])

  const errors = projectWriteErrors(written, merged)
  if (errors.length > 0) return errors

  const firstHandler = written.find((path) => handlerEntry(path))
  if (!firstHandler || hasHandlerModules(projectHandlerModules(input.existing))) return []

  // Legacy trigger code — in the setting or inline in the current version's
  // IR — is the same model as handlers.ts: a first handler module would
  // silently retire it, so the project converts first (the workspace offers
  // that as one action).
  const legacy = await legacyTriggerCode(input.db, input.workflow)
  if (!legacy) return []
  return [
    {
      path: firstHandler,
      message: `The workflow still has legacy trigger code — convert it to handler modules first (POST /workflows/${input.workflow.id}/project/convert-handlers)`,
    },
  ]
}
