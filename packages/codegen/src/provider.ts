import type { WorkflowIR, ValidationError, Result } from '@awaitstep/ir'
import type {
  GeneratedArtifact,
  DeployResult,
  ProviderConfig,
  WorkflowRunStatus,
  LocalDevSession,
  LocalDevOptions,
  DeploymentConfigUiSchema,
  DeploymentConfigValidator,
} from './types.js'

export interface CredentialsCheckResult {
  valid: boolean
  error?: string
}

export interface WorkflowProvider {
  readonly name: string

  readonly deploymentConfigSchema: DeploymentConfigValidator

  readonly deploymentConfigUiSchema?: DeploymentConfigUiSchema

  getDefaultDeploymentConfig(): unknown

  validate(ir: WorkflowIR): Result<void, ValidationError[]>

  verifyCredentials(config: ProviderConfig): Promise<CredentialsCheckResult>

  generate(ir: WorkflowIR, config?: ProviderConfig): GeneratedArtifact

  deploy(artifact: GeneratedArtifact, config: ProviderConfig): Promise<DeployResult>

  getStatus(instanceId: string, config: ProviderConfig): Promise<WorkflowRunStatus>

  trigger(
    deploymentId: string,
    params: unknown,
    config: ProviderConfig,
  ): Promise<{ instanceId: string }>

  destroy(
    deploymentId: string,
    config: ProviderConfig,
  ): Promise<{ success: boolean; error?: string }>
}

export interface LocalDevProvider {
  startLocalDev(artifact: GeneratedArtifact, options: LocalDevOptions): Promise<LocalDevSession>
}

export function supportsLocalDev(
  provider: WorkflowProvider,
): provider is WorkflowProvider & LocalDevProvider {
  return (
    'startLocalDev' in provider &&
    typeof (provider as LocalDevProvider).startLocalDev === 'function'
  )
}
