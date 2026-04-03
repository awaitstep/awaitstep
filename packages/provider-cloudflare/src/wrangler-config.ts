import type { BindingRequirement } from './codegen/bindings.js'

export const WRANGLER_BASE_CONFIG = {
  compatibility_date: '2025-04-01',
  compatibility_flags: ['nodejs_compat'],
} as const

export interface WranglerWorkflowConfig {
  workerName: string
  className: string
  workflowName: string
  main: string
  vars?: Record<string, string>
  bindings?: BindingRequirement[]
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
    ],
  }
  if (config.vars && Object.keys(config.vars).length > 0) {
    wranglerConfig.vars = config.vars
  }

  if (config.bindings && config.bindings.length > 0) {
    const kvBindings: unknown[] = []
    const d1Bindings: unknown[] = []
    const r2Bindings: unknown[] = []
    const queueProducers: unknown[] = []
    const serviceBindings: unknown[] = []

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
      }
    }

    if (kvBindings.length > 0) wranglerConfig.kv_namespaces = kvBindings
    if (d1Bindings.length > 0) wranglerConfig.d1_databases = d1Bindings
    if (r2Bindings.length > 0) wranglerConfig.r2_buckets = r2Bindings
    if (queueProducers.length > 0) wranglerConfig.queues = { producers: queueProducers }
    if (serviceBindings.length > 0) wranglerConfig.services = serviceBindings
  }

  return JSON.stringify(wranglerConfig, null, 2)
}
