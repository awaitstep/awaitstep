import type { WorkflowProvider, ProviderConfig, GeneratedArtifact } from '@awaitstep/codegen'
import type { WorkflowIR } from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow } from '@awaitstep/db'
import type { AppNodeRegistry } from './node-registry.js'
import { resolveProvider, validateNodesForProvider } from './provider-resolver.js'
import { parseDependencies, collectNodeDependencies, mergeDependencies } from './dependencies.js'

export interface DeployContext {
  adapter: WorkflowProvider
  artifact: GeneratedArtifact
  providerConfig: ProviderConfig
  ir: WorkflowIR
  versionId: string
  connectionId: string
}

export interface DeployPrepareError {
  error: string
  status: number
  details?: unknown
}

interface DeployPrepareInput {
  db: DatabaseAdapter
  workflow: Workflow
  organizationId: string
  projectId: string
  connectionId: string
  versionId?: string
  nodeRegistry?: AppNodeRegistry
  appName?: string
}

export async function prepareDeploy(
  input: DeployPrepareInput,
): Promise<DeployContext | DeployPrepareError> {
  const { db, workflow, organizationId, projectId, connectionId, nodeRegistry, appName } = input

  // Lock check
  if (await db.isActiveDeploymentLocked(workflow.id)) {
    return {
      error: 'Currently deployed version is locked — unlock it before deploying',
      status: 400,
    }
  }

  // Connection
  const connection = await db.getProviderConnectionById(connectionId)
  if (!connection || connection.organizationId !== organizationId) {
    return { error: 'Connection not found', status: 404 }
  }

  // Version
  const versionId = input.versionId ?? workflow.currentVersionId
  if (!versionId) return { error: 'No version to deploy', status: 400 }

  const version = await db.getWorkflowVersionById(versionId)
  if (!version || version.workflowId !== workflow.id) {
    return { error: 'Version not found', status: 404 }
  }

  if (version.locked === 1) {
    return { error: 'Version is locked', status: 400 }
  }

  // Provider + IR validation
  const adapter = resolveProvider(undefined, {
    templateResolver: nodeRegistry?.templateResolver,
  })
  const ir = JSON.parse(version.ir) as WorkflowIR

  const validation = adapter.validate(ir)
  if (!validation.ok) {
    return { error: 'IR validation failed', status: 400, details: validation.errors }
  }

  const nodeCheck = validateNodesForProvider(ir)
  if (!nodeCheck.valid) {
    return {
      error: `Nodes not supported by this provider: ${nodeCheck.unsupportedNodes.join(', ')}`,
      status: 400,
    }
  }

  // Env vars
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

  // Dependencies
  const workflowDeps = parseDependencies(workflow.dependencies)
  const nodeDeps = collectNodeDependencies(ir, nodeRegistry)
  const deps = mergeDependencies(workflowDeps, nodeDeps)

  // Provider config
  const creds = JSON.parse(connection.credentials) as Record<string, string>
  const providerConfig: ProviderConfig = {
    provider: 'cloudflare-workflows',
    credentials: creds,
    options: {
      workflowId: workflow.id,
      workflowName: workflow.name,
      ...(deps && { dependencies: deps }),
      ...(appName && { packageName: appName }),
    },
    envVars: envResult.envVars,
  }

  // Credential verification
  const credCheck = await adapter.verifyCredentials(providerConfig)
  if (!credCheck.valid) {
    return { error: credCheck.error ?? 'Invalid credentials', status: 403 }
  }

  // Generate artifact
  const artifact = adapter.generate(ir, providerConfig)

  return { adapter, artifact, providerConfig, ir, versionId, connectionId }
}

export function isDeployError(
  result: DeployContext | DeployPrepareError,
): result is DeployPrepareError {
  return 'error' in result
}

// --- Env var helpers (moved from deploy.ts) ---

function collectRequiredEnvVars(ir: WorkflowIR, nodeRegistry?: AppNodeRegistry): string[] {
  if (!nodeRegistry) return []
  const required: string[] = []
  for (const node of ir.nodes) {
    const def = nodeRegistry.registry.get(node.type)
    if (!def) continue
    for (const field of Object.values(def.configSchema)) {
      if (field.type === 'secret' && field.envVarName) {
        required.push(field.envVarName)
      }
    }
  }
  return [...new Set(required)]
}

async function resolveAndValidateEnvVars(
  db: DatabaseAdapter,
  organizationId: string,
  projectId: string,
  workflowId: string,
  ir: WorkflowIR,
  nodeRegistry?: AppNodeRegistry,
): Promise<{ envVars?: ProviderConfig['envVars']; error?: string }> {
  const resolved = await db.resolveEnvVars(organizationId, projectId, workflowId)
  const requiredNames = collectRequiredEnvVars(ir, nodeRegistry)

  const missing: string[] = []
  for (const name of requiredNames) {
    const entry = resolved[name]
    if (!entry || entry.value === undefined) {
      missing.push(name)
    }
  }

  for (const [name, entry] of Object.entries(resolved)) {
    if (entry.value === undefined) {
      missing.push(name)
    }
  }

  if (missing.length > 0) {
    const unique = [...new Set(missing)]
    return { error: `Missing or unresolved environment variables: ${unique.join(', ')}` }
  }

  if (Object.keys(resolved).length === 0) return {}

  const envVars: Record<string, { value: string; isSecret: boolean }> = {}
  for (const [name, entry] of Object.entries(resolved)) {
    envVars[name] = { value: entry.value!, isSecret: entry.isSecret }
  }
  return { envVars }
}
