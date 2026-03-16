import type { WorkflowIR, ValidationError, Result } from '@awaitstep/ir'
import type { GeneratedArtifact, DeployResult, ProviderConfig, WorkflowRunStatus } from './types.js'

export interface CredentialsCheckResult {
  valid: boolean
  error?: string
}

export interface WorkflowProvider {
  readonly name: string

  validate(ir: WorkflowIR): Result<void, ValidationError[]>

  verifyCredentials(config: ProviderConfig): Promise<CredentialsCheckResult>

  generate(ir: WorkflowIR): GeneratedArtifact

  deploy(artifact: GeneratedArtifact, config: ProviderConfig): Promise<DeployResult>

  getStatus(instanceId: string, config: ProviderConfig): Promise<WorkflowRunStatus>

  trigger(
    deploymentId: string,
    params: unknown,
    config: ProviderConfig,
  ): Promise<{ instanceId: string }>
}
