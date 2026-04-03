import { validateIR } from '@awaitstep/ir'
import type { WorkflowIR, ValidationError, Result } from '@awaitstep/ir'
import { transpileToJS } from '@awaitstep/codegen/transpile'
import { generateWorkflow } from './codegen/generate.js'
import type {
  WorkflowProvider,
  LocalDevProvider,
  CredentialsCheckResult,
  GeneratedArtifact,
  DeployResult,
  ProviderConfig,
  WorkflowRunStatus,
  WorkflowStatus,
  LocalDevSession,
  LocalDevOptions,
  TemplateResolver,
} from '@awaitstep/codegen'
import { deployWithWrangler, deleteWorker } from './deploy.js'
import { startLocalDev } from './local-dev.js'
import { sanitizedWorkflowName } from './naming.js'
import { CloudflareAPI } from './api.js'
import { detectBindings, type BindingRequirement } from './codegen/bindings.js'
import { CloudflareResourcesAPI } from './resources.js'

interface CloudflareOptions {
  workflowId: string
  workflowName: string
  dependencies?: Record<string, string>
}

function extractOptions(config: ProviderConfig): CloudflareOptions | null {
  const workflowId = config.options?.['workflowId'] as string | undefined
  const workflowName = config.options?.['workflowName'] as string | undefined
  if (!workflowId || !workflowName) return null
  const dependencies = config.options?.['dependencies'] as Record<string, string> | undefined
  return { workflowId, workflowName, dependencies }
}

export type DeployStage =
  | 'INITIALIZING'
  | 'GENERATING_CODE'
  | 'CODE_READY'
  | 'DETECTING_BINDINGS'
  | 'BINDINGS_READY'
  | 'CREATING_WORKER'
  | 'DEPLOYING'
  | 'WORKER_DEPLOYED'
  | 'UPDATING_WORKFLOW'
  | 'COMPLETED'
  | 'FAILED'

export interface DeployProgress {
  stage: DeployStage
  message: string
  progress: number
}

export type OnDeployProgress = (progress: DeployProgress) => void

export class CloudflareWorkflowsAdapter implements WorkflowProvider, LocalDevProvider {
  readonly name = 'cloudflare-workflows'
  private templateResolver?: TemplateResolver

  constructor(options?: { templateResolver?: TemplateResolver }) {
    this.templateResolver = options?.templateResolver
  }

  validate(ir: WorkflowIR): Result<void, ValidationError[]> {
    const result = validateIR(ir)
    if (!result.ok) return result
    return { ok: true, value: undefined }
  }

  async verifyCredentials(config: ProviderConfig): Promise<CredentialsCheckResult> {
    const { accountId, apiToken } = extractCredentials(config)
    const api = new CloudflareAPI({ accountId, apiToken })
    try {
      const verified = await api.verifyToken()
      if (!verified) return { valid: false, error: 'API token is invalid or expired' }
      return { valid: true }
    } catch {
      return { valid: false, error: 'Failed to verify API token with Cloudflare' }
    }
  }

  generate(ir: WorkflowIR, config?: ProviderConfig): GeneratedArtifact {
    const envVarNames = config?.envVars ? Object.keys(config.envVars) : undefined
    const source = generateWorkflow(ir, {
      templateResolver: this.templateResolver,
      envVarNames,
    })
    return {
      filename: 'worker.ts',
      source,
    }
  }

  async deploy(artifact: GeneratedArtifact, config: ProviderConfig): Promise<DeployResult> {
    return this._doDeploy(artifact, config)
  }

  async deployWithProgress(
    artifact: GeneratedArtifact,
    config: ProviderConfig,
    onProgress?: OnDeployProgress,
  ): Promise<DeployResult> {
    return this._doDeploy(artifact, config, onProgress)
  }

  private async _doDeploy(
    artifact: GeneratedArtifact,
    config: ProviderConfig,
    onProgress?: OnDeployProgress,
  ): Promise<DeployResult> {
    const report = (stage: DeployStage, message: string, progress: number) => {
      onProgress?.({ stage, message, progress })
    }

    report('INITIALIZING', 'Preparing deployment...', 5)

    const { accountId, apiToken } = extractCredentials(config)
    const opts = extractOptions(config)

    if (!opts) {
      report('FAILED', 'Missing workflowId or workflowName', 0)
      return {
        success: false,
        deploymentId: '',
        error: 'workflowId and workflowName are required in config.options',
      }
    }

    report('GENERATING_CODE', 'Transpiling TypeScript...', 15)
    const compiled = await transpileToJS(artifact.source)
    const compiledArtifact: GeneratedArtifact = {
      filename: 'worker.js',
      source: artifact.source,
      compiled,
    }
    report('CODE_READY', 'Code compiled', 25)

    report('DETECTING_BINDINGS', 'Analyzing workflow bindings...', 35)

    // Auto-detect resource bindings from IR
    const ir = config.options?.['ir'] as WorkflowIR | undefined
    let resolvedBindings: BindingRequirement[] | undefined
    if (ir) {
      const detected = detectBindings(ir)
      if (detected.length > 0) {
        const resourcesApi = new CloudflareResourcesAPI({ accountId, apiToken })
        const resolution = await resourcesApi.resolveBindings(detected)
        if (resolution.errors.length > 0) {
          const errorMsg = resolution.errors.map((e) => e.error).join('; ')
          report('FAILED', errorMsg, 0)
          return { success: false, deploymentId: '', error: errorMsg }
        }
        resolvedBindings = resolution.resolved
      }
    }

    report('BINDINGS_READY', 'Bindings configured', 45)

    report('CREATING_WORKER', 'Creating Cloudflare Worker...', 55)
    report('DEPLOYING', 'Deploying to Cloudflare...', 65)
    const { vars, secrets } = extractVarsAndSecrets(config)
    const result = await deployWithWrangler(compiledArtifact, {
      workflowId: opts.workflowId,
      workflowName: opts.workflowName,
      accountId,
      apiToken,
      packageName: config.options?.['packageName'] as string | undefined,
      vars,
      secrets,
      dependencies: opts.dependencies,
      bindings: resolvedBindings,
    })

    if (!result.success) {
      report('FAILED', result.error ?? 'Deploy failed', 0)
      return { success: false, deploymentId: '', error: result.error ?? 'Deploy failed' }
    }

    report('WORKER_DEPLOYED', 'Worker deployed', 80)
    report('UPDATING_WORKFLOW', 'Updating workflow configuration...', 90)
    report('COMPLETED', 'Deployment successful', 100)
    return {
      success: true,
      deploymentId: result.workerName,
      url: result.workerUrl,
      dashboardUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/${result.workerName}`,
    }
  }

  async trigger(
    deploymentId: string,
    params: unknown,
    config: ProviderConfig,
  ): Promise<{ instanceId: string }> {
    const { accountId, apiToken } = extractCredentials(config)
    const workflowName = sanitizedWorkflowName(config.options?.['workflowName'] as string)

    const api = new CloudflareAPI({ accountId, apiToken })
    const instance = await api.createInstance(workflowName, params)
    return { instanceId: instance.id }
  }

  async getStatus(instanceId: string, config: ProviderConfig): Promise<WorkflowRunStatus> {
    const { accountId, apiToken } = extractCredentials(config)
    const workflowName = sanitizedWorkflowName(config.options?.['workflowName'] as string)

    const api = new CloudflareAPI({ accountId, apiToken })
    const status = await api.getInstanceStatus(workflowName, instanceId)

    return {
      instanceId: status.id,
      status: mapCFStatus(status.status),
      output: status.output,
      error: status.error,
    }
  }

  async destroy(
    deploymentId: string,
    config: ProviderConfig,
  ): Promise<{ success: boolean; error?: string }> {
    const { accountId, apiToken } = extractCredentials(config)
    return deleteWorker(deploymentId, { accountId, apiToken })
  }

  async startLocalDev(
    artifact: GeneratedArtifact,
    options: LocalDevOptions,
  ): Promise<LocalDevSession> {
    const compiled = await transpileToJS(artifact.source)
    return startLocalDev({ filename: 'worker.js', source: artifact.source, compiled }, options)
  }
}

function extractVarsAndSecrets(config: ProviderConfig): {
  vars?: Record<string, string>
  secrets?: Record<string, string>
} {
  if (!config.envVars) return {}
  const vars: Record<string, string> = {}
  const secrets: Record<string, string> = {}
  for (const [name, entry] of Object.entries(config.envVars)) {
    if (entry.value !== undefined) {
      if (entry.isSecret) {
        secrets[name] = entry.value
      } else {
        vars[name] = entry.value
      }
    }
  }
  return {
    vars: Object.keys(vars).length > 0 ? vars : undefined,
    secrets: Object.keys(secrets).length > 0 ? secrets : undefined,
  }
}

function extractCredentials(config: ProviderConfig): {
  accountId: string
  apiToken: string
} {
  const accountId = config.credentials['accountId']
  const apiToken = config.credentials['apiToken']
  if (!accountId || !apiToken) {
    throw new Error('accountId and apiToken are required in credentials')
  }
  return { accountId, apiToken }
}

export function mapCFStatus(cfStatus: string): WorkflowStatus {
  const statusMap: Record<string, WorkflowStatus> = {
    queued: 'queued',
    running: 'running',
    paused: 'paused',
    errored: 'errored',
    terminated: 'terminated',
    complete: 'complete',
    waiting: 'waiting',
    waitingForPause: 'running',
  }
  return statusMap[cfStatus] ?? 'unknown'
}
