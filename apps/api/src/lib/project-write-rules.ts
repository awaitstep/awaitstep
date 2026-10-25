import {
  handlerEntry,
  hasHandlerModules,
  loadArtifact,
  packageManifestWriteErrors,
  PACKAGE_MANIFEST_PATH,
  projectHandlerModules,
  projectWriteErrors,
  type ProjectWriteError,
} from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow, WorkflowVersion } from '@awaitstep/db'

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
  /** The current version row, when the caller has already read it. */
  version?: WorkflowVersion | null
  /** The project's files as stored. Only their paths are read. */
  existing: readonly { path: string }[]
  changes: readonly ProjectFileChange[]
}

/**
 * The entry-handler source a project still carries in the annotation model,
 * and where it lives. The column is the usual home, but an IR that arrived
 * with inline `runtime.triggerCode` (an import, an older client) is just as
 * real: the generators read it, so everything else must too.
 *
 * `version` is a row the caller has already read, passed in to save a
 * second query for the same one. It is used only when it *is* the current
 * version — anything else is fetched, because a wrong row here would
 * silently switch the rule off rather than fail.
 */
export async function legacyTriggerCode(
  db: DatabaseAdapter,
  workflow: Workflow,
  version?: WorkflowVersion | null,
): Promise<{ source: string; origin: 'setting' | 'version' } | null> {
  if (workflow.triggerCode?.trim()) return { source: workflow.triggerCode, origin: 'setting' }
  if (!workflow.currentVersionId) return null
  const current =
    version?.id === workflow.currentVersionId
      ? version
      : await db.getWorkflowVersionById(workflow.currentVersionId)
  if (!current || current.workflowId !== workflow.id) return null
  const loaded = loadArtifact(current.ir)
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

  const manifest = input.changes.find(
    (change) => change.path === PACKAGE_MANIFEST_PATH && change.source !== null,
  )
  if (manifest?.source) {
    const manifestErrors = packageManifestWriteErrors(manifest.source)
    if (manifestErrors.length > 0) return manifestErrors
  }

  const firstHandler = written.find((path) => handlerEntry(path))
  if (!firstHandler || hasHandlerModules(projectHandlerModules(input.existing))) return []

  // Legacy trigger code — in the setting or inline in the current version's
  // IR — is the same model as handlers.ts: a first handler module would
  // silently retire it, so the project converts first (the workspace offers
  // that as one action).
  const legacy = await legacyTriggerCode(input.db, input.workflow, input.version)
  if (!legacy) return []
  return [
    {
      path: firstHandler,
      message: `The workflow still has legacy trigger code — convert it to handler modules first (POST /workflows/${input.workflow.id}/project/convert-handlers)`,
    },
  ]
}
