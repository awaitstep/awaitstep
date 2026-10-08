import type { ArtifactIR, ValidationError, Result } from '@awaitstep/ir'
import type { StepManifest } from './manifest.js'
import type {
  GeneratedBundle,
  DeployResult,
  ProviderConfig,
  WorkflowRunStatus,
  WorkflowRunDetail,
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
  generate(ir: ArtifactIR, config?: ProviderConfig): GeneratedBundle

  /**
   * Drift validation for user-edited sources (ejected/sdk modes): checks the
   * bundle is still consistent with the IR and its step manifest — node
   * regions present, step names intact. Consistency, not equality — edits
   * inside regions are the point. Absent = provider has no eject support.
   */
  validateSource?(
    ir: ArtifactIR,
    bundle: GeneratedBundle,
    manifest: StepManifest,
  ): ValidationError[]

  deploy(bundle: GeneratedBundle, config: ProviderConfig): Promise<DeployResult>

  getStatus(instanceId: string, config: ProviderConfig): Promise<WorkflowRunStatus>

  /**
   * Instance status plus per-step telemetry (labels, attempts, timing).
   * Step labels join back to nodes through the deploy's StepManifest.
   * Absent = provider reports run status only.
   */
  getRunDetail?(instanceId: string, config: ProviderConfig): Promise<WorkflowRunDetail>

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
  startLocalDev(bundle: GeneratedBundle, options: LocalDevOptions): Promise<LocalDevSession>
}

export function supportsLocalDev(
  provider: WorkflowProvider,
): provider is WorkflowProvider & LocalDevProvider {
  return (
    'startLocalDev' in provider &&
    typeof (provider as LocalDevProvider).startLocalDev === 'function'
  )
}
