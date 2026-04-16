import type { WorkflowProvider, GeneratedArtifact, ProviderConfig } from '@awaitstep/codegen'
import type { WorkflowIR } from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow } from '@awaitstep/db'
import type { AppNodeRegistry } from './node-registry.js'
import { createMergedNodeRegistry } from './node-registry.js'
import { resolveProvider, validateNodesForProvider } from './provider-resolver.js'
import { parseDependencies, collectNodeDependencies, mergeDependencies } from './dependencies.js'
import { resolveAndValidateEnvVars } from './env-resolve.js'

export interface WorkflowContext {
  adapter: WorkflowProvider
  artifact: GeneratedArtifact
  ir: WorkflowIR
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

  const ir = JSON.parse(version.ir) as WorkflowIR

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
