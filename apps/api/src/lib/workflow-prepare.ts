import type {
  WorkflowProvider,
  GeneratedBundle,
  ProviderConfig,
  StepManifest,
} from '@awaitstep/codegen'
import { bundleCodeFiles, bundlePackageManifest } from '@awaitstep/codegen'
import { collectCompileErrors } from '@awaitstep/codegen/transpile'
import type { ArtifactIR } from '@awaitstep/ir'
import { loadArtifact, parsePackageManifest } from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow, WorkflowSourceMode, WorkflowVersion } from '@awaitstep/db'
import type { AppNodeRegistry } from './node-registry.js'
import { createMergedNodeRegistry } from './node-registry.js'
import { resolveProvider, validateNodesForProvider } from './provider-resolver.js'
import { collectNodeDependencies, mergeDependencies } from './dependencies.js'
import { resolveAndValidateEnvVars } from './env-resolve.js'
import { foldProjectFiles, foldProjectHandlers, foldWorkflowRuntime } from './runtime-fold.js'

export interface WorkflowContext {
  adapter: WorkflowProvider
  bundle: GeneratedBundle
  ir: ArtifactIR
  versionId: string
  sourceMode: WorkflowSourceMode
  nodeRegistry: AppNodeRegistry
  envVars?: Record<string, { value: string; isSecret: boolean }>
  dependencies?: Record<string, string>
  /**
   * Everything wrong with the workflow that this prepare chose not to fail
   * on. Always empty in the strict modes — they return an error instead —
   * and the full picture in `'read'`, which has to open the workspace before
   * the user can fix what is wrong with it.
   */
  diagnostics: PrepareDiagnostic[]
}

/** Where a diagnostic came from, so a client can route it to the right place. */
export type DiagnosticSource = 'ir' | 'provider' | 'compile'

export interface PrepareDiagnostic {
  source: DiagnosticSource
  message: string
  /** The node the issue belongs to, when it is about one. */
  nodeId?: string
  /** The bundle file, for compile diagnostics. */
  path?: string
}

/**
 * How strict a prepare is.
 * - `'deploy'` — everything must hold: env values resolve, the IR validates,
 *   the bundle compiles. Anything less cannot ship.
 * - `'build'` — as `'deploy'` without env values, which a bundle does not
 *   need to be produced or stored (eject).
 * - `'read'`  — nothing is fatal that still leaves a bundle to show; the
 *   problems come back as diagnostics.
 */
export type PrepareMode = 'deploy' | 'build' | 'read'

export interface WorkflowPrepareError {
  error: string
  status: number
  details?: unknown
  /** Issues collected before the failure, when there were any. */
  diagnostics?: PrepareDiagnostic[]
}

interface WorkflowPrepareInput {
  db: DatabaseAdapter
  workflow: Workflow
  organizationId: string
  projectId: string
  nodeRegistry?: AppNodeRegistry
  versionId?: string
  /** Pre-fetched version row — skips the lookup (must match versionId). */
  version?: WorkflowVersion
  provider?: string
  /**
   * Regenerate from IR with node region markers, ignoring any stored source
   * (used by POST /eject). Mutually exclusive with the stored-source path.
   */
  eject?: boolean
  /**
   * Whether every env var the workflow references must resolve to a value
   * (the default — a deploy or local run cannot proceed without them). A
   * read-only view of the source (the code workspace, an eject) needs the
   * names only, which come from the IR; missing values are not an error.
   */
  // How strict to be. Defaults to 'deploy'.
  mode?: PrepareMode
}

export async function prepareWorkflow(
  input: WorkflowPrepareInput,
): Promise<WorkflowContext | WorkflowPrepareError> {
  const { db, workflow, organizationId, projectId } = input
  const mode: PrepareMode = input.mode ?? 'deploy'
  const lenient = mode === 'read'
  const diagnostics: PrepareDiagnostic[] = []

  const versionId = input.version?.id ?? input.versionId ?? workflow.currentVersionId
  if (!versionId) return { error: 'No version to use', status: 400 }

  // Only the current version reads the live project-file table; older
  // versions deploy their snapshot, so their rows are never fetched.
  const isCurrentVersion = versionId === workflow.currentVersionId
  const [version, projectFiles] = await Promise.all([
    input.version ?? db.getWorkflowVersionById(versionId),
    isCurrentVersion ? db.listWorkflowFiles(workflow.id) : [],
  ])
  if (!version || version.workflowId !== workflow.id) {
    return { error: 'Version not found', status: 404 }
  }

  // Schema-invalid stored rows keep the pre-existing 400 semantics (they were
  // previously caught by adapter.validate) so monitoring doesn't see a 5xx.
  const loaded = loadArtifact(version.ir)
  if (!loaded.ok) {
    return { error: 'IR validation failed', status: 400, details: loaded.errors }
  }
  const parsedIr = loaded.value
  // Stamp kind from the workflow row when the stored IR predates the
  // discriminator. Existing workflows have no `kind` in their stored IR.
  // Scripts also require a `trigger` field — default to HTTP if the stored
  // IR was persisted before that schema requirement.
  let ir: ArtifactIR = parsedIr
  if (ir.kind === undefined && workflow.kind === 'script') {
    ir = { ...ir, kind: 'script' } as ArtifactIR
  }
  if (ir.kind === 'script' && !ir.trigger) {
    ir = { ...ir, trigger: { type: 'http' } } as ArtifactIR
  }
  // Fold the legacy workflow columns into ir.runtime — from here on the IR is
  // the single self-contained description (trigger code, deps, env, bindings).
  // Ejected/sdk versions keep their own trigger code: their stored bundle's
  // handlers were compiled from it, and wrangler queue/cron config must match
  // the handlers that will actually deploy.
  const sourceMode = (version.sourceMode ?? 'generated') as WorkflowSourceMode
  ir = foldWorkflowRuntime(ir, workflow, {
    preserveTriggerCode: sourceMode !== 'generated',
  })
  // Ejected/sdk bundles already carry the project files they were ejected
  // with; only generated versions read the live table (current version) or
  // their saved snapshot (older versions).
  if (sourceMode === 'generated') {
    ir = foldProjectHandlers(foldProjectFiles(ir, projectFiles, { useSnapshot: !isCurrentVersion }))
  }

  // Merge installed nodes for custom node template resolution
  const nodeTypesInIR = new Set(ir.nodes.map((n) => n.type))
  const missingFromBuiltin = [...nodeTypesInIR].filter((t) => !input.nodeRegistry?.registry.get(t))
  const installedNodes =
    missingFromBuiltin.length > 0
      ? (await db.listInstalledNodes(organizationId, { limit: 100 })).data.filter((n) =>
          missingFromBuiltin.includes(n.nodeId),
        )
      : []
  const nodeRegistry = createMergedNodeRegistry(input.nodeRegistry, installedNodes)

  const adapter = resolveProvider(input.provider, {
    templateResolver: nodeRegistry.templateResolver,
  })

  // Validate IR
  const validation = adapter.validate(ir)
  if (!validation.ok) {
    if (!lenient) {
      return { error: 'IR validation failed', status: 400, details: validation.errors }
    }
    for (const error of validation.errors) {
      diagnostics.push({
        source: 'ir',
        message: error.message,
        ...(error.nodeId && { nodeId: error.nodeId }),
      })
    }
  }

  const nodeCheck = validateNodesForProvider(ir, input.provider)
  if (!nodeCheck.valid) {
    const message = `Nodes not supported by this provider: ${nodeCheck.unsupportedNodes.join(', ')}`
    // Unsupported nodes still generate something worth looking at, so a read
    // reports them rather than refusing to open the workspace.
    if (!lenient) return { error: message, status: 400 }
    diagnostics.push({ source: 'provider', message })
  }

  // Resolve env vars
  const envResult = await resolveAndValidateEnvVars(
    db,
    organizationId,
    projectId,
    workflow.id,
    ir,
    nodeRegistry,
  )
  if (envResult.error && mode === 'deploy') {
    return { error: envResult.error, status: 400 }
  }

  // Source resolution: user-edited versions (ejected/sdk) deploy their
  // stored bundle after drift validation; everything else regenerates from
  // the IR. Config artifacts (wrangler.json, bindings) always derive from IR
  // declarations at deploy time regardless of mode.
  let bundle: GeneratedBundle
  if (!input.eject && sourceMode !== 'generated') {
    if (!version.source) {
      return {
        error: 'Version is in ejected/sdk mode but has no stored source — re-eject to repair',
        status: 422,
      }
    }
    const stored = parseStoredSource(version.source, version.manifest)
    if ('error' in stored) return stored
    if (adapter.validateSource) {
      const driftErrors = adapter.validateSource(ir, stored.bundle, stored.manifest)
      if (driftErrors.length > 0) {
        return { error: 'Source drift validation failed', status: 422, details: driftErrors }
      }
    }
    bundle = stored.bundle
  } else {
    const triggerCode = ir.runtime?.triggerCode
    const generateConfig: ProviderConfig = {
      provider: 'cloudflare',
      credentials: {},
      ...(envResult.envVars && { envVars: envResult.envVars }),
      options: {
        ...(triggerCode && { triggerCode }),
        ...(input.eject && { eject: true }),
      },
    }
    // Bundle invariants (path collisions, reserved names) are a 422 the
    // caller can act on, not a 500 that repeats on every deploy.
    try {
      bundle = adapter.generate(ir, generateConfig)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Nothing to show without a bundle, but whatever the IR was already
      // flagged for travels with the failure — generation usually fails
      // *because* of it, and "graph contains a cycle" alone reads as if the
      // code were the problem.
      return {
        error: `Bundle validation failed: ${message}`,
        status: 422,
        ...(diagnostics.length > 0 && { diagnostics }),
      }
    }
  }

  // Dependencies: the bundle's own package.json is the source of truth —
  // for ejected/sdk versions that is the stored, possibly hand-edited
  // manifest; the legacy dependencies setting (folded into the runtime
  // block) only applies when the project has no manifest at all.
  const manifestSource = bundlePackageManifest(bundle)
  const manifest = manifestSource ? parsePackageManifest(manifestSource) : null
  const workflowDeps = manifest ? (manifest.dependencies ?? {}) : (ir.runtime?.dependencies ?? {})
  const nodeDeps = collectNodeDependencies(ir, nodeRegistry)
  const dependencies = mergeDependencies(workflowDeps, nodeDeps)

  // Catch syntax errors in user-authored code (step bodies, handlers, project
  // modules) before deploy/preview consumers act on the bundle. Without this
  // the sucrase exception bubbles up and surfaces as a generic 500. Each
  // error names its file: in a multi-file project "Unexpected token (16:21)"
  // on its own does not say where to look.
  const compileErrors = await collectCompileErrors(bundleCodeFiles(bundle))
  if (compileErrors.length > 0) {
    if (!lenient) {
      const first = compileErrors[0]!
      return {
        error: `Compile error in ${first.path}: ${first.message}`,
        status: 422,
        ...(compileErrors.length > 1 && { details: compileErrors }),
      }
    }
    for (const error of compileErrors) {
      diagnostics.push({ source: 'compile', message: error.message, path: error.path })
    }
  }

  return {
    adapter,
    bundle,
    ir,
    versionId,
    sourceMode,
    nodeRegistry,
    envVars: envResult.envVars,
    dependencies,
    diagnostics,
  }
}

/**
 * Parses a version row's stored source + manifest JSON — 422 on corruption
 * or on a missing manifest (a manifest-less non-generated row would make
 * drift validation pass vacuously, so it is an error, not a fallback).
 * Shared by the prepare pipeline and the GET/PUT /source routes.
 */
export function parseStoredSource(
  sourceJson: string,
  manifestJson: string | null | undefined,
): { bundle: GeneratedBundle; manifest: StepManifest } | WorkflowPrepareError {
  try {
    const bundle = JSON.parse(sourceJson) as GeneratedBundle
    if (typeof bundle.entry !== 'string' || !Array.isArray(bundle.files)) {
      return { error: 'Stored source is not a valid bundle', status: 422 }
    }
    if (!manifestJson) {
      return { error: 'Stored source has no step manifest — re-eject to repair', status: 422 }
    }
    const manifest = JSON.parse(manifestJson) as StepManifest
    if (!Array.isArray(manifest.steps)) {
      return { error: 'Stored step manifest is corrupted — re-eject to repair', status: 422 }
    }
    return { bundle, manifest }
  } catch {
    return { error: 'Stored source is corrupted', status: 422 }
  }
}

export function isPrepareError(
  result: WorkflowContext | WorkflowPrepareError,
): result is WorkflowPrepareError {
  return 'error' in result
}
