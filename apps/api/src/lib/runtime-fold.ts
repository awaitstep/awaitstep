import type { ArtifactIR, EnvDeclaration, ProjectFile, WorkflowRuntime } from '@awaitstep/ir'
import {
  PACKAGE_MANIFEST_PATH,
  PROJECT_HANDLERS_PATH,
  hasHandlerModules,
  projectHandlerModules,
  projectHandlersSource,
} from '@awaitstep/ir'
import type { Workflow } from '@awaitstep/db'
import { parseDependencies } from './dependencies.js'

/**
 * A project-owned handlers.ts is the entry-handler source: it replaces the
 * trigger code folded from the legacy setting so codegen, queue/cron
 * detection and the IDE all read the same file.
 */
export function foldProjectHandlers(ir: ArtifactIR): ArtifactIR {
  const source = projectHandlersSource(ir.runtime?.files)
  if (source === undefined) return ir
  return { ...ir, runtime: { ...ir.runtime, triggerCode: source } }
}

/**
 * The project files a legacy runtime block implies: an IR that arrives with
 * inline trigger code or dependencies (an import, or an older client) seeds
 * `handlers.ts` / `package.json` when the project does not have them yet,
 * so the setting lives in one place the IDE and agents can edit. Returns
 * only the files still missing from `existing`.
 */
export function legacyRuntimeSeeds(
  runtime: WorkflowRuntime | undefined,
  existing: Iterable<string>,
): ProjectFile[] {
  if (!runtime) return []
  const paths = new Set(existing)
  const seeds: ProjectFile[] = []
  // A project on handler modules has left the annotation model: seeding
  // handlers.ts from an IR that still carries trigger code would put both
  // models in one project, which no deploy accepts.
  const modular = hasHandlerModules(projectHandlerModules([...paths].map((path) => ({ path }))))
  if (runtime.triggerCode && !modular && !paths.has(PROJECT_HANDLERS_PATH)) {
    seeds.push({ path: PROJECT_HANDLERS_PATH, source: runtime.triggerCode })
  }
  const deps = runtime.dependencies ?? {}
  if (Object.keys(deps).length > 0 && !paths.has(PACKAGE_MANIFEST_PATH)) {
    seeds.push({
      path: PACKAGE_MANIFEST_PATH,
      source: `${JSON.stringify({ dependencies: deps }, null, 2)}\n`,
    })
  }
  return seeds
}

/**
 * Drops the inline copies of settings the project files now own, so a
 * stored version never carries a stale duplicate: with a `handlers.ts` or
 * handler modules the runtime's `triggerCode` is redundant, with a
 * `package.json` so is `dependencies`.
 */
export function stripProjectOwnedRuntime(
  ir: ArtifactIR,
  files: readonly ProjectFile[],
): ArtifactIR {
  if (!ir.runtime) return ir
  const paths = new Set(files.map((f) => f.path))
  const runtime: WorkflowRuntime = { ...ir.runtime }
  if (paths.has(PROJECT_HANDLERS_PATH) || hasHandlerModules(projectHandlerModules(files))) {
    delete runtime.triggerCode
  }
  if (paths.has(PACKAGE_MANIFEST_PATH)) delete runtime.dependencies
  return { ...ir, runtime }
}

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
export function foldWorkflowRuntime(ir: ArtifactIR, workflow: Workflow): ArtifactIR {
  // parseDependencies returns undefined for null/empty/malformed input.
  const columnDeps = parseDependencies(workflow.dependencies)
  const envDeclarations = parseEnvDeclarations(workflow.envVars)

  const runtime: WorkflowRuntime = {
    ...ir.runtime,
    ...(workflow.triggerCode && { triggerCode: workflow.triggerCode }),
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
