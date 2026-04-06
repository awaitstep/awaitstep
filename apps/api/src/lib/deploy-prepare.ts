import type { WorkflowProvider, ProviderConfig, GeneratedArtifact } from '@awaitstep/codegen'
import type { WorkflowIR } from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow } from '@awaitstep/db'
import type { AppNodeRegistry } from './node-registry.js'
import { prepareWorkflow, isPrepareError } from './workflow-prepare.js'

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
  previewUrls?: boolean
  workersDev?: boolean
}

export async function prepareDeploy(
  input: DeployPrepareInput,
): Promise<DeployContext | DeployPrepareError> {
  const { db, workflow, organizationId, projectId, connectionId, appName } = input

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

  // Version lock check
  if (input.versionId) {
    const version = await db.getWorkflowVersionById(input.versionId)
    if (version?.locked === 1) {
      return { error: 'Version is locked', status: 400 }
    }
  }

  // Shared workflow preparation (IR, validation, env vars, codegen)
  const prepared = await prepareWorkflow({
    db,
    workflow,
    organizationId,
    projectId,
    nodeRegistry: input.nodeRegistry,
    versionId: input.versionId,
  })

  if (isPrepareError(prepared)) return prepared

  // Provider config with credentials
  const creds = JSON.parse(connection.credentials) as Record<string, string>
  const providerConfig: ProviderConfig = {
    provider: 'cloudflare-workflows',
    credentials: creds,
    options: {
      workflowId: workflow.id,
      workflowName: workflow.name,
      ir: prepared.ir,
      ...(prepared.dependencies && { dependencies: prepared.dependencies }),
      ...(appName && { packageName: appName }),
      ...(workflow.deployConfig && { deployConfig: JSON.parse(workflow.deployConfig) }),
      ...(workflow.triggerCode && { triggerCode: workflow.triggerCode }),
      ...(input.previewUrls !== undefined && { previewUrls: input.previewUrls }),
      ...(input.workersDev !== undefined && { workersDev: input.workersDev }),
    },
    envVars: prepared.envVars,
  }

  // Credential verification
  const credCheck = await prepared.adapter.verifyCredentials(providerConfig)
  if (!credCheck.valid) {
    return { error: credCheck.error ?? 'Invalid credentials', status: 403 }
  }

  // Re-generate artifact with full provider config (includes credentials)
  const artifact = prepared.adapter.generate(prepared.ir, providerConfig)

  return {
    adapter: prepared.adapter,
    artifact,
    providerConfig,
    ir: prepared.ir,
    versionId: prepared.versionId,
    connectionId,
  }
}

export function isDeployError(
  result: DeployContext | DeployPrepareError,
): result is DeployPrepareError {
  return 'error' in result
}
