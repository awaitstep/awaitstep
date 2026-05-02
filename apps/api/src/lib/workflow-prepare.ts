import type { WorkflowProvider, GeneratedArtifact, ProviderConfig } from '@awaitstep/codegen'
import { transpileToJS } from '@awaitstep/codegen/transpile'
import type { ArtifactIR } from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow } from '@awaitstep/db'
import type { AppNodeRegistry } from './node-registry.js'
import { createMergedNodeRegistry } from './node-registry.js'
import { resolveProvider, validateNodesForProvider } from './provider-resolver.js'
import { parseDependencies, collectNodeDependencies, mergeDependencies } from './dependencies.js'
import { resolveAndValidateEnvVars } from './env-resolve.js'

export interface WorkflowContext {
  adapter: WorkflowProvider
  artifact: GeneratedArtifact
  ir: ArtifactIR
  versionId: string
  nodeRegistry: AppNodeRegistry
  envVars?: Record<string, { value: string; isSecret: boolean }>
  dependencies?: Record<string, string>
}

export interface WorkflowPrepareError {
  error: string
  status: number
  details?: unknown
}

interface WorkflowPrepareInput {
  db: DatabaseAdapter
  workflow: Workflow
  organizationId: string
  projectId: string
  nodeRegistry?: AppNodeRegistry
  versionId?: string
  provider?: string
}

export async function prepareWorkflow(
  input: WorkflowPrepareInput,
): Promise<WorkflowContext | WorkflowPrepareError> {
  const { db, workflow, organizationId, projectId } = input

  const versionId = input.versionId ?? workflow.currentVersionId
  if (!versionId) return { error: 'No version to use', status: 400 }

  const version = await db.getWorkflowVersionById(versionId)
  if (!version || version.workflowId !== workflow.id) {
    return { error: 'Version not found', status: 404 }
  }

  const parsedIr = JSON.parse(version.ir) as ArtifactIR
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
    return { error: 'IR validation failed', status: 400, details: validation.errors }
  }

  const nodeCheck = validateNodesForProvider(ir, input.provider)
  if (!nodeCheck.valid) {
    return {
      error: `Nodes not supported by this provider: ${nodeCheck.unsupportedNodes.join(', ')}`,
      status: 400,
    }
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
  if (envResult.error) {
    return { error: envResult.error, status: 400 }
  }

  // Collect dependencies
  const workflowDeps = parseDependencies(workflow.dependencies)
  const nodeDeps = collectNodeDependencies(ir, nodeRegistry)
  const dependencies = mergeDependencies(workflowDeps, nodeDeps)

  // Generate artifact
  const generateConfig: ProviderConfig = {
    provider: 'cloudflare',
    credentials: {},
    ...(envResult.envVars && { envVars: envResult.envVars }),
    ...(workflow.triggerCode && { options: { triggerCode: workflow.triggerCode } }),
  }
  const artifact = adapter.generate(ir, generateConfig)

  // Catch syntax errors in user-authored code (step bodies, triggerCode, etc.)
  // before deploy/preview consumers act on the artifact. Without this the
  // sucrase exception bubbles up and surfaces as a generic 500.
  try {
    await transpileToJS(artifact.source)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: `Compile error: ${message}`, status: 422 }
  }

  return {
    adapter,
    artifact,
    ir,
    versionId,
    nodeRegistry,
    envVars: envResult.envVars,
    dependencies,
  }
}

export function isPrepareError(
  result: WorkflowContext | WorkflowPrepareError,
): result is WorkflowPrepareError {
  return 'error' in result
}
