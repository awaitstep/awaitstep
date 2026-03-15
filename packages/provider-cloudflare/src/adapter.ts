import { validateIR } from '@awaitstep/ir'
import type { WorkflowIR, ValidationError, Result } from '@awaitstep/ir'
import { generateWorkflow, transpileToJS } from '@awaitstep/codegen'
import type {
  WorkflowProvider,
  GeneratedArtifact,
  DeployResult,
  ProviderConfig,
  WorkflowRunStatus,
  WorkflowStatus,
} from '@awaitstep/codegen'
import { deployWithWrangler } from './deploy.js'
import { CloudflareAPI } from './api.js'

export class CloudflareWorkflowsAdapter implements WorkflowProvider {
  readonly name = 'cloudflare-workflows'

  validate(ir: WorkflowIR): Result<void, ValidationError[]> {
    const result = validateIR(ir)
    if (!result.ok) return result
    return { ok: true, value: undefined }
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
    }
  }

  async trigger(
    deploymentId: string,
    params: unknown,
    config: ProviderConfig,
  ): Promise<{ instanceId: string }> {
    const { accountId, apiToken } = extractCredentials(config)
    const workflowName = config.options?.['workflowName'] as string

    const api = new CloudflareAPI({ accountId, apiToken })
    const instance = await api.createInstance(workflowName, params)
    return { instanceId: instance.id }
  }

  async getStatus(instanceId: string, config: ProviderConfig): Promise<WorkflowRunStatus> {
    const { accountId, apiToken } = extractCredentials(config)
    const workflowName = config.options?.['workflowName'] as string

    const api = new CloudflareAPI({ accountId, apiToken })
    const status = await api.getInstanceStatus(workflowName, instanceId)

    return {
      instanceId: status.id,
      status: mapStatus(status.status),
      output: status.output,
      error: status.error,
    }
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
