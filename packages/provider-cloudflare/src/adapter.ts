import { validateArtifact } from '@awaitstep/ir'
import type { ArtifactIR, ScriptIR, WorkflowIR, ValidationError, Result } from '@awaitstep/ir'
import { transpileToJS } from '@awaitstep/codegen/transpile'
import { generateScript, generateWorkflow } from './codegen/generate.js'
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
import { splitEnvVars } from './env.js'
import type { WranglerDeployer } from './deploy/deployer.js'
import { startLocalDev } from './local-dev.js'
import { sanitizedWorkflowName } from './naming.js'
import { CloudflareAPI } from './api.js'
import { WRANGLER_BASE_CONFIG } from './wrangler-config.js'
import { detectBindings, type BindingRequirement } from './codegen/bindings.js'
import { getSubWorkflowBindings } from './codegen/generators/sub-workflow.js'
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

export class CloudflareWorkflowsAdapter implements WorkflowProvider, LocalDevProvider {
  readonly name = 'cloudflare'
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
    if (c.observability) {
      preview.observability = c.observability
    }
    if (c.logpush) {
      preview.logpush = true
    }

    return { filename: 'wrangler.json', content: preview }
  }

  validate(ir: ArtifactIR): Result<void, ValidationError[]> {
    const result = validateArtifact(ir)
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

  generate(ir: ArtifactIR, config?: ProviderConfig): GeneratedArtifact {
    const envVarNames = config?.envVars ? Object.keys(config.envVars) : undefined
    const dc = config?.options?.['deploymentConfig'] as CloudflareDeploymentConfig | undefined
    const triggerCode = dc?.triggerCode ?? (config?.options?.['triggerCode'] as string | undefined)
    if (ir.kind === 'script') {
      const source = generateScript(ir as ScriptIR, {
        templateResolver: this.templateResolver,
        envVarNames,
        triggerCode,
      })
      return { filename: 'worker.ts', source }
    }
    const source = generateWorkflow(ir as WorkflowIR, {
      templateResolver: this.templateResolver,
      envVarNames,
      triggerCode,
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
    const compiled = await transpileToJS(artifact.source)
    const compiledArtifact: GeneratedArtifact = {
      filename: 'worker.js',
      source: artifact.source,
      compiled,
    }

    // Extract the actual class name from the generated source so the wrangler
    // config matches exactly, even if ir.metadata.name differs from workflow.name.
    // Scripts have no `WorkflowEntrypoint` class — generatedClassName stays
    // undefined and the wrangler-config code path skips the primary workflow
    // entry when kind === 'script'.
    const classNameMatch = artifact.source.match(
      /export\s+class\s+(\w+)\s+extends\s+WorkflowEntrypoint/,
    )
    const generatedClassName = classNameMatch?.[1]

    report('CODE_READY', 'Code compiled successfully', 25)

    report('DETECTING_BINDINGS', 'Analyzing resource bindings', 35)

    // Auto-detect resource bindings from IR and resolve IDs from env vars
    const ir = config.options?.['ir'] as ArtifactIR | undefined
    const kind: 'workflow' | 'script' = ir?.kind === 'script' ? 'script' : 'workflow'
    let resolvedBindings: BindingRequirement[] | undefined
    if (ir) {
      const detected = detectBindings(ir as unknown as WorkflowIR)
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
        for (const b of needsId) {
          const envKey = `${b.name}_BINDING_ID`
          const id = config.envVars?.[envKey]?.value
          if (id) {
            b.resourceId = id
          } else {
            missing.push(
              `Binding '${b.name}' requires env var '${envKey}' with the ${typeLabels[b.type] ?? b.type} ID`,
            )
          }
        }

        // Optionally resolve vectorize index names from env vars
        for (const b of detected.filter((b) => b.type === 'vectorize')) {
          const envKey = `${b.name}_BINDING_ID`
          const id = config.envVars?.[envKey]?.value
          if (id) b.resourceId = id
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
      | CloudflareDeploymentConfig
      | undefined
    const legacyDeployConfig = config.options?.['deployConfig'] as
      | { route?: { pattern: string; zoneName: string } }
      | undefined

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
      compiledArtifact,
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
        previewUrls,
        workersDev,
        routes,
        customDomains: deploymentConfig?.customDomains,
        compatibilityDate: deploymentConfig?.compatibilityDate,
        compatibilityFlags: deploymentConfig?.compatibilityFlags,
        cronTriggers: deploymentConfig?.cronTriggers,
        placement: deploymentConfig?.placement,
        limits: deploymentConfig?.limits,
        observability: deploymentConfig?.observability,
        logpush: deploymentConfig?.logpush,
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
      url: result.workerUrl,
      dashboardUrl: `https://dash.cloudflare.com/${accountId}/workers/services/view/${result.workerName}`,
    }
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

    const api = new CloudflareAPI({ accountId, apiToken })
    const instance = await api.createInstance(workflowName, params)
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

  async destroy(
    deploymentId: string,
    config: ProviderConfig,
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.deployer) return { success: false, error: 'No deployer configured' }
    const { accountId, apiToken } = extractCredentials(config)
    return this.deployer.deleteWorker(deploymentId, { accountId, apiToken })
  }

  async startLocalDev(
    artifact: GeneratedArtifact,
    options: LocalDevOptions,
  ): Promise<LocalDevSession> {
    const compiled = await transpileToJS(artifact.source)
    return startLocalDev({ filename: 'worker.js', source: artifact.source, compiled }, options)
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
