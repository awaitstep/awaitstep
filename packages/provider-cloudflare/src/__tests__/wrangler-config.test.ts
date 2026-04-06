import { describe, it, expect } from 'vitest'
import { generateWranglerConfig, WRANGLER_BASE_CONFIG } from '../wrangler-config.js'

describe('generateWranglerConfig', () => {
  it('generates valid JSON with workflow binding', () => {
    const config = generateWranglerConfig({
      workerName: 'awaitstep-my-workflow',
      className: 'MyWorkflow',
      workflowName: 'my-workflow',
      main: './worker.js',
    })

    const parsed = JSON.parse(config)
    expect(parsed.name).toBe('awaitstep-my-workflow')
    expect(parsed.main).toBe('./worker.js')
    expect(parsed.compatibility_date).toBe(WRANGLER_BASE_CONFIG.compatibility_date)
    expect(parsed.compatibility_flags).toEqual(WRANGLER_BASE_CONFIG.compatibility_flags)
    expect(parsed.workflows).toHaveLength(1)
    expect(parsed.workflows[0]).toEqual({
      binding: 'WORKFLOW',
      name: 'my-workflow',
      class_name: 'MyWorkflow',
    })
  })

  it('always includes nodejs_compat flag', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
    })

    const parsed = JSON.parse(config)
    expect(parsed.compatibility_flags).toContain('nodejs_compat')
  })

  it('includes vars when provided', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      vars: { FOO: 'bar' },
    })

    const parsed = JSON.parse(config)
    expect(parsed.vars).toEqual({ FOO: 'bar' })
  })

  it('omits vars when empty', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      vars: {},
    })

    const parsed = JSON.parse(config)
    expect(parsed.vars).toBeUndefined()
  })

  it('includes KV namespace bindings', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      bindings: [{ name: 'KV_CACHE', type: 'kv', source: 'code-scan', resourceId: 'abc123' }],
    })

    const parsed = JSON.parse(config)
    expect(parsed.kv_namespaces).toEqual([{ binding: 'KV_CACHE', id: 'abc123' }])
  })

  it('includes D1 database bindings', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      bindings: [{ name: 'DB_MAIN', type: 'd1', source: 'code-scan', resourceId: 'uuid-123' }],
    })

    const parsed = JSON.parse(config)
    expect(parsed.d1_databases).toEqual([
      { binding: 'DB_MAIN', database_id: 'uuid-123', database_name: 'DB_MAIN' },
    ])
  })

  it('includes R2 bucket bindings', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      bindings: [{ name: 'BUCKET_ASSETS', type: 'r2', source: 'code-scan' }],
    })

    const parsed = JSON.parse(config)
    expect(parsed.r2_buckets).toEqual([{ binding: 'BUCKET_ASSETS', bucket_name: 'bucket_assets' }])
  })

  it('includes queue producer bindings', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      bindings: [{ name: 'QUEUE_JOBS', type: 'queue', source: 'code-scan' }],
    })

    const parsed = JSON.parse(config)
    expect(parsed.queues).toEqual({ producers: [{ binding: 'QUEUE_JOBS', queue: 'queue_jobs' }] })
  })

  it('includes service bindings', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      bindings: [{ name: 'AUTH_SERVICE', type: 'service', source: 'env-binding' }],
    })

    const parsed = JSON.parse(config)
    expect(parsed.services).toEqual([{ binding: 'AUTH_SERVICE', service: 'auth_service' }])
  })

  it('includes multiple binding types together', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      bindings: [
        { name: 'KV_CACHE', type: 'kv', source: 'code-scan', resourceId: 'kv-id' },
        { name: 'DB_MAIN', type: 'd1', source: 'code-scan', resourceId: 'db-uuid' },
        { name: 'QUEUE_JOBS', type: 'queue', source: 'code-scan' },
      ],
    })

    const parsed = JSON.parse(config)
    expect(parsed.kv_namespaces).toHaveLength(1)
    expect(parsed.d1_databases).toHaveLength(1)
    expect(parsed.queues.producers).toHaveLength(1)
    expect(parsed.r2_buckets).toBeUndefined()
    expect(parsed.services).toBeUndefined()
  })

  it('omits binding sections when no bindings provided', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
    })

    const parsed = JSON.parse(config)
    expect(parsed.kv_namespaces).toBeUndefined()
    expect(parsed.d1_databases).toBeUndefined()
    expect(parsed.r2_buckets).toBeUndefined()
    expect(parsed.queues).toBeUndefined()
    expect(parsed.services).toBeUndefined()
  })

  it('includes routes when provided', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      routes: [{ pattern: 'example.com/my-workflow/*', zone_name: 'example.com' }],
    })

    const parsed = JSON.parse(config)
    expect(parsed.routes).toEqual([
      { pattern: 'example.com/my-workflow/*', zone_name: 'example.com' },
    ])
  })

  it('omits routes when not provided', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
    })

    const parsed = JSON.parse(config)
    expect(parsed.routes).toBeUndefined()
  })

  it('omits routes when empty array', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      routes: [],
    })

    const parsed = JSON.parse(config)
    expect(parsed.routes).toBeUndefined()
  })

  it('includes sub-workflow bindings with script_name', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      subWorkflowBindings: [
        {
          binding: 'ORDER_FULFILLMENT_WORKFLOW',
          name: 'order-fulfillment',
          scriptName: 'awaitstep-abc123',
        },
      ],
    })

    const parsed = JSON.parse(config)
    expect(parsed.workflows).toHaveLength(2)
    expect(parsed.workflows[0]).toEqual({
      binding: 'WORKFLOW',
      name: 'test',
      class_name: 'Test',
    })
    expect(parsed.workflows[1]).toEqual({
      binding: 'ORDER_FULFILLMENT_WORKFLOW',
      name: 'order-fulfillment',
      script_name: 'awaitstep-abc123',
    })
  })

  it('includes preview_urls when set', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      previewUrls: true,
    })

    const parsed = JSON.parse(config)
    expect(parsed.preview_urls).toBe(true)
  })

  it('includes workers_dev when set', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      workersDev: false,
    })

    const parsed = JSON.parse(config)
    expect(parsed.workers_dev).toBe(false)
  })

  it('omits preview_urls and workers_dev when not provided', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
    })

    const parsed = JSON.parse(config)
    expect(parsed.preview_urls).toBeUndefined()
    expect(parsed.workers_dev).toBeUndefined()
  })

  it('omits sub-workflow bindings when not provided', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
    })

    const parsed = JSON.parse(config)
    expect(parsed.workflows).toHaveLength(1)
  })
})
