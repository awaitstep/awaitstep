import { validateIR } from '@awaitstep/ir'
import type { WorkflowIR, ValidationError, Result } from '@awaitstep/ir'
import { transpileToJS } from '@awaitstep/codegen/transpile'
import { generateWorkflow } from './codegen/generate.js'
import type {
  WorkflowProvider,
  CredentialsCheckResult,
  GeneratedArtifact,
  DeployResult,
  ProviderConfig,
  WorkflowRunStatus,
  WorkflowStatus,
} from '@awaitstep/codegen'
import { deployWithWrangler, deleteWorker } from './deploy.js'
import { sanitizedWorkflowName } from './naming.js'
import { CloudflareAPI } from './api.js'

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

export class CloudflareWorkflowsAdapter implements WorkflowProvider {
  readonly name = 'cloudflare-workflows'

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

  generate(ir: WorkflowIR): GeneratedArtifact {
    const source = generateWorkflow(ir)
    return {
      filename: 'worker.ts',
      source,
    }
  }

  async deploy(artifact: GeneratedArtifact, config: ProviderConfig): Promise<DeployResult> {
    const { accountId, apiToken } = extractCredentials(config)
    const workflowId = config.options?.['workflowId'] as string | undefined
    const workflowName = config.options?.['workflowName'] as string | undefined

    if (!workflowId || !workflowName) {
      return {
        success: false,
        deploymentId: '',
        error: 'workflowId and workflowName are required in config.options',
      }
    }

    const compiled = await transpileToJS(artifact.source)
    const compiledArtifact: GeneratedArtifact = {
      filename: 'worker.js',
      source: artifact.source,
      compiled,
    }

    const result = await deployWithWrangler(compiledArtifact, {
      workflowId,
      workflowName,
      accountId,
      apiToken,
    })

    if (!result.success) {
      return {
        success: false,
        deploymentId: '',
        error: result.error ?? result.stderr ?? 'Deploy failed',
      }
    }

    return {
      success: true,
      deploymentId: result.workerName,
      url: result.workerUrl,
      dashboardUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/${result.workerName}`,
    }
  }

  async deployWithProgress(
    artifact: GeneratedArtifact,
    config: ProviderConfig,
    onProgress?: OnDeployProgress,
  ): Promise<DeployResult> {
    const report = (stage: DeployStage, message: string, progress: number) => {
      onProgress?.({ stage, message, progress })
    }

    report('INITIALIZING', 'Preparing deployment...', 5)

    const { accountId, apiToken } = extractCredentials(config)
    const workflowId = config.options?.['workflowId'] as string | undefined
    const workflowName = config.options?.['workflowName'] as string | undefined

    if (!workflowId || !workflowName) {
      report('FAILED', 'Missing workflowId or workflowName', 0)
      return { success: false, deploymentId: '', error: 'workflowId and workflowName are required' }
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
    report('BINDINGS_READY', 'Bindings configured', 45)

    report('CREATING_WORKER', 'Creating Cloudflare Worker...', 55)
    report('DEPLOYING', 'Deploying to Cloudflare...', 65)
    const result = await deployWithWrangler(compiledArtifact, {
      workflowId,
      workflowName,
      accountId,
      apiToken,
    })

    if (!result.success) {
      report('FAILED', result.error ?? 'Deploy failed', 0)
      return { success: false, deploymentId: '', error: result.error ?? result.stderr ?? 'Deploy failed' }
    }

    report('WORKER_DEPLOYED', 'Worker deployed', 80)
    report('UPDATING_WORKFLOW', 'Updating workflow configuration...', 90)
    report('COMPLETED', 'Deployment successful', 100)
    return { success: true, deploymentId: result.workerName, url: result.workerUrl, dashboardUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/${result.workerName}` }
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
      status: mapStatus(status.status),
      output: status.output,
      error: status.error,
    }
  }

  async destroy(deploymentId: string, config: ProviderConfig): Promise<{ success: boolean; error?: string }> {
    const { accountId, apiToken } = extractCredentials(config)
    return deleteWorker(deploymentId, { accountId, apiToken })
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

function mapStatus(cfStatus: string): WorkflowStatus {
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
