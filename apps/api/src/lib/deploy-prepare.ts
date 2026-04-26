import type { WorkflowProvider, ProviderConfig, GeneratedArtifact } from '@awaitstep/codegen'
import type { ArtifactIR } from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow } from '@awaitstep/db'
import type { WranglerDeployer } from '@awaitstep/provider-cloudflare'
import type { AppNodeRegistry } from './node-registry.js'
import { prepareWorkflow, isPrepareError } from './workflow-prepare.js'
import { resolveProvider } from './provider-resolver.js'

export interface DeployContext {
  adapter: WorkflowProvider
  artifact: GeneratedArtifact
  providerConfig: ProviderConfig
  ir: ArtifactIR
  versionId: string
  connectionId: string
  resolvedDeploymentConfig: unknown
  connectionProvider: string
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
  deploymentConfig?: unknown
  deployer?: WranglerDeployer
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

  // Connection (org filter in SQL)
  const connection = await db.getProviderConnectionById(connectionId, organizationId)
  if (!connection) {
    return { error: 'Connection not found', status: 404 }
  }

  // Version lock check
  if (input.versionId) {
    const version = await db.getWorkflowVersionById(input.versionId)
    if (version?.locked === 1) {
      return { error: 'Version is locked', status: 400 }
    }
  }

  // Initial adapter for config schema validation (no installed-node templates yet)
  const initialAdapter = resolveProvider(connection.provider, {
    deployer: input.deployer,
  })

  // Resolve deployment config: request body → stored → legacy → defaults
  const resolvedConfig = await resolveDeploymentConfig({
    provided: input.deploymentConfig,
    db,
    workflowId: workflow.id,
    connectionId,
    workflow,
    adapter: initialAdapter,
  })
  if ('error' in resolvedConfig) {
    return resolvedConfig
  }

  // Shared workflow preparation (IR, validation, env vars, codegen)
  // This merges installed-node templates into the registry.
  const prepared = await prepareWorkflow({
    db,
    workflow,
    organizationId,
    projectId,
    nodeRegistry: input.nodeRegistry,
    versionId: input.versionId,
  })

  if (isPrepareError(prepared)) return prepared

  // Rebuild adapter with merged template resolver (includes installed nodes)
  // so codegen can resolve custom node templates like S3, Supabase, etc.
  const adapter = resolveProvider(connection.provider, {
    templateResolver: prepared.nodeRegistry.templateResolver,
    deployer: input.deployer,
  })

  // Provider config with credentials
  const creds = JSON.parse(connection.credentials) as Record<string, string>
  const providerConfig: ProviderConfig = {
    provider: connection.provider,
    credentials: creds,
    options: {
      workflowId: workflow.id,
      workflowName: workflow.name,
      ir: prepared.ir,
      ...(prepared.dependencies && { dependencies: prepared.dependencies }),
      ...(appName && { packageName: appName }),
      deploymentConfig: resolvedConfig.config,
    },
    envVars: prepared.envVars,
  }

  // Credential verification
  const credCheck = await adapter.verifyCredentials(providerConfig)
  if (!credCheck.valid) {
    return { error: credCheck.error ?? 'Invalid credentials', status: 403 }
  }

  // Generate artifact with full provider config (includes credentials + installed node templates)
  const artifact = adapter.generate(prepared.ir, providerConfig)

  return {
    adapter,
    artifact,
    providerConfig,
    ir: prepared.ir,
    versionId: prepared.versionId,
    connectionId,
    resolvedDeploymentConfig: resolvedConfig.config,
    connectionProvider: connection.provider,
  }
}

export function isDeployError(
  result: DeployContext | DeployPrepareError,
): result is DeployPrepareError {
  return 'error' in result
}

// --- Config resolution ---

interface ResolveConfigInput {
  provided?: unknown
  db: DatabaseAdapter
  workflowId: string
  connectionId: string
  workflow: Workflow
  adapter: WorkflowProvider
}

type ResolvedConfig = { config: unknown } | DeployPrepareError

async function resolveDeploymentConfig(input: ResolveConfigInput): Promise<ResolvedConfig> {
  const { provided, db, workflowId, connectionId, workflow, adapter } = input

  // 1. Request body config (highest priority)
  if (provided !== undefined) {
    const parsed = adapter.deploymentConfigSchema.safeParse(provided)
    if (!parsed.success) {
      return { error: 'Invalid deployment config', status: 422, details: parsed.error }
    }
    return { config: parsed.data }
  }

  // 2. Stored deployment config
  const stored = await db.getDeploymentConfig(workflowId, connectionId)
  if (stored) {
    const parsed = adapter.deploymentConfigSchema.safeParse(JSON.parse(stored.config))
    if (parsed.success) {
      return { config: parsed.data }
    }
    // Stored config is stale/invalid — fall through to legacy/defaults
  }

  // 3. Legacy workflow fields (backward compat during migration)
  const legacyConfig = normalizeLegacyConfig(workflow)
  if (legacyConfig) {
    const parsed = adapter.deploymentConfigSchema.safeParse(legacyConfig)
    if (parsed.success) {
      return { config: parsed.data }
    }
  }

  // 4. Provider defaults
  return { config: adapter.getDefaultDeploymentConfig() }
}

function normalizeLegacyConfig(workflow: Workflow): unknown | undefined {
  const legacy = workflow.deployConfig ? JSON.parse(workflow.deployConfig) : undefined
  if (!legacy && !workflow.triggerCode) return undefined

  return {
    ...(legacy?.route && {
      routes: [{ pattern: legacy.route.pattern, zoneName: legacy.route.zoneName }],
    }),
    ...(workflow.triggerCode && { triggerCode: workflow.triggerCode }),
  }
}
