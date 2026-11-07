import type { ArtifactIR, EnvDeclaration, ProjectFile, WorkflowRuntime } from '@awaitstep/ir'
import {
  HANDLER_FETCH_PATH,
  PACKAGE_MANIFEST_PATH,
  PROJECT_HANDLERS_PATH,
  hasHandlerModules,
  projectHandlerModules,
  projectHandlersSource,
} from '@awaitstep/ir'
import { handlerModuleScaffold } from '@awaitstep/provider-cloudflare'
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
 * only the files still missing from `existing`. The save hands it a runtime
 * already passed through `withoutStaleProjectRuntime`, so a setting the
 * latest stored version does not carry never seeds.
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
 * A function or workflow starts with an HTTP entry it can edit: when the
 * project has no handler module and no legacy trigger code, the first save
 * seeds `handlers/fetch.ts` with the scaffold the Code view would create —
 * written against AwaitStep's handler contract, importing the generated
 * graph module. Returns nothing once any entry exists.
 */
export function defaultHandlerSeeds(
  kind: 'workflow' | 'script',
  runtime: WorkflowRuntime | undefined,
  existing: Iterable<string>,
): ProjectFile[] {
  const paths = new Set(existing)
  const modules = projectHandlerModules([...paths].map((path) => ({ path })))
  if (hasHandlerModules(modules) || runtime?.triggerCode || paths.has(PROJECT_HANDLERS_PATH)) {
    return []
  }
  return [
    { path: HANDLER_FETCH_PATH, source: handlerModuleScaffold({ kind: 'fetch', target: kind }) },
  ]
}

/**
 * The project-owned runtime a posted document carries — `files`,
 * `triggerCode`, `dependencies` — is honoured on a workflow's first version
 * (an import: the client's document is all there is) and, after that, only
 * where the latest stored version carries the same field. Once a version
 * exists the file table is the truth, so a snapshot or legacy setting the
 * latest version does not carry is a stale copy — a document loaded before
 * Code deleted the files, which a files-only commit never invalidates, or a
 * setting the workflow never had — and is dropped here, before it can seed a
 * file or ride into the version. (A legacy setting is stripped from the
 * stored text only while its file exists, so without this `triggerCode`
 * would re-enter the IR and reach the deploy with no file to see it in.)
 * `latest` is null without a stored version; the caller passes a document
 * carrying nothing for a stored row it cannot read.
 */
export function withoutStaleProjectRuntime(
  ir: ArtifactIR,
  latest: Pick<ArtifactIR, 'runtime'> | null,
): ArtifactIR {
  if (!ir.runtime || latest === null) return ir
  const kept = latest.runtime
  const runtime: WorkflowRuntime = { ...ir.runtime }
  if ((kept?.files?.length ?? 0) === 0) delete runtime.files
  if (!kept?.triggerCode) delete runtime.triggerCode
  if (Object.keys(kept?.dependencies ?? {}).length === 0) delete runtime.dependencies
  if (Object.keys(runtime).length === 0) {
    const stripped = { ...ir }
    delete stripped.runtime
    return stripped
  }
  return { ...ir, runtime }
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
