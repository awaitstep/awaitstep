import { describe, it, expect } from 'vitest'
import {
  cloudflareDefaultDeploymentConfig,
  cloudflareDeploymentConfigSchema,
  cloudflareDeploymentConfigUiSchema,
  cloudflareRouteSchema,
} from '../config-schema.js'

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

  it('rejects unknown top-level keys', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({ unknownField: true })
    expect(parsed.success).toBe(false)
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

  it('does not hardcode observability — falls back to WRANGLER_BASE_CONFIG', () => {
    expect(cloudflareDefaultDeploymentConfig.observability).toBeUndefined()
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

  it('accepts undefined observability (uses WRANGLER_BASE_CONFIG defaults)', () => {
    const parsed = cloudflareDeploymentConfigSchema.safeParse({})
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.observability).toBeUndefined()
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
})
