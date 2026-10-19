import type { ArtifactIR, EnvDeclaration, ProjectFile, WorkflowRuntime } from '@awaitstep/ir'
import type { Workflow } from '@awaitstep/db'
import { parseDependencies } from './dependencies.js'

/**
 * Project files live in their own table — the one source of truth, seeded
 * from an imported IR on first save — and are snapshotted into
 * `runtime.files` whenever a version is saved. For the current version the
 * table replaces the snapshot (per-file writes land there first); older
 * versions keep theirs so a historical deploy or source view reproduces
 * exactly what was saved.
 */
export function foldProjectFiles(
  ir: ArtifactIR,
  files: readonly ProjectFile[],
  options: { useSnapshot: boolean },
): ArtifactIR {
  if (options.useSnapshot) return ir
  const runtime: WorkflowRuntime = { ...ir.runtime }
  delete runtime.files
  if (files.length > 0) {
    runtime.files = files.map(({ path, source }) => ({ path, source }))
  }
  if (Object.keys(runtime).length === 0) {
    const stripped = { ...ir }
    delete stripped.runtime
    return stripped
  }
  return { ...ir, runtime }
}

/**
 * Folds the legacy workflow columns (triggerCode, dependencies, envVars) into
 * `ir.runtime` so downstream code reads one self-contained document.
 *
 * Dual-write-era precedence is field-level, column over runtime: every
 * current writer updates the columns on save, so a non-empty column is at
 * least as fresh as the runtime copy — while pure-IR imports (empty columns)
 * keep their runtime values, and `runtime.bindings` (no column counterpart)
 * always survives. The columns are dropped in the Phase 2 cleanup migration,
 * after which this fold becomes a no-op.
 */
export function foldWorkflowRuntime(
  ir: ArtifactIR,
  workflow: Workflow,
  options?: {
    /**
     * Keep the IR's own triggerCode over the column when both exist — used
     * for ejected/sdk versions, whose stored source contains handlers
     * compiled from THEIR trigger code: folding the current column would
     * derive wrangler queue/cron config for handlers the frozen bundle
     * doesn't have. Dependencies and env still fold (they act at deploy
     * time, not inside the stored code).
     */
    preserveTriggerCode?: boolean
  },
): ArtifactIR {
  // parseDependencies returns undefined for null/empty/malformed input.
  const columnDeps = parseDependencies(workflow.dependencies)
  const envDeclarations = parseEnvDeclarations(workflow.envVars)
  const columnTriggerWins =
    workflow.triggerCode && !(options?.preserveTriggerCode && ir.runtime?.triggerCode)

  const runtime: WorkflowRuntime = {
    ...ir.runtime,
    ...(columnTriggerWins && { triggerCode: workflow.triggerCode as string }),
    ...(columnDeps && { dependencies: columnDeps }),
    ...(envDeclarations.length > 0 && { env: envDeclarations }),
  }

  if (Object.keys(runtime).length === 0) return ir
  return { ...ir, runtime }
}

/**
 * Env-var NAMES become declarations; values never enter the IR — they stay
 * in the env-var store and resolve at deploy time.
 */
function parseEnvDeclarations(envVarsJson: string | null | undefined): EnvDeclaration[] {
  if (!envVarsJson) return []
  try {
    const parsed: unknown = JSON.parse(envVarsJson)
    if (!Array.isArray(parsed)) return []
    const declarations: EnvDeclaration[] = []
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null) continue
      const { name, isSecret } = entry as { name?: unknown; isSecret?: unknown }
      if (typeof name !== 'string' || name.length === 0) continue
      declarations.push({ name, ...(isSecret === true && { secret: true }) })
    }
    return declarations
  } catch {
    return []
  }
}
