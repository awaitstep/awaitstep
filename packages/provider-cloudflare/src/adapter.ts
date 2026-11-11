import {
  hasHandlerModules,
  isProjectCodePath,
  projectHandlerModules,
  validateArtifact,
} from '@awaitstep/ir'
import type {
  ArtifactIR,
  ProjectHandlerModules,
  ScriptIR,
  WorkflowIR,
  ValidationError,
  Result,
} from '@awaitstep/ir'
import {
  handlerModulesFromTriggerCode,
  scheduleProblem,
  withConversionSettings,
  type HandlerConversion,
} from './codegen/handler-modules.js'
import type {
  FunctionCallRequest,
  FunctionCallResult,
  HandlerConversionResult,
} from '@awaitstep/codegen'
import { CALLABLE_URL_PATTERN, callFunction } from './call-function.js'
import { compileBundle } from './compile-bundle.js'
import { generateScriptBundle, generateWorkflowBundle } from './codegen/generate.js'
import {
  bundleEntry,
  describeProvider,
  importSpecifiers,
  providerFromSpecifier,
  RunGoneError,
  withoutComments,
} from '@awaitstep/codegen'
import type {
  WorkflowProvider,
  LocalDevProvider,
  CredentialsCheckResult,
  CredentialsInspection,
  InspectOptions,
  GeneratedBundle,
  DeployResult,
  ProviderConfig,
  WorkflowRunStatus,
  WorkflowRunDetail,
  LocalDevSession,
  LocalDevOptions,
  ProcessLogEntry,
  TemplateResolver,
  RuntimeRequirement,
} from '@awaitstep/codegen'
import { splitEnvVars } from './env.js'
import type { WranglerDeployer } from './deploy/deployer.js'
import {
  LOCAL_DEV_PORT,
  isPortListening,
  readLogs,
  startLocalDev,
  stopLocalDev,
} from './local-dev.js'
import { workerName, sanitizedWorkflowName } from './naming.js'
import { mapCFStatus } from './status-map.js'
import { toRunDetail } from './run-detail.js'
import { CloudflareAPI } from './api.js'
import { goneFrom } from './api-error.js'
import { checkCloudflareToken } from './token-check.js'
import { WRANGLER_BASE_CONFIG } from './wrangler-config.js'
import {
  detectBindings,
  validateBindingDeclarations,
  validateSubScriptBindings,
  validateSubWorkflowBindings,
  type BindingRequirement,
} from './codegen/bindings.js'
import { getSubWorkflowBindings } from './codegen/generators/sub-workflow.js'
import { getSubScriptBindings } from './codegen/generators/sub-script.js'
import { parseAnnotations } from './codegen/parse-annotations.js'
import { cloudflareWranglerOverrides, extractCloudflareSource } from './codegen/provider-profile.js'
import { resolveRetention } from './codegen/retention.js'
import {
  cloudflareDefaultDeploymentConfig,
  cloudflareDeploymentConfigSchema,
  cloudflareDeploymentConfigUiSchema,
  type CloudflareDeploymentConfig,
} from './config-schema.js'

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

/** The resource kinds a Cloudflare Worker can be given. */
const CLOUDFLARE_BINDING_KINDS = [
  'kv',
  'd1',
  'r2',
  'queue',
  'service',
  'workflow',
  'ai',
  'vectorize',
  'analytics_engine',
  'hyperdrive',
  'browser',
] as const

const BINDING_KIND_LABELS: Record<string, string> = {
  kv: 'KV namespace',
  d1: 'D1 database',
  r2: 'R2 bucket',
  queue: 'queue',
  service: 'service binding',
  workflow: 'workflow binding',
  ai: 'Workers AI binding',
  vectorize: 'Vectorize index',
  analytics_engine: 'Analytics Engine dataset',
  hyperdrive: 'Hyperdrive config',
  browser: 'Browser Rendering binding',
}

interface ProfileSource {
  source: string
  nodeId?: string
  path?: string
}

/** The IR sources a provider profile or accessor use can live in. */
function cloudflareProfileSources(ir: ArtifactIR): ProfileSource[] {
  const sources: ProfileSource[] = []
  for (const node of ir.nodes) {
    if (typeof node.data.code === 'string') {
      sources.push({ source: node.data.code, nodeId: node.id })
    }
  }
  if (ir.runtime?.triggerCode) sources.push({ source: ir.runtime.triggerCode })
  for (const file of ir.runtime?.files ?? []) {
    if (isProjectCodePath(file.path)) sources.push({ source: file.source, path: file.path })
  }
  return sources
}

/** Bindings declared in a profile or discovered through `kv(env, 'NAME')`. */
function cloudflareProfileRequirements(ir: ArtifactIR): RuntimeRequirement[] {
  const requirements: RuntimeRequirement[] = []
  const seen = new Set<string>()
  for (const source of cloudflareProfileSources(ir)) {
    const extracted = extractCloudflareSource(source.source)
    const bindings = [...(extracted.profile?.bindings ?? []), ...extracted.usage]
    for (const binding of bindings) {
      const key = `${binding.kind}:${binding.name}`
      if (seen.has(key)) continue
      seen.add(key)
      requirements.push({
        kind: 'binding',
        id: binding.kind,
        name: binding.name,
        label: `${BINDING_KIND_LABELS[binding.kind] ?? binding.kind} "${binding.name}"`,
        ...(source.nodeId && { nodeId: source.nodeId }),
        ...(source.path && { path: source.path }),
      })
    }
  }
  return requirements
}

/** Profile/accessor parse errors, attributed to the source that carried them. */
function cloudflareProfileErrors(ir: ArtifactIR): ValidationError[] {
  const errors: ValidationError[] = []
  for (const source of cloudflareProfileSources(ir)) {
    const extracted = extractCloudflareSource(source.source)
    for (const diagnostic of extracted.diagnostics) {
      errors.push({
        path: source.path
          ? `runtime.files.${source.path}`
          : source.nodeId
            ? `nodes.${source.nodeId}.data.code`
            : 'runtime.triggerCode',
        message: diagnostic.message,
        ...(source.nodeId && { nodeId: source.nodeId }),
      })
    }
  }
  return errors
}

const LOCAL_UNSUPPORTED: ReadonlySet<string> = new Set([
  'ai',
  'vectorize',
  'analytics_engine',
  'hyperdrive',
  'browser',
  'service',
  'workflow',
])

/** Bindings wrangler dev cannot provide; the session still starts, with warnings. */
export function localDevWarnings(ir: ArtifactIR | undefined): string[] {
  if (!ir) return []
  const warnings: string[] = []
  const seen = new Set<string>()
  const add = (name: string, type: string) => {
    if (seen.has(name) || !LOCAL_UNSUPPORTED.has(type)) return
    seen.add(name)
    warnings.push(
      `${BINDING_KIND_LABELS[type] ?? type} "${name}" is not emulated by local test — calls to it may fail.`,
    )
  }
  for (const binding of detectBindings(ir as unknown as WorkflowIR)) add(binding.name, binding.type)
  for (const binding of getSubWorkflowBindings(ir.nodes)) add(binding.binding, 'workflow')
  for (const binding of getSubScriptBindings(ir.nodes)) add(binding.binding, 'service')
  return warnings
}

function cloudflareBindingConflicts(ir: ArtifactIR): ValidationError[] {
  const declared = new Map(
    (ir.runtime?.resources ?? []).map((resource) => [resource.name, resource.kind]),
  )
  const errors: ValidationError[] = []
  const seen = new Map<string, string>(declared)
  for (const source of cloudflareProfileSources(ir)) {
    const extracted = extractCloudflareSource(source.source)
    for (const binding of [...(extracted.profile?.bindings ?? []), ...extracted.usage]) {
      const kind = seen.get(binding.name)
      if (kind && kind !== binding.kind) {
        errors.push({
          path: `runtime.resources.${binding.name}`,
          message: `Binding "${binding.name}" is declared as ${kind} but the provider profile uses ${binding.kind}`,
        })
      } else {
        seen.set(binding.name, binding.kind)
      }
    }
  }
  return errors
}

/** A refusal that says the Workflow or instance is gone, as `RunGoneError`; anything else as is. */
function goneOr(err: unknown): unknown {
  const what = goneFrom(err)
  return what ? new RunGoneError(what) : err
}

export class CloudflareWorkflowsAdapter implements WorkflowProvider, LocalDevProvider {
  readonly name = 'cloudflare'
  readonly capabilities = {
    id: 'cloudflare',
    label: 'Cloudflare',
    handlerKinds: ['fetch', 'scheduled', 'queue'] as const,
    queueNamePattern: '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$',
    importSchemes: ['cloudflare', 'workerd'] as const,
    bindingKinds: CLOUDFLARE_BINDING_KINDS,
    bindingKindLabels: BINDING_KIND_LABELS,
    scheduleConfigKey: 'cronTriggers',
    runUrlTemplate: 'https://{deploymentId}.workers.dev',
    callableUrlPattern: CALLABLE_URL_PATTERN,
  }
  readonly supportedBindingKinds = CLOUDFLARE_BINDING_KINDS
  readonly importSchemes = ['cloudflare', 'workerd'] as const
  readonly deploymentConfigSchema = cloudflareDeploymentConfigSchema
  readonly deploymentConfigUiSchema = cloudflareDeploymentConfigUiSchema
  private templateResolver?: TemplateResolver
  private deployer?: WranglerDeployer

  constructor(options?: { templateResolver?: TemplateResolver; deployer?: WranglerDeployer }) {
    this.templateResolver = options?.templateResolver
    this.deployer = options?.deployer
  }

  getDefaultDeploymentConfig(): CloudflareDeploymentConfig {
    return { ...cloudflareDefaultDeploymentConfig }
  }

  /**
   * Bindings the workflow needs beyond the shared analyzer: declared and
   * inferred resource bindings, plus the workflow/service bindings a
   * sub-workflow or sub-script node creates.
   */
  requirements(ir: ArtifactIR): RuntimeRequirement[] {
    const requirements: RuntimeRequirement[] = []
    for (const binding of detectBindings(ir as unknown as WorkflowIR)) {
      requirements.push({
        kind: 'binding',
        id: binding.type,
        name: binding.name,
        label: `${BINDING_KIND_LABELS[binding.type] ?? binding.type} "${binding.name}"`,
      })
    }
    requirements.push(...cloudflareProfileRequirements(ir))
    for (const binding of getSubWorkflowBindings(ir.nodes)) {
      requirements.push({
        kind: 'binding',
        id: 'workflow',
        name: binding.binding,
        label: `workflow binding "${binding.binding}"`,
      })
    }
    for (const binding of getSubScriptBindings(ir.nodes)) {
      requirements.push({
        kind: 'binding',
        id: 'service',
        name: binding.binding,
        label: `service binding "${binding.binding}"`,
      })
    }
    // Custom-node templates are registry code, not IR: the shared analyzer
    // cannot see their imports. A template importing `cloudflare:*` or a
    // provider primitive is just as Cloudflare-only as node code.
    const seenProviders = new Set<string>()
    for (const node of ir.nodes) {
      const template = this.templateResolver?.getTemplate(node.type, node.provider)
      if (!template) continue
      for (const specifier of importSpecifiers(withoutComments(template))) {
        const provider = providerFromSpecifier(specifier)
        if (!provider || seenProviders.has(provider)) continue
        seenProviders.add(provider)
        requirements.push({
          kind: 'provider',
          id: provider,
          import: specifier,
          label: `${describeProvider(provider)}-only primitives (${specifier})`,
          nodeId: node.id,
        })
      }
    }
    return requirements
  }

  buildDeploymentConfigPreview(config: unknown) {
    // Parse through schema so preprocess normalizes booleans → objects
    const parsed = cloudflareDeploymentConfigSchema.safeParse(config)
    const c = (parsed.success ? parsed.data : config) as CloudflareDeploymentConfig
    const preview: Record<string, unknown> = {
      compatibility_date: c.compatibilityDate ?? WRANGLER_BASE_CONFIG.compatibility_date,
      compatibility_flags: c.compatibilityFlags ?? WRANGLER_BASE_CONFIG.compatibility_flags,
    }

    if (c.workersDev !== undefined) preview.workers_dev = c.workersDev
    if (c.previewUrls !== undefined) preview.preview_urls = c.previewUrls

    const routes: Array<Record<string, unknown>> = []
    if (c.routes) {
      for (const r of c.routes) routes.push({ pattern: r.pattern, zone_name: r.zoneName })
    }
    if (c.customDomains) {
      for (const d of c.customDomains) routes.push({ pattern: d, custom_domain: true })
    }
    if (routes.length > 0) preview.routes = routes

    if (c.cronTriggers && c.cronTriggers.length > 0) {
      preview.triggers = { crons: c.cronTriggers }
    }
    if (c.placement && c.placement.mode !== 'off') {
      preview.placement = { mode: c.placement.mode }
    }
    if (c.limits?.cpuMs) {
      preview.limits = { cpu_ms: c.limits.cpuMs }
    }
    // Always show the full observability config in the preview — merge
    // WRANGLER_BASE_CONFIG as the base so the Review step reflects what
    // actually gets deployed, with any Configure-step overrides on top.
    preview.observability = c.observability
      ? { ...WRANGLER_BASE_CONFIG.observability, ...c.observability }
      : { ...WRANGLER_BASE_CONFIG.observability }
    if (c.logpush) {
      preview.logpush = true
    }

    return { filename: 'wrangler.json', content: preview }
  }

  validate(ir: ArtifactIR): Result<void, ValidationError[]> {
    // Every source contributes: returning at the first one hid the provider's
    // own findings whenever the IR also had a structural problem, so a user
    // fixing one error immediately met the next.
    const result = validateArtifact(ir)
    const errors: ValidationError[] = result.ok ? [] : [...result.errors]
    errors.push(...validateBindingDeclarations(ir as unknown as WorkflowIR))
    errors.push(...validateSubScriptBindings(ir))
    errors.push(...validateSubWorkflowBindings(ir))
    errors.push(...cloudflareProfileErrors(ir))
    errors.push(...cloudflareBindingConflicts(ir))
    return errors.length > 0 ? { ok: false, errors } : { ok: true, value: undefined }
  }

  isInternalEnvVar(name: string): boolean {
    return name.endsWith('_BINDING_ID')
  }

  deploymentName(workflowId: string): string {
    return workerName(workflowId)
  }

  validateCredentials(credentials: Record<string, string>) {
    if (/^[a-f0-9]{32}$/i.test(credentials.accountId ?? '')) return null
    return {
      field: 'accountId',
      error: 'An account ID is 32 letters and digits (0–9, a–f)',
    }
  }

  async verifyCredentials(config: ProviderConfig): Promise<CredentialsCheckResult> {
    const { accountId, apiToken } = extractCredentials(config)
    // An OAuth access token is not an API token; `/user/tokens/verify` refuses
    // it. Its health is the account it can still reach.
    if (config.credentials['authKind'] === 'oauth') {
      const inspection = await checkCloudflareToken(apiToken, accountId, {
        authKind: 'oauth',
        expiresAt: config.credentials['expiresAt'] ?? null,
      })
      if (inspection.status === 'active') return { valid: true }
      return {
        valid: false,
        error:
          inspection.status === 'invalid'
            ? 'The OAuth connection is no longer authorized'
            : 'Failed to reach Cloudflare to check the OAuth connection',
      }
    }
    const api = new CloudflareAPI({ accountId, apiToken })
    try {
      const verified = await api.verifyToken()
      if (!verified) return { valid: false, error: 'API token is invalid or expired' }
      return { valid: true }
    } catch {
      return { valid: false, error: 'Failed to verify API token with Cloudflare' }
    }
  }

  inspectCredentials(
    credentials: Record<string, string>,
    options?: InspectOptions,
  ): Promise<CredentialsInspection> {
    return checkCloudflareToken(credentials.apiToken ?? '', credentials.accountId, {
      ...options,
      authKind: credentials.authKind === 'oauth' ? 'oauth' : 'api-token',
      // An OAuth connection has no expiring credential on its row: it renews.
      expiresAt: credentials.authKind === 'oauth' ? null : (credentials.expiresAt ?? null),
      expired:
        credentials.authKind === 'oauth' &&
        Boolean(credentials.expiresAt) &&
        Date.parse(credentials.expiresAt!) <= Date.now(),
    })
  }

  convertHandlers(source: string, target: 'workflow' | 'script'): HandlerConversionResult {
    const { files, crons, queueConfigs, queueNames } = handlerModulesFromTriggerCode(source, target)
    return { files, declarations: { crons, queueConfigs, queueNames } }
  }

  applyHandlerDeclarations(
    config: Record<string, unknown>,
    declarations: Record<string, unknown>,
  ): Record<string, unknown> {
    const {
      crons = [],
      queueConfigs = [],
      queueNames = [],
    } = declarations as Partial<Pick<HandlerConversion, 'crons' | 'queueConfigs' | 'queueNames'>>
    return withConversionSettings(config as Partial<CloudflareDeploymentConfig>, {
      crons,
      queueConfigs,
      queueNames,
    }) as Record<string, unknown>
  }

  generate(ir: ArtifactIR, config?: ProviderConfig): GeneratedBundle {
    const envVarNames = config?.envVars ? Object.keys(config.envVars) : undefined
    const triggerCode = config?.options?.['triggerCode'] as string | undefined
    const retention = (
      config?.options?.['deploymentConfig'] as CloudflareDeploymentConfig | undefined
    )?.retention
    if (ir.kind === 'script') {
      // A function deploys as a bundle too: the fetch entry, one module per
      // step (run by the in-request host), the runtime, the project files.
      return generateScriptBundle(ir as ScriptIR, {
        templateResolver: this.templateResolver,
        envVarNames,
        triggerCode,
        retention,
      })
    }
    // Workflows deploy as multi-file bundles: step code lives in per-node
    // modules with explicit params — no regex rewriting of user code.
    return generateWorkflowBundle(ir as WorkflowIR, {
      templateResolver: this.templateResolver,
      envVarNames,
      triggerCode,
      retention,
    })
  }

  async deploy(bundle: GeneratedBundle, config: ProviderConfig): Promise<DeployResult> {
    return this._doDeploy(bundle, config)
  }

  async deployWithProgress(
    bundle: GeneratedBundle,
    config: ProviderConfig,
    onProgress?: OnDeployProgress,
  ): Promise<DeployResult> {
    return this._doDeploy(bundle, config, onProgress)
  }

  private async _doDeploy(
    bundle: GeneratedBundle,
    config: ProviderConfig,
    onProgress?: OnDeployProgress,
  ): Promise<DeployResult> {
    const report = (stage: DeployStage, message: string, progress: number) => {
      onProgress?.({ stage, message, progress })
    }

    report('INITIALIZING', 'Preparing deployment', 5)

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

    report('GENERATING_CODE', 'Compiling TypeScript to JavaScript', 15)
    let compiledBundle: GeneratedBundle
    try {
      compiledBundle = await compileBundle(bundle)
    } catch (err) {
      // transpileFile already names the file in its message.
      const message = err instanceof Error ? err.message : `Compile error: ${String(err)}`
      report('FAILED', message, 0)
      return {
        success: false,
        deploymentId: '',
        error: message,
      }
    }

    // Extract the actual class name from the generated source so the wrangler
    // config matches exactly, even if ir.metadata.name differs from workflow.name.
    // Scripts have no `WorkflowEntrypoint` class — generatedClassName stays
    // undefined and the wrangler-config code path skips the primary workflow
    // entry when kind === 'script'.
    let generatedClassName: string | undefined
    try {
      const classNameMatch = bundleEntry(bundle).source.match(
        /export\s+class\s+(\w+)\s+extends\s+WorkflowEntrypoint/,
      )
      generatedClassName = classNameMatch?.[1]
    } catch (err) {
      // A bundle without its entry is a generator bug — honor the
      // deploy()-returns-DeployResult contract instead of throwing.
      const message = err instanceof Error ? err.message : String(err)
      report('FAILED', message, 0)
      return { success: false, deploymentId: '', error: message }
    }

    report('CODE_READY', 'Code compiled successfully', 25)

    report('DETECTING_BINDINGS', 'Analyzing resource bindings', 35)

    // Auto-detect resource bindings from IR and resolve IDs from env vars
    const ir = config.options?.['ir'] as ArtifactIR | undefined
    const kind: 'workflow' | 'script' = ir?.kind === 'script' ? 'script' : 'workflow'
    let resolvedBindings: BindingRequirement[] | undefined
    if (ir) {
      const detected = detectBindings(ir as unknown as WorkflowIR)
      const mappings =
        (config.options?.['deploymentConfig'] as CloudflareDeploymentConfig | undefined)
          ?.bindings ?? {}
      if (detected.length > 0) {
        const needsId = detected.filter(
          (b) => b.type === 'kv' || b.type === 'd1' || b.type === 'hyperdrive',
        )
        const missing: string[] = []
        const typeLabels: Record<string, string> = {
          kv: 'KV namespace',
          d1: 'D1 database',
          hyperdrive: 'Hyperdrive config',
        }
        for (const b of detected) {
          const mapping = mappings[b.name]
          if (!mapping) continue
          if (mapping.kind && mapping.kind !== b.type) {
            missing.push(
              `Binding '${b.name}' is mapped as ${mapping.kind}, but the workflow declares ${b.type}`,
            )
            continue
          }
          const mapped = mapping.resourceId ?? mapping.resourceName
          if (mapped) b.resourceId = mapped
        }
        for (const b of needsId) {
          if (b.resourceId) continue
          if (b.source === 'declaration') {
            // A declared binding with no id still needs a connection mapping.
            // The <NAME>_BINDING_ID convention remains the legacy fallback.
            const envKey = `${b.name}_BINDING_ID`
            const id = config.envVars?.[envKey]?.value
            if (id) {
              b.resourceId = id
              continue
            }
            missing.push(
              `Binding '${b.name}' is not mapped for this deployment connection — map the ${typeLabels[b.type] ?? b.type} in Bindings`,
            )
            continue
          }
          const envKey = `${b.name}_BINDING_ID`
          const id = config.envVars?.[envKey]?.value
          if (id) {
            b.resourceId = id
          } else {
            missing.push(
              `Binding '${b.name}' is not mapped for this deployment connection — map the ${typeLabels[b.type] ?? b.type} in Bindings or set '${envKey}'`,
            )
          }
        }

        // Optionally resolve vectorize index names from env vars (legacy path;
        // a connection mapping or declaration already carries resourceId).
        for (const b of detected.filter(
          (b) => b.type === 'vectorize' && b.source !== 'declaration',
        )) {
          const envKey = `${b.name}_BINDING_ID`
          const id = config.envVars?.[envKey]?.value
          if (id && !b.resourceId) b.resourceId = id
        }
        if (missing.length > 0) {
          const errorMsg = missing.join('; ')
          report('FAILED', errorMsg, 0)
          return { success: false, deploymentId: '', error: errorMsg }
        }
        resolvedBindings = detected
      }
    }

    // Collect sub-workflow bindings from IR
    const subWorkflowBindings = ir ? getSubWorkflowBindings(ir.nodes) : []
    const subScriptBindings = ir ? getSubScriptBindings(ir.nodes) : []

    report('BINDINGS_READY', 'Resource bindings configured', 45)

    report('CREATING_WORKER', 'Preparing Cloudflare Worker', 55)
    report('DEPLOYING', 'Deploying to Cloudflare', 65)
    const { vars: varsMap, secrets: secretsMap } = config.envVars
      ? splitEnvVars(config.envVars)
      : { vars: {}, secrets: {} }
    const vars = Object.keys(varsMap).length > 0 ? varsMap : undefined
    const secrets = Object.keys(secretsMap).length > 0 ? secretsMap : undefined

    // Read typed deployment config (new path) with legacy fallback
    const deploymentConfig = config.options?.['deploymentConfig'] as
      CloudflareDeploymentConfig | undefined
    const legacyDeployConfig = config.options?.['deployConfig'] as
      { route?: { pattern: string; zoneName: string } } | undefined

    // Build wrangler routes from deployment config or legacy format
    const configRoutes = deploymentConfig?.routes
    const legacyRoute = legacyDeployConfig?.route
    const routeEntries = configRoutes
      ? configRoutes.map((r) => ({ pattern: r.pattern, zoneName: r.zoneName }))
      : legacyRoute
        ? [{ pattern: legacyRoute.pattern, zoneName: legacyRoute.zoneName }]
        : undefined

    const routes = routeEntries
      ? routeEntries.flatMap((r) => {
          const base = { pattern: r.pattern, zone_name: r.zoneName }
          const variants = [base]
          if (r.pattern.endsWith('/*')) {
            variants.push({ pattern: r.pattern.replace('/*', '*'), zone_name: r.zoneName })
          } else if (!r.pattern.endsWith('*')) {
            variants.push({ pattern: r.pattern.concat('*'), zone_name: r.zoneName })
          }
          return variants
        })
      : undefined

    const previewUrls =
      deploymentConfig?.previewUrls ?? (config.options?.['previewUrls'] as boolean | undefined)
    const workersDev =
      deploymentConfig?.workersDev ?? (config.options?.['workersDev'] as boolean | undefined)

    // Queue consumers and cron triggers: from the project's handler modules
    // when it has any (a `handlers/queue/<name>.ts` file is the consumer, the
    // schedules are declared on the workflow / deployment config), otherwise
    // from the `@queue` / `@scheduled` annotations in the trigger code.
    // Per-queue settings come from `deploymentConfig.queueConsumers` if
    // present; otherwise CF defaults apply.
    const triggerCodeForAnnotations = config.options?.['triggerCode'] as string | undefined
    const modules = projectHandlerModules(bundle.files)
    const queueConsumers = buildQueueConsumers(triggerCodeForAnnotations, deploymentConfig, modules)
    const cronTriggers = buildCronTriggers(triggerCodeForAnnotations, deploymentConfig, modules)
    if (hasHandlerModules(modules)) {
      const problem = scheduleProblem({
        hasScheduledModule: modules.scheduled !== undefined,
        crons: cronTriggers ?? [],
      })
      if (problem) {
        report('FAILED', problem, 0)
        return { success: false, deploymentId: '', error: problem }
      }
    }

    if (!this.deployer) {
      report('FAILED', 'No deployer configured — deploy is not available on this runtime', 0)
      return { success: false, deploymentId: '', error: 'No deployer configured' }
    }

    const deployerProgress = onProgress
      ? (_stage: string, message: string) => {
          report('DEPLOYING', message, 65)
        }
      : undefined

    const result = await this.deployer.deploy(
      compiledBundle,
      {
        kind,
        workflowId: opts.workflowId,
        workflowName: opts.workflowName,
        className: generatedClassName,
        accountId,
        apiToken,
        packageName: config.options?.['packageName'] as string | undefined,
        vars,
        secrets,
        dependencies: opts.dependencies,
        bindings: resolvedBindings,
        subWorkflowBindings: subWorkflowBindings.length > 0 ? subWorkflowBindings : undefined,
        subScriptBindings: subScriptBindings.length > 0 ? subScriptBindings : undefined,
        previewUrls,
        workersDev,
        routes,
        customDomains: deploymentConfig?.customDomains,
        compatibilityDate: deploymentConfig?.compatibilityDate,
        compatibilityFlags: deploymentConfig?.compatibilityFlags,
        cronTriggers,
        placement: deploymentConfig?.placement,
        limits: deploymentConfig?.limits,
        observability: deploymentConfig?.observability,
        logpush: deploymentConfig?.logpush,
        overrides: ir ? cloudflareWranglerOverrides(ir) : undefined,
        queueConsumers,
      },
      deployerProgress,
    )

    if (!result.success) {
      report('FAILED', result.error ?? 'Deploy failed', 0)
      return { success: false, deploymentId: '', error: result.error ?? 'Deploy failed' }
    }

    report('WORKER_DEPLOYED', 'Worker deployed successfully', 80)
    report('UPDATING_WORKFLOW', 'Finalizing workflow configuration', 90)
    report('COMPLETED', 'Deployment complete', 100)
    return {
      success: true,
      deploymentId: result.workerName,
      // The workflow's name as this deploy gave it: the deployers name the Workflow
      // `sanitizedWorkflowName(name)`, and every lookup applies that same rule once, so
      // the raw name is stored (sanitizing twice isn't stable). A function has no Workflow.
      ...(kind === 'workflow' && { deployedName: opts.workflowName }),
      url: result.workerUrl,
      dashboardUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/${result.workerName}/production`,
    }
  }

  callFunction(request: FunctionCallRequest): Promise<FunctionCallResult> {
    return callFunction(request)
  }

  async trigger(
    _: string,
    params: unknown,
    config: ProviderConfig,
  ): Promise<{ instanceId: string }> {
    if (config.options?.['kind'] === 'script') {
      throw new Error(
        'Scripts have no instance lifecycle — invoke the deployed worker URL directly via HTTP',
      )
    }
    const { accountId, apiToken } = extractCredentials(config)
    const workflowName = sanitizedWorkflowName(config.options?.['workflowName'] as string)
    const retention = resolveRetention(
      (config.options?.['deploymentConfig'] as CloudflareDeploymentConfig | undefined)?.retention,
    )

    const api = new CloudflareAPI({ accountId, apiToken })
    const instance = await api.createInstance(workflowName, params, undefined, retention)
    return { instanceId: instance.id }
  }

  async getStatus(instanceId: string, config: ProviderConfig): Promise<WorkflowRunStatus> {
    if (config.options?.['kind'] === 'script') {
      throw new Error('Scripts have no instance lifecycle — getStatus is not supported')
    }
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

  async getRunDetail(instanceId: string, config: ProviderConfig): Promise<WorkflowRunDetail> {
    if (config.options?.['kind'] === 'script') {
      throw new Error('Scripts have no instance lifecycle — getRunDetail is not supported')
    }
    const { accountId, apiToken } = extractCredentials(config)
    const workflowName = sanitizedWorkflowName(config.options?.['workflowName'] as string)
    const api = new CloudflareAPI({ accountId, apiToken })
    try {
      return toRunDetail(await api.getInstanceStatus(workflowName, instanceId))
    } catch (err) {
      throw goneOr(err)
    }
  }

  async controlRun(
    action: 'pause' | 'resume' | 'terminate',
    input: { workflowName: string; instanceId: string; config: ProviderConfig },
  ): Promise<void> {
    const api = new CloudflareAPI(
      input.config.credentials as { accountId: string; apiToken: string },
    )
    const name = sanitizedWorkflowName(input.workflowName)
    try {
      if (action === 'pause') return await api.pauseInstance(name, input.instanceId)
      if (action === 'resume') return await api.resumeInstance(name, input.instanceId)
      return await api.terminateInstance(name, input.instanceId)
    } catch (err) {
      throw goneOr(err)
    }
  }

  async destroy(
    deploymentId: string,
    config: ProviderConfig,
  ): Promise<{ success: boolean; error?: string }> {
    const { accountId, apiToken } = extractCredentials(config)
    try {
      const api = new CloudflareAPI({ accountId, apiToken })
      await api.deleteWorker(deploymentId)
      return { success: true }
    } catch (err) {
      const message = (err as Error).message
      // Worker already gone — treat as successful takedown
      if (message.includes('does not exist')) {
        return { success: true }
      }
      return { success: false, error: message }
    }
  }

  async stopLocalDev(): Promise<void> {
    await stopLocalDev()
  }

  async triggerLocalDev(body: unknown): Promise<{ status: number; data: unknown }> {
    if (!(await isPortListening(LOCAL_DEV_PORT))) {
      return { status: 400, data: { error: 'No active session — start local dev first' } }
    }
    const response = await fetch(`http://localhost:${LOCAL_DEV_PORT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json().catch(() => null)
    return { status: response.status, data: data ?? { status: response.status } }
  }

  async localDevInstance(instanceId: string): Promise<{ status: number; data: unknown }> {
    if (!(await isPortListening(LOCAL_DEV_PORT))) {
      return { status: 400, data: { error: 'No active session' } }
    }
    const response = await fetch(
      `http://localhost:${LOCAL_DEV_PORT}?instanceId=${encodeURIComponent(instanceId)}`,
    )
    const data = await response.json().catch(() => null)
    return { status: response.status, data: data ?? { status: response.status } }
  }

  async readLocalDevLogs(since?: number): Promise<ProcessLogEntry[]> {
    return readLogs(since)
  }

  async startLocalDev(bundle: GeneratedBundle, options: LocalDevOptions): Promise<LocalDevSession> {
    const compiledBundle = await compileBundle(bundle)
    const session = await startLocalDev(compiledBundle, options)
    const warnings = localDevWarnings(options.ir)
    return warnings.length > 0 ? { ...session, warnings } : session
  }
}

/**
 * Transpiles every code file (entry + modules) and rewrites their paths to
 * .js so wrangler uploads plain JavaScript; config/meta files pass through.
 */
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

/**
 * Returns the queue-consumer wiring for wrangler.json based on `@queue function NAME(...)`
 * annotations in the trigger code, merged with per-queue settings.
 *
 * Settings merge in priority order (highest wins):
 *   1. `deploymentConfig.queueConsumers` — per-environment override from the
 *      deployment config (lets dev/staging/prod tune independently).
 *   2. The handler's inline `@config { ... }` block — the source-co-located
 *      default for the queue.
 *   3. CF defaults (no field) — `max_batch_size: 10`, `max_batch_timeout: 5s`,
 *      `max_retries: 3`.
 *
 * Returns `undefined` when there are no `@queue` declarations (no consumer
 * block emitted in wrangler.json).
 *
 * Annotation parse errors are silently swallowed here — they're already
 * surfaced as a structured DeployResult by the codegen path that runs first
 * (see `generate()` above).
 */
export function buildQueueConsumers(
  triggerCode: string | undefined,
  deploymentConfig: CloudflareDeploymentConfig | undefined,
  modules: ProjectHandlerModules = { queues: [] },
):
  | Array<{
      queue: string
      maxBatchSize?: number
      maxBatchTimeout?: number
      maxRetries?: number
      deadLetterQueue?: string
      maxConcurrency?: number
    }>
  | undefined {
  let handlers: Array<{
    /** JS function identifier — used to match deployment config overrides. */
    name: string
    /** CF-valid queue name — used in the wrangler `queue` field. */
    queueName: string
    config?: Record<string, string | number | boolean>
  }>
  if (hasHandlerModules(modules)) {
    // The file is the declaration: handlers/queue/<name>.ts consumes <name>.
    if (modules.queues.length === 0) return undefined
    handlers = modules.queues.map(({ queue }) => ({ name: queue, queueName: queue }))
  } else {
    if (!triggerCode) return undefined
    try {
      const parsed = parseAnnotations(triggerCode)
      if (parsed.mode !== 'strict' || parsed.queueHandlers.length === 0) return undefined
      handlers = parsed.queueHandlers.map((q) => ({
        name: q.name,
        queueName: q.queueName ?? q.name,
        config: q.config,
      }))
    } catch {
      return undefined
    }
  }

  // Deployment-config overrides may be keyed by either the JS function name
  // or the CF queue name — try both so users can write either form in the
  // queueConsumers field of the deployment config.
  const overridesByJsName = new Map(
    (deploymentConfig?.queueConsumers ?? []).map((c) => [c.queue, c] as const),
  )
  return handlers.map(({ name, queueName, config }) => {
    const override = overridesByJsName.get(name) ?? overridesByJsName.get(queueName)
    const merged: Record<string, unknown> = { queue: queueName }
    // Layer (2): inline @config block.
    if (config) {
      for (const [k, v] of Object.entries(config)) merged[k] = v
    }
    // Layer (1): deploymentConfig override (highest priority).
    if (override) {
      if (override.maxBatchSize !== undefined) merged.maxBatchSize = override.maxBatchSize
      if (override.maxBatchTimeout !== undefined) merged.maxBatchTimeout = override.maxBatchTimeout
      if (override.maxRetries !== undefined) merged.maxRetries = override.maxRetries
      if (override.deadLetterQueue !== undefined) merged.deadLetterQueue = override.deadLetterQueue
      if (override.maxConcurrency !== undefined) merged.maxConcurrency = override.maxConcurrency
    }
    return merged as {
      queue: string
      maxBatchSize?: number
      maxBatchTimeout?: number
      maxRetries?: number
      deadLetterQueue?: string
      maxConcurrency?: number
    }
  })
}

/**
 * Returns the union of cron expressions from legacy `@scheduled` annotations
 * and explicit `deploymentConfig.cronTriggers`, deduped while preserving the
 * order in which they first appear. Returns undefined when neither source
 * contributes any cron, so the wrangler config omits `triggers` entirely.
 *
 * Annotation parse errors are silently swallowed here — they're already
 * surfaced by the codegen path that runs first.
 */
export function buildCronTriggers(
  triggerCode: string | undefined,
  deploymentConfig: CloudflareDeploymentConfig | undefined,
  modules: ProjectHandlerModules = { queues: [] },
): string[] | undefined {
  const seen = new Set<string>()
  const out: string[] = []
  // With handler modules the schedules are declared in the deployment
  // config, never read from code.
  if (triggerCode && !hasHandlerModules(modules)) {
    try {
      const parsed = parseAnnotations(triggerCode)
      if (parsed.mode === 'strict') {
        for (const sh of parsed.scheduledHandlers) {
          for (const cron of sh.crons ?? []) {
            if (!seen.has(cron)) {
              seen.add(cron)
              out.push(cron)
            }
          }
        }
      }
    } catch {
      // Ignore — codegen path raises this as a structured DeployResult.
    }
  }
  for (const cron of deploymentConfig?.cronTriggers ?? []) {
    if (!seen.has(cron)) {
      seen.add(cron)
      out.push(cron)
    }
  }
  return out.length > 0 ? out : undefined
}
