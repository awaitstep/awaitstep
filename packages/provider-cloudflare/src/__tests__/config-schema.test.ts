import { describe, it, expect } from 'vitest'
import {
  cloudflareDefaultDeploymentConfig,
  cloudflareDeploymentConfigSchema,
  cloudflareDeploymentConfigUiSchema,
  cloudflareRouteSchema,
} from '../config-schema.js'
import { WRANGLER_BASE_CONFIG } from '../wrangler-config.js'
import { CloudflareWorkflowsAdapter } from '../adapter.js'

describe('cloudflareDeploymentConfigSchema', () => {
  it('accepts an empty config', () => {
    expect(cloudflareDeploymentConfigSchema.safeParse({}).success).toBe(true)
  })

  it('accepts routes and toggles', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      routes: [{ pattern: 'example.com/*', zoneName: 'example.com' }],
      workersDev: true,
      previewUrls: false,
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects triggerCode (workflow-level field, not a deployment setting)', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      triggerCode: 'export default {}',
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects routes missing zoneName', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      routes: [{ pattern: 'example.com/*' }],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects empty route patterns', () => {
    const parsed = cloudflareRouteSchema.safeParse({ pattern: '', zoneName: 'example.com' })
    expect(parsed.success).toBe(false)
  })

  it('accepts connection-scoped binding mappings', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      bindings: {
        KV_USERS: { kind: 'kv', resourceId: 'namespace-123' },
        BUCKET_ASSETS: { kind: 'r2', resourceName: 'assets' },
      },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects unknown fields inside a binding mapping', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      bindings: { KV_USERS: { kind: 'kv', resourceId: 'abc', secret: 'no' } },
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects unknown top-level keys', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({ unknownField: true })
    expect(parsed.success).toBe(false)
  })
})

describe('cloudflareDeploymentConfigSchema — retention', () => {
  it('accepts duration strings and millisecond numbers', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      retention: { successRetention: '7 days', errorRetention: 86400000 },
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts a partial retention object', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      retention: { errorRetention: '30 days' },
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects malformed duration strings', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      retention: { successRetention: 'seven days-ish' },
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects unknown retention fields', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      retention: { keepForever: true },
    })
    expect(parsed.success).toBe(false)
  })

  it('defaults to 7-day retention in the default deployment config', () => {
    expect(cloudflareDefaultDeploymentConfig.retention).toEqual({
      successRetention: '7 days',
      errorRetention: '7 days',
    })
  })
})

describe('cloudflareDeploymentConfigSchema — queueConsumers', () => {
  it('accepts a valid queueConsumers array', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      queueConsumers: [
        {
          queue: 'emails',
          maxBatchSize: 25,
          maxBatchTimeout: 30,
          maxRetries: 3,
          deadLetterQueue: 'emails-dlq',
          maxConcurrency: 5,
        },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts an entry with only the queue name (defaults applied at wrangler emission)', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      queueConsumers: [{ queue: 'jobs' }],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects empty queue name', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      queueConsumers: [{ queue: '' }],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects out-of-range maxBatchSize', () => {
    const tooBig = cloudflareDeploymentConfigSchema.safeParse({
      queueConsumers: [{ queue: 'jobs', maxBatchSize: 101 }],
    })
    const tooSmall = cloudflareDeploymentConfigSchema.safeParse({
      queueConsumers: [{ queue: 'jobs', maxBatchSize: 0 }],
    })
    expect(tooBig.success).toBe(false)
    expect(tooSmall.success).toBe(false)
  })

  it('rejects out-of-range maxConcurrency (CF caps at 20)', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      queueConsumers: [{ queue: 'jobs', maxConcurrency: 21 }],
    })
    expect(parsed.success).toBe(false)
  })

  it('rejects unknown keys inside a queue consumer entry', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      queueConsumers: [{ queue: 'jobs', unknownField: true }],
    })
    expect(parsed.success).toBe(false)
  })
})

describe('cloudflareDefaultDeploymentConfig', () => {
  it('validates against its own schema', () => {
    expect(
      cloudflareDeploymentConfigSchema.safeParse(cloudflareDefaultDeploymentConfig).success,
    ).toBe(true)
  })

  it('enables workers.dev and preview URLs by default', () => {
    expect(cloudflareDefaultDeploymentConfig.workersDev).toBe(true)
    expect(cloudflareDefaultDeploymentConfig.previewUrls).toBe(true)
  })
})

describe('getDefaultDeploymentConfig', () => {
  const adapter = new CloudflareWorkflowsAdapter()

  it('starts a workflow with no public URL: the API runs it (D-9)', () => {
    const defaults = adapter.getDefaultDeploymentConfig('workflow')
    expect(defaults.workersDev).toBe(false)
    expect(defaults.previewUrls).toBe(false)
    expect(cloudflareDeploymentConfigSchema.safeParse(defaults).success).toBe(true)
    // A workflow is the kind when none is named.
    expect(adapter.getDefaultDeploymentConfig()).toEqual(defaults)
  })

  it('keeps a function at its workers.dev URL, where it is called', () => {
    const defaults = adapter.getDefaultDeploymentConfig('script')
    expect(defaults.workersDev).toBe(true)
    expect(defaults.previewUrls).toBe(true)
  })

  it('defaults observability to exactly what an unset config deploys', () => {
    // Shown as on (logs and traces) because that is what WRANGLER_BASE_CONFIG sends.
    expect(cloudflareDefaultDeploymentConfig.observability).toEqual(
      WRANGLER_BASE_CONFIG.observability,
    )
  })
})

describe('cloudflareDeploymentConfigSchema — observability toggle', () => {
  it('maps boolean true to the full logs+traces config', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({ observability: true })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const obs = parsed.data.observability
    expect(obs?.logs?.enabled).toBe(true)
    expect(obs?.logs?.persist).toBe(true)
    expect(obs?.logs?.invocation_logs).toBe(true)
    expect(obs?.traces?.enabled).toBe(true)
    expect(obs?.traces?.persist).toBe(true)
    // Legacy top-level flag should be off — we use the new system
    expect(obs?.enabled).toBe(false)
  })

  it('maps boolean false to a fully-disabled config', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({ observability: false })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    const obs = parsed.data.observability
    expect(obs?.logs?.enabled).toBe(false)
    expect(obs?.traces?.enabled).toBe(false)
  })

  it('passes through an object config as-is', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({
      observability: { logs: { enabled: true, persist: false } },
    })
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.observability?.logs?.persist).toBe(false)
  })

  it('reads an unset observability as what it deploys (WRANGLER_BASE_CONFIG), not off', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.observability).toEqual(WRANGLER_BASE_CONFIG.observability)
  })

  it('names the stored form of off, so the switch reads it back as off', () => {
    const off = cloudflareDeploymentConfigSchema.parse({ observability: false }).observability
    const field = cloudflareDeploymentConfigUiSchema.groups
      .flatMap((g) => g.fields)
      .find((f) => f.path === 'observability')
    expect(field?.offObject).toEqual(off)
  })
})

describe('cloudflareDeploymentConfigUiSchema', () => {
  it('has at least one group', () => {
    expect(cloudflareDeploymentConfigUiSchema.groups.length).toBeGreaterThan(0)
  })

  it('only references fields defined in the schema', () => {
    const schemaKeys = new Set(Object.keys(cloudflareDeploymentConfigSchema.shape))
    for (const group of cloudflareDeploymentConfigUiSchema.groups) {
      for (const field of group.fields) {
        const topKey = field.path.split('.')[0]
        expect(schemaKeys.has(topKey)).toBe(true)
      }
    }
  })

  it('reads the CPU limit from the saved form, not the number the toggle-era form sent', () => {
    // A stored config is the parsed one: a bare number becomes `{ cpuMs }`, which a
    // field at `limits` would show as "[object Object]".
    const saved = cloudflareDeploymentConfigSchema.parse({ limits: 300 }) as {
      limits?: { cpuMs?: number }
    }
    const field = cloudflareDeploymentConfigUiSchema.groups
      .flatMap((g) => g.fields)
      .find((f) => f.label === 'CPU limit (ms)')
    expect(field?.path).toBe('limits.cpuMs')
    expect(saved.limits?.cpuMs).toBe(300)
  })

  it('gives every group at least one field with a summary label', () => {
    for (const group of cloudflareDeploymentConfigUiSchema.groups) {
      expect(group.fields.some((f) => f.summaryLabel)).toBe(true)
    }
  })
})
