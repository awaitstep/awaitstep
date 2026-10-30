import type {
  WorkflowProvider,
  DiagnosticSource,
  GeneratedBundle,
  ProviderConfig,
  SourceDiagnostic,
} from '@awaitstep/codegen'
import {
  GenerateInputError,
  bundleCodeFiles,
  bundleDeployFiles,
  bundlePackageManifest,
} from '@awaitstep/codegen'
import { collectCompileErrors } from '@awaitstep/codegen/transpile'
import type { ArtifactIR, ProjectFile } from '@awaitstep/ir'
import { loadArtifact, parsePackageManifest } from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow, WorkflowVersion } from '@awaitstep/db'
import type { AppNodeRegistry } from './node-registry.js'
import { createMergedNodeRegistry } from './node-registry.js'
import { resolveProvider, validateNodesForProvider } from './provider-resolver.js'
import { collectNodeDependencies, mergeDependencies } from './dependencies.js'
import { placeOf, resolveAndValidateEnvVars } from './env-resolve.js'
import { escapingImports, unresolvedAppImports } from './import-check.js'
import { foldProjectFiles, foldProjectHandlers, foldWorkflowRuntime } from './runtime-fold.js'

export interface WorkflowContext {
  adapter: WorkflowProvider
  bundle: GeneratedBundle
  ir: ArtifactIR
  versionId: string
  /** The version's number, for the audit log's "Lead enrichment v12". */
  versionNumber: number
  nodeRegistry: AppNodeRegistry
  envVars?: Record<string, { value: string; isSecret: boolean }>
  dependencies?: Record<string, string>
  /**
   * Everything wrong with the workflow that this prepare chose not to fail
   * on. Always empty in `'deploy'`, which returns an error instead, and the
   * full picture in `'read'`, which has to open the workspace before the user
   * can fix what is wrong with it.
   */
  diagnostics: PrepareDiagnostic[]
  /**
   * Which checks actually ran, in the order they ran. An empty
   * `diagnostics` only means "nothing found" for the checks listed here, so
   * a caller reporting one has to report the other — silence about a check
   * that never happened is how a passing check becomes a failing deploy.
   */
  checked: DiagnosticSource[]
}

/**
 * One finding about a workflow. The shape lives in `@awaitstep/codegen` so
 * the API, the web client and the IDE's problem list cannot drift apart —
 * the data crosses between them as JSON, where nothing would catch it.
 */
export type PrepareDiagnostic = SourceDiagnostic

/**
 * How strict a prepare is.
 * - `'deploy'` — everything must hold: env values resolve, the IR validates,
 *   the bundle compiles. Anything less cannot ship.
 * - `'read'`  — nothing is fatal that still leaves a bundle to show; the
 *   problems come back as diagnostics.
 */
export type PrepareMode = 'deploy' | 'read'

export interface WorkflowPrepareError {
  error: string
  status: number
  details?: unknown
  /** Issues collected before the failure, when there were any. */
  diagnostics?: PrepareDiagnostic[]
  /** Which checks ran before the failure. */
  checked?: DiagnosticSource[]
  /**
   * True when this is a fact about the workflow rather than a reason the
   * prepare could not run — an IR that fails its schema, a graph no bundle
   * can be generated from. A strict caller refuses either way; a caller
   * whose job is to *report* answers with the findings instead of an error,
   * because "your graph has a cycle" is the answer, not a malfunction.
   */
  finding?: boolean
}

export interface WorkflowPrepareInput {
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
   * Project files to fold instead of the stored rows — how a candidate
   * overlay reaches a version without being written first. Only the current
   * version folds the table at all (older ones use their snapshot), so this
   * is ignored for any other version; the caller decides whether an overlay
   * is allowed at all.
   */
  projectFiles?: readonly ProjectFile[]
  /**
   * The resolved deployment config, when the caller has one. Generation reads
   * what it bakes into the code — for Cloudflare, the retention constant
   * `WORKFLOW.create()` passes — so a deploy has to hand it over, or the
   * bundle this returns is not the bundle that would ship. A read has no
   * config to resolve and generates the provider's defaults.
   */
  deploymentConfig?: unknown
  /**
   * How strict to be. Defaults to `'deploy'`, where every env var the
   * workflow references must resolve to a value. A read-only view of the
   * source (the code workspace) needs the names only, which come from the
   * IR; missing values are not an error there.
   */
  mode?: PrepareMode
}

export async function prepareWorkflow(
  input: WorkflowPrepareInput,
): Promise<WorkflowContext | WorkflowPrepareError> {
  const { db, workflow, organizationId } = input
  const mode: PrepareMode = input.mode ?? 'deploy'
  const lenient = mode === 'read'
  const diagnostics: PrepareDiagnostic[] = []
  const checked: DiagnosticSource[] = []

  const versionId = input.version?.id ?? input.versionId ?? workflow.currentVersionId
  if (!versionId) return { error: 'No version to use', status: 400 }

  // Only the current version reads the live project-file table; older
  // versions deploy their snapshot, so their rows are never fetched.
  const isCurrentVersion = versionId === workflow.currentVersionId
  const [version, projectFiles] = await Promise.all([
    input.version ?? db.getWorkflowVersionById(versionId),
    input.projectFiles ?? (isCurrentVersion ? db.listWorkflowFiles(workflow.id) : []),
  ])
  if (!version || version.workflowId !== workflow.id) {
    return { error: 'Version not found', status: 404 }
  }

  // Schema-invalid stored rows keep the pre-existing 400 semantics (they were
  // previously caught by adapter.validate) so monitoring doesn't see a 5xx.
  checked.push('ir')
  const loaded = loadArtifact(version.ir)
  if (!loaded.ok) {
    return {
      error: 'IR validation failed',
      status: 400,
      details: loaded.errors,
      checked,
      finding: true,
      diagnostics: loaded.errors.map((error) => ({
        source: 'ir' as const,
        message: error.message,
        ...(error.nodeId && { nodeId: error.nodeId }),
      })),
    }
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
  ir = foldWorkflowRuntime(ir, workflow)
  // The current version reads the live project-file table; older versions
  // fold the snapshot they were saved with.
  ir = foldProjectHandlers(foldProjectFiles(ir, projectFiles, { useSnapshot: !isCurrentVersion }))

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

  checked.push('provider')
  const nodeCheck = validateNodesForProvider(ir, input.provider)
  if (!nodeCheck.valid) {
    const names = nodeCheck.unsupportedNodes.map((node) => node.name)
    // Unsupported nodes still generate something worth looking at, so a read
    // reports them rather than refusing to open the workspace — one
    // diagnostic per node, each carrying the id, because a client marks the
    // node and names are not unique.
    if (!lenient) {
      return { error: `Nodes not supported by this provider: ${names.join(', ')}`, status: 400 }
    }
    for (const node of nodeCheck.unsupportedNodes) {
      diagnostics.push({
        source: 'provider',
        message: `Node "${node.name}" is not supported by this provider`,
        nodeId: node.id,
      })
    }
  }

  // Resolve env vars against the workflow's place: its workspace, then its
  // project, then the organization (B4).
  checked.push('env')
  const envResult = await resolveAndValidateEnvVars(
    db,
    placeOf(organizationId, workflow),
    workflow,
    ir,
    nodeRegistry,
  )
  if (envResult.error) {
    if (!lenient) return { error: envResult.error, status: 400 }
    // A read used to drop this silently, so a check could call a workflow
    // healthy and the deploy then refuse it on a missing secret — the
    // likeliest "it passed, then it failed" surprise. The message names
    // variables, never values.
    diagnostics.push({ source: 'env', message: envResult.error })
  }

  // Source resolution: the bundle is always generated from the IR. Config
  // artifacts (wrangler.json, bindings) derive from IR declarations at
  // deploy time regardless of mode.
  //
  // Everything generation reads goes in here, so this bundle is the one that
  // ships: a deploy used to generate a second time with its deployment config
  // attached, which meant the code the compile gate below checked was not the
  // code that was uploaded. Credentials are not among generation's inputs —
  // only the deploy itself needs them.
  let bundle: GeneratedBundle
  const triggerCode = ir.runtime?.triggerCode
  const generateConfig: ProviderConfig = {
    provider: input.provider ?? 'cloudflare',
    credentials: {},
    ...(envResult.envVars && { envVars: envResult.envVars }),
    options: {
      ...(triggerCode && { triggerCode }),
      ...(input.deploymentConfig !== undefined && { deploymentConfig: input.deploymentConfig }),
    },
  }
  // Bundle invariants (path collisions, reserved names) are a 422 the
  // caller can act on, not a 500 that repeats on every deploy.
  try {
    bundle = adapter.generate(ir, generateConfig)
  } catch (err) {
    // Only a failure the generator blames on its input is a fact about the
    // workflow. Anything else is a bug in the generator, and has to look
    // like one: reported as a 500 and logged, never as "something is wrong
    // with your workflow" — an agent would go looking in its own files,
    // and nobody would ever see the exception.
    if (!(err instanceof GenerateInputError)) throw err
    // Nothing to show without a bundle, but whatever the IR was already
    // flagged for travels with the failure — generation usually fails
    // *because* of it, and "graph contains a cycle" alone reads as if the
    // code were the problem. The failure itself joins the list so a
    // caller reporting diagnostics alone never reports an empty list for
    // a workflow that could not be generated at all.
    diagnostics.push({
      source: err.source,
      message: err.message,
      ...(err.path && { path: err.path }),
    })
    return {
      error: `Bundle validation failed: ${err.message}`,
      status: 422,
      diagnostics,
      checked,
      finding: true,
    }
  }

  // Dependencies: the bundle's own package.json is the source of truth —
  // the project's own manifest when it has one; the legacy dependencies
  // setting (folded into the runtime block) only applies when it does not.
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
  const codeFiles = bundleCodeFiles(bundle)
  checked.push('compile')
  const compileErrors = await collectCompileErrors(codeFiles)
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

  // A gate in every mode: an import that climbs out of the bundle would have
  // the bundler pack a file from the build host into the Worker. Refused
  // before any bundling path acts on it; reported, not refused, in a read.
  const escapes = escapingImports(codeFiles)
  if (escapes.length > 0 && !lenient) {
    const first = escapes[0]!
    return {
      error: `Import "${first.specifier}" in ${first.path} reaches outside the project`,
      status: 422,
      ...(escapes.length > 1 && {
        details: escapes.map((e) => ({ path: e.path, message: `"${e.specifier}"` })),
      }),
    }
  }

  // Only a read looks for these. Compiling says nothing about whether an
  // import resolves — each file transpiles alone — so a misspelled `#app/`
  // path reaches the deploy untouched. A deploy still finds out the hard
  // way, from the bundler; this is so a check does not have to.
  if (lenient) {
    checked.push('import')
    for (const escape of escapes) {
      diagnostics.push({
        source: 'import',
        message: `"${escape.specifier}" reaches outside the project — imports must stay inside it`,
        path: escape.path,
      })
    }
    // Every deploy file is a resolution target — `#app/data/x.json` is an
    // asset — while only code files are worth scanning for imports.
    // The project's own `imports` map travels into the worker manifest, so
    // a specifier it claims resolves at deploy whatever the file tree holds.
    for (const unresolved of unresolvedAppImports(
      bundleDeployFiles(bundle),
      codeFiles,
      manifest?.imports,
    )) {
      diagnostics.push({
        source: 'import',
        message: `Cannot resolve "${unresolved.specifier}" — no project file matches it`,
        path: unresolved.path,
      })
    }
  }

  return {
    adapter,
    bundle,
    ir,
    versionId,
    versionNumber: version.version,
    nodeRegistry,
    envVars: envResult.envVars,
    dependencies,
    diagnostics,
    checked,
  }
}

export function isPrepareError(
  result: WorkflowContext | WorkflowPrepareError,
): result is WorkflowPrepareError {
  return 'error' in result
}
