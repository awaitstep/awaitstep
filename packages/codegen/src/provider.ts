import type { ArtifactIR, ProjectFile, ValidationError, Result } from '@awaitstep/ir'
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

/**
 * The outcome of splitting a provider's annotated entry-handler source into
 * handler modules: the modules, plus whatever the annotations declared that
 * modules cannot carry (schedules, per-queue settings — provider-shaped)
 * and now belongs in the deployment config.
 */
export interface HandlerConversionResult {
  files: ProjectFile[]
  declarations: Record<string, unknown>
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
   * Splits an annotated entry-handler source (the legacy trigger-code model)
   * into handler modules. Throws when the source does not parse. Absent =
   * the provider never had an annotation model.
   */
  convertHandlers?(source: string, target: 'workflow' | 'script'): HandlerConversionResult

  /**
   * Folds a conversion's declarations into a stored deployment config;
   * returns the same object when nothing changes.
   */
  applyHandlerDeclarations?(
    config: Record<string, unknown>,
    declarations: Record<string, unknown>,
  ): Record<string, unknown>

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
