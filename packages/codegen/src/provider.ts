import type { ArtifactIR, ValidationError, Result } from '@awaitstep/ir'
import type {
  GeneratedArtifact,
  DeployResult,
  ProviderConfig,
  WorkflowRunStatus,
  LocalDevSession,
  LocalDevOptions,
  DeploymentConfigUiSchema,
  DeploymentConfigValidator,
  DeploymentConfigPreview,
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

  buildDeploymentConfigPreview(config: unknown): DeploymentConfigPreview

  /**
   * Validate either a workflow or a script IR. Implementers should dispatch
   * on `ir.kind` (treating absent `kind` as `'workflow'`).
   */
  validate(ir: ArtifactIR): Result<void, ValidationError[]>

  verifyCredentials(config: ProviderConfig): Promise<CredentialsCheckResult>

  /**
   * Generate the deploy artifact for either a workflow or a script. Implementers
   * should dispatch on `ir.kind`.
   */
  generate(ir: ArtifactIR, config?: ProviderConfig): GeneratedArtifact

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
