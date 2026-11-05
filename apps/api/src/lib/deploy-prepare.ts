import type { WorkflowProvider, ProviderConfig, GeneratedBundle } from '@awaitstep/codegen'
import { PROJECT_CONNECTION_REASONS, type ArtifactIR } from '@awaitstep/ir'
import type { DatabaseAdapter, Workflow } from '@awaitstep/db'
import type { WranglerDeployer } from '@awaitstep/provider-cloudflare'
import type { AppNodeRegistry } from './node-registry.js'
import { prepareWorkflow, isPrepareError } from './workflow-prepare.js'
import { resolveProvider } from './provider-resolver.js'

/** A deploy, a config read or a preview with an account that isn't one of the project's (23a). */
export const CONNECTION_NOT_SERVING = PROJECT_CONNECTION_REASONS.notProjects

export interface DeployContext {
  adapter: WorkflowProvider
  bundle: GeneratedBundle
  providerConfig: ProviderConfig
  ir: ArtifactIR
  versionId: string
  versionNumber: number
  connectionId: string
  connectionName: string
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

  // Connection, with whether it is one of the workflow's project's accounts —
  // added or owned, and still serving it (org filter in SQL). Only new deploys
  // are held to the list: takedown and run controls are not.
  const found = await db.getConnectionForProject(connectionId, organizationId, projectId)
  if (!found) {
    return { error: 'Connection not found', status: 404 }
  }
  if (!found.covered) {
    return { error: CONNECTION_NOT_SERVING, status: 403 }
  }
  const connection = found.connection

  // Version lock check. The row is handed to the prepare below rather than
  // read twice — the lock and the IR are two questions about one row.
  const version = input.versionId ? await db.getWorkflowVersionById(input.versionId) : undefined
  // Another workflow's version is not found, before anything is said about its lock.
  if (input.versionId && (!version || version.workflowId !== input.workflow.id)) {
    return { error: 'Version not found', status: 404 }
  }
  if (version?.locked === 1) {
    return { error: 'Version is locked', status: 400 }
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

  // Shared workflow preparation (IR, validation, env vars, codegen). It
  // merges installed-node templates into the registry and generates the
  // bundle — the deployable one: the connection's provider and the resolved
  // deployment config are generation's remaining inputs, so they go in here
  // rather than into a second generate pass whose output nothing had checked.
  const prepared = await prepareWorkflow({
    db,
    workflow,
    organizationId,
    projectId,
    nodeRegistry: input.nodeRegistry,
    versionId: input.versionId,
    // Null only when the id names no row, which the prepare answers with its
    // own 404; passing it through would claim the row was never asked for.
    ...(version && { version }),
    provider: connection.provider,
    deploymentConfig: resolvedConfig.config,
  })

  if (isPrepareError(prepared)) return prepared

  // The adapter the deploy itself runs through: same provider and the same
  // merged template resolver the prepare generated with, plus the deployer.
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
      ...(prepared.ir.runtime?.triggerCode && { triggerCode: prepared.ir.runtime.triggerCode }),
      deploymentConfig: resolvedConfig.config,
    },
    envVars: prepared.envVars,
  }

  // Credential verification
  const credCheck = await adapter.verifyCredentials(providerConfig)
  if (!credCheck.valid) {
    return { error: credCheck.error ?? 'Invalid credentials', status: 403 }
  }

  return {
    adapter,
    bundle: prepared.bundle,
    providerConfig,
    ir: prepared.ir,
    versionId: prepared.versionId,
    versionNumber: prepared.versionNumber,
    connectionId,
    connectionName: connection.name,
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
    const storedConfig = JSON.parse(stored.config) as Record<string, unknown>
    // Strip legacy `triggerCode` written by older deploys before it moved to
    // workflow.triggerCode. Without this, strict() rejects the whole row and
    // the user loses their saved routes/flags.
    delete storedConfig.triggerCode
    const parsed = adapter.deploymentConfigSchema.safeParse(storedConfig)
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
  if (!legacy) return undefined

  return {
    ...(legacy?.route && {
      routes: [{ pattern: legacy.route.pattern, zoneName: legacy.route.zoneName }],
    }),
  }
}
