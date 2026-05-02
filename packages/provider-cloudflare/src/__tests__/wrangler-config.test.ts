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

  it('includes AI binding as singular config', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      bindings: [{ name: 'AI', type: 'ai', source: 'code-scan' }],
    })

    const parsed = JSON.parse(config)
    expect(parsed.ai).toEqual({ binding: 'AI' })
  })

  it('includes Vectorize binding', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      bindings: [{ name: 'VECTORIZE_INDEX', type: 'vectorize', source: 'code-scan' }],
    })

    const parsed = JSON.parse(config)
    expect(parsed.vectorize).toEqual([
      { binding: 'VECTORIZE_INDEX', index_name: 'vectorize_index' },
    ])
  })

  it('includes Vectorize binding with explicit resourceId as index_name', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      bindings: [
        {
          name: 'VECTORIZE_INDEX',
          type: 'vectorize',
          source: 'code-scan',
          resourceId: 'my-custom-index',
        },
      ],
    })

    const parsed = JSON.parse(config)
    expect(parsed.vectorize).toEqual([
      { binding: 'VECTORIZE_INDEX', index_name: 'my-custom-index' },
    ])
  })

  it('includes Analytics Engine binding', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      bindings: [{ name: 'ANALYTICS_EVENTS', type: 'analytics_engine', source: 'code-scan' }],
    })

    const parsed = JSON.parse(config)
    expect(parsed.analytics_engine_datasets).toEqual([{ binding: 'ANALYTICS_EVENTS' }])
  })

  it('includes Hyperdrive binding', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      bindings: [
        { name: 'HYPERDRIVE_PG', type: 'hyperdrive', source: 'code-scan', resourceId: 'hd-cfg-id' },
      ],
    })

    const parsed = JSON.parse(config)
    expect(parsed.hyperdrive).toEqual([{ binding: 'HYPERDRIVE_PG', id: 'hd-cfg-id' }])
  })

  it('uses local IDs for Hyperdrive in local dev', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      localDev: true,
      bindings: [{ name: 'HYPERDRIVE_PG', type: 'hyperdrive', source: 'code-scan' }],
    })

    const parsed = JSON.parse(config)
    expect(parsed.hyperdrive).toEqual([{ binding: 'HYPERDRIVE_PG', id: 'local-hyperdrive_pg' }])
  })

  it('includes Browser binding as singular config', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      bindings: [{ name: 'BROWSER', type: 'browser', source: 'code-scan' }],
    })

    const parsed = JSON.parse(config)
    expect(parsed.browser).toEqual({ binding: 'BROWSER' })
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

  it('includes sub-workflow bindings with class_name and script_name', () => {
    const config = generateWranglerConfig({
      workerName: 'test',
      className: 'Test',
      workflowName: 'test',
      main: './worker.js',
      subWorkflowBindings: [
        {
          binding: 'ORDER_FULFILLMENT',
          name: 'Order-Fulfillment',
          className: 'OrderFulfillment',
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
      binding: 'ORDER_FULFILLMENT',
      name: 'Order-Fulfillment',
      class_name: 'OrderFulfillment',
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

  describe("kind: 'script'", () => {
    it('omits the primary WORKFLOW binding entry', () => {
      const config = generateWranglerConfig({
        kind: 'script',
        workerName: 'awaitstep-my-script',
        main: './worker.js',
      })

      const parsed = JSON.parse(config)
      expect(parsed.name).toBe('awaitstep-my-script')
      expect(parsed.workflows).toBeUndefined()
    })

    it('still emits sub-workflow bindings (forwards to deployed workflows)', () => {
      const config = generateWranglerConfig({
        kind: 'script',
        workerName: 'awaitstep-my-script',
        main: './worker.js',
        subWorkflowBindings: [
          {
            binding: 'ONBOARDING_WORKFLOW',
            name: 'Onboarding-Workflow',
            className: 'OnboardingWorkflow',
            scriptName: 'awaitstep-onboarding',
          },
        ],
      })

      const parsed = JSON.parse(config)
      expect(parsed.workflows).toEqual([
        {
          binding: 'ONBOARDING_WORKFLOW',
          name: 'Onboarding-Workflow',
          class_name: 'OnboardingWorkflow',
          script_name: 'awaitstep-onboarding',
        },
      ])
    })

    it('does not require className or workflowName', () => {
      // Should not throw — those fields are workflow-class concepts.
      expect(() =>
        generateWranglerConfig({
          kind: 'script',
          workerName: 'awaitstep-my-script',
          main: './worker.js',
        }),
      ).not.toThrow()
    })
  })

  it('throws when className/workflowName are missing for a workflow deploy', () => {
    expect(() =>
      generateWranglerConfig({
        workerName: 'awaitstep-broken',
        main: './worker.js',
      } as Parameters<typeof generateWranglerConfig>[0]),
    ).toThrow(/workflow deploys require/)
  })

  describe('queueConsumers', () => {
    const baseScript = {
      kind: 'script' as const,
      workerName: 'awaitstep-q',
      main: './worker.js',
    }

    it('emits queues.consumers when queueConsumers provided', () => {
      const json = generateWranglerConfig({
        ...baseScript,
        queueConsumers: [
          {
            queue: 'emails',
            maxBatchSize: 25,
            maxBatchTimeout: 30,
            maxRetries: 5,
            deadLetterQueue: 'emails-dlq',
            maxConcurrency: 10,
          },
        ],
      })
      const parsed = JSON.parse(json)
      expect(parsed.queues.consumers).toEqual([
        {
          queue: 'emails',
          max_batch_size: 25,
          max_batch_timeout: 30,
          max_retries: 5,
          dead_letter_queue: 'emails-dlq',
          max_concurrency: 10,
        },
      ])
    })

    it('emits a minimal consumer entry when only queue name is provided', () => {
      const json = generateWranglerConfig({
        ...baseScript,
        queueConsumers: [{ queue: 'jobs' }],
      })
      const parsed = JSON.parse(json)
      expect(parsed.queues.consumers).toEqual([{ queue: 'jobs' }])
    })

    it('coexists with queues.producers in the same queues object', () => {
      const json = generateWranglerConfig({
        ...baseScript,
        bindings: [
          { name: 'QUEUE_EMAILS', type: 'queue', source: 'code-scan', resourceId: 'emails' },
        ],
        queueConsumers: [{ queue: 'emails' }],
      })
      const parsed = JSON.parse(json)
      expect(parsed.queues.producers).toEqual([{ binding: 'QUEUE_EMAILS', queue: 'emails' }])
      expect(parsed.queues.consumers).toEqual([{ queue: 'emails' }])
    })

    it('omits queues.consumers entirely when queueConsumers is empty', () => {
      const json = generateWranglerConfig({
        ...baseScript,
        queueConsumers: [],
      })
      const parsed = JSON.parse(json)
      expect(parsed.queues).toBeUndefined()
    })
  })
})
