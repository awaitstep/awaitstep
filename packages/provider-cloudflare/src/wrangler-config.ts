import { deriveQueueName, type BindingRequirement } from './codegen/bindings.js'
import type { SubWorkflowBinding } from './codegen/generators/sub-workflow.js'

export const WRANGLER_BASE_CONFIG = {
  compatibility_date: '2025-04-01',
  compatibility_flags: ['nodejs_compat'],
  observability: { enabled: true },
} as const

export interface WranglerWorkflowConfig {
  /**
   * Discriminator for the deploy artifact. `'workflow'` (default) emits a
   * primary `workflows[0]` entry binding the deployed `WorkflowEntrypoint`
   * class to `env.WORKFLOW`. `'script'` omits that primary entry — scripts
   * are fetch-only Workers and have no Workflow class to bind.
   */
  kind?: 'workflow' | 'script'
  workerName: string
  /** Required when `kind === 'workflow'`; unused for scripts. */
  className?: string
  /** Required when `kind === 'workflow'`; unused for scripts. */
  workflowName?: string
  main: string
  vars?: Record<string, string>
  bindings?: BindingRequirement[]
  subWorkflowBindings?: SubWorkflowBinding[]
  previewUrls?: boolean
  workersDev?: boolean
  routes?: Array<{ pattern: string; zone_name: string }>
  customDomains?: string[]
  compatibilityDate?: string
  compatibilityFlags?: string[]
  cronTriggers?: string[]
  placement?: { mode: string }
  limits?: { cpuMs?: number }
  observability?: { enabled: boolean; headSamplingRate?: number }
  logpush?: boolean
  /**
   * Per-queue consumer settings — populated by the adapter from `@queue function NAME`
   * annotations cross-referenced with the deployment config's `queueConsumers`.
   * Each entry produces one `queues.consumers[]` row in the emitted wrangler config.
   * Cloudflare defaults apply to fields left undefined.
   */
  queueConsumers?: Array<{
    queue: string
    maxBatchSize?: number
    maxBatchTimeout?: number
    maxRetries?: number
    deadLetterQueue?: string
    maxConcurrency?: number
  }>
  localDev?: boolean
}

export function generateWranglerConfig(config: WranglerWorkflowConfig): string {
  const isScript = config.kind === 'script'

  if (!isScript && (!config.className || !config.workflowName)) {
    throw new Error('generateWranglerConfig: workflow deploys require className and workflowName')
  }

  const subWorkflowEntries = (config.subWorkflowBindings ?? []).map((b) => ({
    binding: b.binding,
    name: b.name,
    class_name: b.className,
    script_name: b.scriptName,
  }))

  const workflowsEntries = isScript
    ? subWorkflowEntries
    : [
        {
          binding: 'WORKFLOW',
          name: config.workflowName!,
          class_name: config.className!,
        },
        ...subWorkflowEntries,
      ]

  const wranglerConfig: Record<string, unknown> = {
    compatibility_date: config.compatibilityDate ?? WRANGLER_BASE_CONFIG.compatibility_date,
    compatibility_flags: config.compatibilityFlags ?? WRANGLER_BASE_CONFIG.compatibility_flags,
    observability: config.observability ?? WRANGLER_BASE_CONFIG.observability,
    name: config.workerName,
    main: config.main,
  }
  if (workflowsEntries.length > 0) {
    wranglerConfig.workflows = workflowsEntries
  }
  if (config.previewUrls !== undefined) {
    wranglerConfig.preview_urls = config.previewUrls
  }
  if (config.workersDev !== undefined) {
    wranglerConfig.workers_dev = config.workersDev
  }
  if (config.vars && Object.keys(config.vars).length > 0) {
    wranglerConfig.vars = config.vars
  }
  if (config.routes && config.routes.length > 0) {
    const allRoutes: Array<Record<string, unknown>> = config.routes.map((r) => ({
      pattern: r.pattern,
      zone_name: r.zone_name,
    }))
    if (config.customDomains && config.customDomains.length > 0) {
      for (const domain of config.customDomains) {
        allRoutes.push({ pattern: domain, custom_domain: true })
      }
    }
    wranglerConfig.routes = allRoutes
  } else if (config.customDomains && config.customDomains.length > 0) {
    wranglerConfig.routes = config.customDomains.map((domain) => ({
      pattern: domain,
      custom_domain: true,
    }))
  }
  if (config.cronTriggers && config.cronTriggers.length > 0) {
    wranglerConfig.triggers = { crons: config.cronTriggers }
  }
  if (config.placement && config.placement.mode !== 'off') {
    wranglerConfig.placement = { mode: config.placement.mode }
  }
  if (config.limits?.cpuMs && config.limits.cpuMs > 10) {
    wranglerConfig.limits = { cpu_ms: config.limits.cpuMs }
  }
  if (config.logpush) {
    wranglerConfig.logpush = true
  }

  if (config.bindings && config.bindings.length > 0) {
    const kvBindings: unknown[] = []
    const d1Bindings: unknown[] = []
    const r2Bindings: unknown[] = []
    const queueProducers: unknown[] = []
    const serviceBindings: unknown[] = []
    const vectorizeBindings: unknown[] = []
    const analyticsEngineBindings: unknown[] = []
    const hyperdriveBindings: unknown[] = []
    let aiBinding: unknown | null = null
    let browserBinding: unknown | null = null

    for (const b of config.bindings) {
      switch (b.type) {
        case 'kv':
          if (config.localDev) {
            kvBindings.push({ binding: b.name, id: `local-${b.name.toLowerCase()}` })
          } else {
            kvBindings.push({ binding: b.name, id: b.resourceId! })
          }
          break
        case 'd1':
          if (config.localDev) {
            d1Bindings.push({
              binding: b.name,
              database_id: `local-${b.name.toLowerCase()}`,
              database_name: b.name,
            })
          } else {
            d1Bindings.push({
              binding: b.name,
              database_id: b.resourceId!,
              database_name: b.name,
            })
          }
          break
        case 'r2':
          r2Bindings.push({ binding: b.name, bucket_name: b.resourceId ?? b.name.toLowerCase() })
          break
        case 'queue':
          // Default queue name strips the `QUEUE_` prefix so producer and
          // consumer (`@queue function NAME`) agree on the same CF queue.
          // Users can override via the `<NAME>_BINDING_ID` env var convention.
          queueProducers.push({ binding: b.name, queue: b.resourceId ?? deriveQueueName(b.name) })
          break
        case 'service':
          serviceBindings.push({ binding: b.name, service: b.resourceId ?? b.name.toLowerCase() })
          break
        case 'ai':
          aiBinding = { binding: b.name }
          break
        case 'vectorize':
          vectorizeBindings.push({
            binding: b.name,
            index_name: b.resourceId ?? b.name.toLowerCase(),
          })
          break
        case 'analytics_engine':
          analyticsEngineBindings.push({ binding: b.name })
          break
        case 'hyperdrive':
          if (config.localDev) {
            hyperdriveBindings.push({
              binding: b.name,
              id: `local-${b.name.toLowerCase()}`,
            })
          } else {
            hyperdriveBindings.push({
              binding: b.name,
              id: b.resourceId!,
            })
          }
          break
        case 'browser':
          browserBinding = { binding: b.name }
          break
      }
    }

    if (kvBindings.length > 0) wranglerConfig.kv_namespaces = kvBindings
    if (d1Bindings.length > 0) wranglerConfig.d1_databases = d1Bindings
    if (r2Bindings.length > 0) wranglerConfig.r2_buckets = r2Bindings
    if (queueProducers.length > 0) {
      const existing = (wranglerConfig.queues ?? {}) as Record<string, unknown>
      wranglerConfig.queues = { ...existing, producers: queueProducers }
    }
    if (serviceBindings.length > 0) wranglerConfig.services = serviceBindings
    if (aiBinding) wranglerConfig.ai = aiBinding
    if (vectorizeBindings.length > 0) wranglerConfig.vectorize = vectorizeBindings
    if (analyticsEngineBindings.length > 0)
      wranglerConfig.analytics_engine_datasets = analyticsEngineBindings
    if (hyperdriveBindings.length > 0) wranglerConfig.hyperdrive = hyperdriveBindings
    if (browserBinding) wranglerConfig.browser = browserBinding
  }

  if (config.queueConsumers && config.queueConsumers.length > 0) {
    const consumers = config.queueConsumers.map((c) => {
      const out: Record<string, unknown> = { queue: c.queue }
      if (c.maxBatchSize !== undefined) out.max_batch_size = c.maxBatchSize
      if (c.maxBatchTimeout !== undefined) out.max_batch_timeout = c.maxBatchTimeout
      if (c.maxRetries !== undefined) out.max_retries = c.maxRetries
      if (c.deadLetterQueue !== undefined) out.dead_letter_queue = c.deadLetterQueue
      if (c.maxConcurrency !== undefined) out.max_concurrency = c.maxConcurrency
      return out
    })
    const existing = (wranglerConfig.queues ?? {}) as Record<string, unknown>
    wranglerConfig.queues = { ...existing, consumers }
  }

  return JSON.stringify(wranglerConfig, null, 2)
}
