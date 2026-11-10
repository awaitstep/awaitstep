import type { ProcessLogEntry } from './types.js'
import type { ArtifactIR, ProjectFile, ValidationError, Result } from '@awaitstep/ir'
import type { RequirementSupport, RuntimeRequirement } from './requirements.js'
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
 * What a provider says about a set of credentials. `unknown` = the provider
 * couldn't be asked (outage, timeout); callers keep what they knew before.
 */
export interface CredentialsInspection {
  status: 'active' | 'invalid' | 'unknown'
  /** When the credentials stop working (ISO); null when they don't expire or it isn't known. */
  expiresAt: string | null
  /** Accounts the credentials reach (only when asked to list them); empty when not listed. */
  accounts: { id: string; name: string }[]
  /** Whether they reach the account the credentials name; null when none is named or it isn't known. */
  accountReachable: boolean | null
}

export interface InspectOptions {
  /** List the accounts the credentials reach (a picker needs them). Default false. */
  listAccounts?: boolean
  /** Ask whether the named account is reachable. Default true. */
  checkAccount?: boolean
  /**
   * When the main check refused the credentials and a fallback couldn't be
   * answered, read them as invalid rather than unknown — for checks that
   * gate a person's guesses, so an unanswerable fallback can't stand in for
   * a refusal. Default false.
   */
  settleRefusals?: boolean
  /**
   * What kind of credential this is. An OAuth access token is not an API
   * token: it has no `/user/tokens/verify`, so its health is read off the
   * account it can reach. Default `api-token`.
   */
  authKind?: 'api-token' | 'oauth'
  /** The stored expiry of an OAuth access token, echoed back in the result. */
  expiresAt?: string | null
  /** True when that expiry is already in the past; a refusal then may be a stale token, not a dead grant. */
  expired?: boolean
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

export type ProviderHandlerKind = 'fetch' | 'scheduled' | 'queue'

/**
 * What a provider can do, for shared UI that must not hardcode a provider's
 * nouns. A provider without `capabilities` is treated as fetch-only.
 */
export interface ProviderCapabilities {
  id: string
  label: string
  handlerKinds: readonly ProviderHandlerKind[]
  /** Regex source for a queue name; absent = the provider has no queues. */
  queueNamePattern?: string
  /** Import schemes the provider owns (`cloudflare:`), used by analysis. */
  importSchemes: readonly string[]
  bindingKinds: readonly string[]
  bindingKindLabels: Readonly<Record<string, string>>
  /** Deployment-config field that holds cron expressions, if schedules exist. */
  scheduleConfigKey?: string
  /** How a deployment is reached; `{deploymentId}` is substituted. */
  runUrlTemplate?: string
}

export interface WorkflowProvider {
  readonly name: string
  /** Optional capability descriptor; shared UI reads it instead of provider names. */
  readonly capabilities?: ProviderCapabilities

  /**
   * Binding kinds this provider can supply (KV, D1, R2, …). A workflow that
   * declares one the target does not list is refused before generation.
   */
  readonly supportedBindingKinds?: readonly string[]

  /**
   * Requirements this provider detects beyond the shared analyzer: inferred
   * bindings, derived service/workflow bindings. Unioned with
   * `collectRuntimeRequirements`.
   */
  requirements?(ir: ArtifactIR): RuntimeRequirement[]

  /**
   * Whether this provider can satisfy one requirement. Default: a
   * provider-scoped primitive must name this provider, and a binding kind
   * must appear in {@link supportedBindingKinds}.
   */
  supportsRequirement?(requirement: RuntimeRequirement): RequirementSupport

  readonly deploymentConfigSchema: DeploymentConfigValidator

  readonly deploymentConfigUiSchema?: DeploymentConfigUiSchema

  getDefaultDeploymentConfig(): unknown

  buildDeploymentConfigPreview(config: unknown): DeploymentConfigPreview

  /**
   * Validate either a workflow or a script IR. Implementers should dispatch
   * on `ir.kind` (treating absent `kind` as `'workflow'`).
   */
  validate(ir: ArtifactIR): Result<void, ValidationError[]>

  /** The deployed resource name for a workflow id, when the provider names it. */
  deploymentName?(workflowId: string): string

  /** Env names the provider uses internally and must not pass to user code. */
  isInternalEnvVar?(name: string): boolean

  /** Refuse a credential shape before a network check; absent = no local rule. */
  validateCredentials?(credentials: Record<string, string>): { field: string; error: string } | null

  verifyCredentials(config: ProviderConfig): Promise<CredentialsCheckResult>

  /**
   * Status, expiry and reachable accounts of raw credentials, before any
   * connection exists. Absent = the provider has no way to tell.
   */
  inspectCredentials?(
    credentials: Record<string, string>,
    options?: InspectOptions,
  ): Promise<CredentialsInspection>

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

  /**
   * Pause, resume or terminate one run instance. Absent = the provider has no
   * run control beyond status. The route must not reach a provider SDK
   * directly for these.
   */
  controlRun?(
    action: 'pause' | 'resume' | 'terminate',
    input: { workflowName: string; instanceId: string; config: ProviderConfig },
  ): Promise<void>

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
  stopLocalDev(): Promise<void>
  triggerLocalDev(body: unknown): Promise<{ status: number; data: unknown }>
  localDevInstance(instanceId: string): Promise<{ status: number; data: unknown }>
  readLocalDevLogs(since?: number): Promise<ProcessLogEntry[]>
}

export function supportsLocalDev(
  provider: WorkflowProvider,
): provider is WorkflowProvider & LocalDevProvider {
  return (
    'startLocalDev' in provider &&
    typeof (provider as unknown as LocalDevProvider).startLocalDev === 'function'
  )
}
