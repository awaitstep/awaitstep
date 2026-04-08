import type { BindingRequirement } from './codegen/bindings.js'
import type { SubWorkflowBinding } from './codegen/generators/sub-workflow.js'

export const WRANGLER_BASE_CONFIG = {
  compatibility_date: '2025-04-01',
  compatibility_flags: ['nodejs_compat'],
  observability: { enabled: true },
} as const

export interface WranglerWorkflowConfig {
  workerName: string
  className: string
  workflowName: string
  main: string
  vars?: Record<string, string>
  bindings?: BindingRequirement[]
  subWorkflowBindings?: SubWorkflowBinding[]
  previewUrls?: boolean
  workersDev?: boolean
  routes?: Array<{ pattern: string; zone_name: string }>
  localDev?: boolean
}

export function generateWranglerConfig(config: WranglerWorkflowConfig): string {
  const wranglerConfig: Record<string, unknown> = {
    ...WRANGLER_BASE_CONFIG,
    name: config.workerName,
    main: config.main,
    workflows: [
      {
        binding: 'WORKFLOW',
        name: config.workflowName,
        class_name: config.className,
      },
      ...(config.subWorkflowBindings ?? []).map((b) => ({
        binding: b.binding,
        name: b.name,
        class_name: b.className,
        script_name: b.scriptName,
      })),
    ],
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
    wranglerConfig.routes = config.routes
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
          queueProducers.push({ binding: b.name, queue: b.resourceId ?? b.name.toLowerCase() })
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
    if (queueProducers.length > 0) wranglerConfig.queues = { producers: queueProducers }
    if (serviceBindings.length > 0) wranglerConfig.services = serviceBindings
    if (aiBinding) wranglerConfig.ai = aiBinding
    if (vectorizeBindings.length > 0) wranglerConfig.vectorize = vectorizeBindings
    if (analyticsEngineBindings.length > 0)
      wranglerConfig.analytics_engine_datasets = analyticsEngineBindings
    if (hyperdriveBindings.length > 0) wranglerConfig.hyperdrive = hyperdriveBindings
    if (browserBinding) wranglerConfig.browser = browserBinding
  }

  return JSON.stringify(wranglerConfig, null, 2)
}
