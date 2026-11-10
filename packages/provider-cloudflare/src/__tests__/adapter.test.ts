import { describe, it, expect, vi } from 'vitest'
import type { ScriptIR, WorkflowIR } from '@awaitstep/ir'
import type { ProviderConfig } from '@awaitstep/codegen'
import { providerEntrySource } from './codegen/bundle-source.js'
import {
  CloudflareWorkflowsAdapter,
  buildQueueConsumers,
  buildCronTriggers,
  localDevWarnings,
} from '../adapter.js'
import type { WranglerDeployer } from '../deploy/deployer.js'

const mockDeployer: WranglerDeployer = {
  deploy: vi.fn().mockResolvedValue({
    success: true,
    workerName: 'awaitstep-test-workflow',
    workerUrl: 'https://awaitstep-test-workflow.workers.dev',
  }),
  deleteWorker: vi.fn().mockResolvedValue({ success: true }),
}

vi.mock('../api.js', () => ({
  CloudflareAPI: class {
    async createInstance() {
      return { id: 'instance-abc' }
    }
    async getInstanceStatus() {
      return { id: 'instance-abc', status: 'complete', output: { result: 42 } }
    }
  },
}))

const simpleIR: WorkflowIR = {
  metadata: {
    name: 'test-workflow',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  nodes: [
    {
      id: 'step-1',
      type: 'step',
      name: 'Hello',
      position: { x: 0, y: 0 },
      version: '1.0.0',
      provider: 'cloudflare',
      data: { code: 'return { hello: "world" };' },
    },
  ],
  edges: [],
  entryNodeId: 'step-1',
}

const providerConfig: ProviderConfig = {
  provider: 'cloudflare',
  credentials: { accountId: 'acc123', apiToken: 'tok123' },
  options: { workflowId: 'test-workflow', workflowName: 'test-workflow' },
}

describe('CloudflareWorkflowsAdapter', () => {
  const adapter = new CloudflareWorkflowsAdapter({ deployer: mockDeployer })

  it('has the correct name', () => {
    expect(adapter.name).toBe('cloudflare')
  })

  describe('validate', () => {
    it('accepts valid IR', () => {
      const result = adapter.validate(simpleIR)
      expect(result.ok).toBe(true)
    })

    it('rejects invalid IR', () => {
      const result = adapter.validate({
        ...simpleIR,
        entryNodeId: 'nonexistent',
      })
      expect(result.ok).toBe(false)
    })
  })

  describe('generate', () => {
    it('generates a TypeScript artifact', () => {
      const bundle = adapter.generate(simpleIR)
      expect(bundle.entry).toBe('worker.ts')
      expect(bundle.primary).toBe('awaitstep/workflow.ts')
      expect(providerEntrySource(bundle)).toContain('WorkflowEntrypoint')
      expect(providerEntrySource(bundle)).toContain('class TestWorkflow')
      const workflow = bundle.files.find((f) => f.path === 'awaitstep/workflow.ts')!
      expect(workflow.source).toContain('flow.step("step-1"')
    })

    it('uses default trigger code when no triggerCode provided', () => {
      const bundle = adapter.generate(simpleIR)
      expect(providerEntrySource(bundle)).toContain('const params = await request.json()')
      expect(providerEntrySource(bundle)).toContain(
        'env.WORKFLOW.create({ params, retention: AWAITSTEP_RETENTION })',
      )
    })

    it('uses custom triggerCode from config options', () => {
      const customTrigger =
        'const { name } = await request.json();\nconst instance = await env.WORKFLOW.create({ name });\nreturn Response.json({ instanceId: instance.id });'
      const config: ProviderConfig = {
        provider: 'cloudflare',
        credentials: {},
        options: { triggerCode: customTrigger },
      }
      const bundle = adapter.generate(simpleIR, config)
      expect(providerEntrySource(bundle)).toContain('const { name } = await request.json()')
      expect(providerEntrySource(bundle)).toContain('env.WORKFLOW.create({ name })')
      expect(providerEntrySource(bundle)).not.toContain(
        'env.WORKFLOW.create({ params, retention: AWAITSTEP_RETENTION })',
      )
    })
  })

  describe('deploy', () => {
    it('returns success on successful deploy', async () => {
      const artifact = adapter.generate(simpleIR)
      const result = await adapter.deploy(artifact, providerConfig)
      expect(result.success).toBe(true)
      expect(result.deploymentId).toBe('awaitstep-test-workflow')
    })

    it('returns error when workflowId is missing', async () => {
      const artifact = adapter.generate(simpleIR)
      const badConfig: ProviderConfig = {
        ...providerConfig,
        options: {},
      }
      const result = await adapter.deploy(artifact, badConfig)
      expect(result.success).toBe(false)
      expect(result.error).toContain('workflowId')
    })

    it('throws when credentials are missing', async () => {
      const artifact = adapter.generate(simpleIR)
      const badConfig: ProviderConfig = {
        ...providerConfig,
        credentials: {},
      }
      await expect(adapter.deploy(artifact, badConfig)).rejects.toThrow(
        'accountId and apiToken are required',
      )
    })

    it('passes routes from deployConfig to deployer', async () => {
      const artifact = adapter.generate(simpleIR)
      const configWithRoute: ProviderConfig = {
        ...providerConfig,
        options: {
          ...providerConfig.options,
          deployConfig: {
            route: { pattern: 'example.com/my-workflow/*', zoneName: 'example.com' },
          },
        },
      }
      await adapter.deploy(artifact, configWithRoute)
      const call = vi.mocked(mockDeployer.deploy).mock.lastCall!
      const deployOpts = call[1]
      expect(deployOpts.routes).toEqual([
        { pattern: 'example.com/my-workflow/*', zone_name: 'example.com' },
        { pattern: 'example.com/my-workflow*', zone_name: 'example.com' },
      ])
    })

    it('omits routes when deployConfig has no route', async () => {
      const artifact = adapter.generate(simpleIR)
      await adapter.deploy(artifact, providerConfig)
      const call = vi.mocked(mockDeployer.deploy).mock.lastCall!
      const deployOpts = call[1]
      expect(deployOpts.routes).toBeUndefined()
    })

    it('returns a structured Compile error when transpile fails (does not throw)', async () => {
      const brokenIR: WorkflowIR = {
        ...simpleIR,
        nodes: [
          {
            ...simpleIR.nodes[0]!,
            // Missing comma between properties — sucrase will reject this.
            data: { code: 'const obj = { a: 1\n  b: 2 }; return obj;' },
          },
        ],
      }
      const artifact = adapter.generate(brokenIR)
      const result = await adapter.deploy(artifact, providerConfig)
      expect(result.success).toBe(false)
      // The failing file is named — a bundle has more than one.
      expect(result.error).toMatch(/^Compile error in \S+\.ts:/)
    })

    it('applies a connection’s binding map to the generated wrangler config', async () => {
      const bindingIR: WorkflowIR = {
        ...simpleIR,
        nodes: [
          {
            ...simpleIR.nodes[0]!,
            data: { code: 'return env.KV_CACHE.get("key")' },
          },
        ],
      }
      const artifact = adapter.generate(bindingIR)
      const configWithMapping: ProviderConfig = {
        ...providerConfig,
        options: {
          ...providerConfig.options,
          ir: bindingIR,
          deploymentConfig: {
            bindings: { KV_CACHE: { kind: 'kv', resourceId: 'namespace-123' } },
          },
        },
      }
      await adapter.deploy(artifact, configWithMapping)
      const call = vi.mocked(mockDeployer.deploy).mock.lastCall!
      expect(call[1].bindings).toContainEqual(
        expect.objectContaining({
          name: 'KV_CACHE',
          type: 'kv',
          source: 'code-scan',
          resourceId: 'namespace-123',
        }),
      )
    })

    it('prefers a connection mapping over the legacy binding-id env var', async () => {
      const bindingIR: WorkflowIR = {
        ...simpleIR,
        nodes: [
          {
            ...simpleIR.nodes[0]!,
            data: { code: 'return env.KV_CACHE.get("key")' },
          },
        ],
      }
      const artifact = adapter.generate(bindingIR)
      const config: ProviderConfig = {
        ...providerConfig,
        envVars: { KV_CACHE_BINDING_ID: { value: 'legacy-id', isSecret: false } },
        options: {
          ...providerConfig.options,
          ir: bindingIR,
          deploymentConfig: {
            bindings: { KV_CACHE: { kind: 'kv', resourceId: 'mapped-id' } },
          },
        },
      }
      await adapter.deploy(artifact, config)
      const call = vi.mocked(mockDeployer.deploy).mock.lastCall!
      expect(call[1].bindings).toContainEqual(
        expect.objectContaining({ name: 'KV_CACHE', resourceId: 'mapped-id' }),
      )
    })

    it('maps the same logical binding differently per connection', async () => {
      const bindingIR: WorkflowIR = {
        ...simpleIR,
        nodes: [
          {
            ...simpleIR.nodes[0]!,
            data: { code: 'return env.KV_CACHE.get("key")' },
          },
        ],
      }
      const artifact = adapter.generate(bindingIR)
      for (const resourceId of ['prod-id', 'staging-id']) {
        await adapter.deploy(artifact, {
          ...providerConfig,
          options: {
            ...providerConfig.options,
            ir: bindingIR,
            deploymentConfig: { bindings: { KV_CACHE: { kind: 'kv', resourceId } } },
          },
        })
        const call = vi.mocked(mockDeployer.deploy).mock.lastCall!
        expect(call[1].bindings).toContainEqual(
          expect.objectContaining({ name: 'KV_CACHE', resourceId }),
        )
      }
    })

    it('refuses a deployment connection with an unmapped binding', async () => {
      const bindingIR: WorkflowIR = {
        ...simpleIR,
        nodes: [
          {
            ...simpleIR.nodes[0]!,
            data: { code: 'return env.KV_CACHE.get("key")' },
          },
        ],
      }
      const artifact = adapter.generate(bindingIR)
      const result = await adapter.deploy(artifact, {
        ...providerConfig,
        options: { ...providerConfig.options, ir: bindingIR },
      })
      expect(result.success).toBe(false)
      expect(result.error).toContain('KV_CACHE')
      expect(result.error).toContain('not mapped')
    })

    it('excludes _BINDING_ID env vars from wrangler vars', async () => {
      const artifact = adapter.generate(simpleIR)
      const configWithBindingIds: ProviderConfig = {
        ...providerConfig,
        envVars: {
          API_URL: { value: 'https://example.com', isSecret: false },
          KV_CACHE_BINDING_ID: { value: 'abc123', isSecret: false },
          DB_MAIN_BINDING_ID: { value: 'def456', isSecret: false },
          SECRET_KEY: { value: 's3cret', isSecret: true },
        },
      }
      await adapter.deploy(artifact, configWithBindingIds)
      const call = vi.mocked(mockDeployer.deploy).mock.lastCall!
      const deployOpts = call[1]
      expect(deployOpts.vars).toEqual({ API_URL: 'https://example.com' })
      expect(deployOpts.secrets).toEqual({ SECRET_KEY: 's3cret' })
    })
  })

  describe('trigger', () => {
    it('returns an instance ID', async () => {
      const result = await adapter.trigger('awaitstep-test', { input: 1 }, providerConfig)
      expect(result.instanceId).toBe('instance-abc')
    })
  })

  describe('getStatus', () => {
    it('returns mapped workflow status', async () => {
      const result = await adapter.getStatus('instance-abc', providerConfig)
      expect(result.status).toBe('complete')
      expect(result.output).toEqual({ result: 42 })
    })
  })
})

describe('buildQueueConsumers', () => {
  it('returns undefined when triggerCode is missing', () => {
    expect(buildQueueConsumers(undefined, undefined)).toBeUndefined()
  })

  it('returns undefined for legacy-mode trigger code (no annotations)', () => {
    expect(
      buildQueueConsumers('try { return new Response() } catch(e) {}', undefined),
    ).toBeUndefined()
  })

  it('returns undefined when strict mode has no @queue handlers', () => {
    const triggerCode = `@fetch function handler(req, env, ctx) { return new Response() }`
    expect(buildQueueConsumers(triggerCode, undefined)).toBeUndefined()
  })

  it('emits one entry per @queue annotation with no overrides', () => {
    const triggerCode = `
@queue function emails(b, e, c) { /* */ }
@queue function jobs(b, e, c) { /* */ }
`
    const result = buildQueueConsumers(triggerCode, undefined)
    expect(result).toEqual([{ queue: 'emails' }, { queue: 'jobs' }])
  })

  it('merges per-queue settings from deploymentConfig.queueConsumers', () => {
    const triggerCode = `@queue function emails(b, e, c) {}`
    const result = buildQueueConsumers(triggerCode, {
      queueConsumers: [
        {
          queue: 'emails',
          maxBatchSize: 5,
          maxRetries: 1,
          deadLetterQueue: 'emails-dlq',
        },
      ],
    })
    expect(result).toEqual([
      {
        queue: 'emails',
        maxBatchSize: 5,
        maxRetries: 1,
        deadLetterQueue: 'emails-dlq',
      },
    ])
  })

  it('ignores queueConsumers entries that do not match any @queue annotation', () => {
    const triggerCode = `@queue function emails(b, e, c) {}`
    const result = buildQueueConsumers(triggerCode, {
      queueConsumers: [
        { queue: 'emails', maxBatchSize: 25 },
        { queue: 'orphan', maxBatchSize: 100 },
      ],
    })
    expect(result).toEqual([{ queue: 'emails', maxBatchSize: 25 }])
  })

  it('falls back to defaults (no overrides) when deploymentConfig has no entry for a queue', () => {
    const triggerCode = `
@queue function emails(b, e, c) {}
@queue function jobs(b, e, c) {}
`
    const result = buildQueueConsumers(triggerCode, {
      queueConsumers: [{ queue: 'emails', maxBatchSize: 5 }],
    })
    expect(result).toEqual([{ queue: 'emails', maxBatchSize: 5 }, { queue: 'jobs' }])
  })

  it('emits CF-valid queue name (snake_case function → kebab-case queue)', () => {
    const triggerCode = `
@queue function marktplaats_processor(b, e, c) { msg.ack() }
`
    const result = buildQueueConsumers(triggerCode, undefined)
    expect(result).toEqual([{ queue: 'marktplaats-processor' }])
    expect(result![0]!.queue).toMatch(/^[a-z0-9-]+$/)
  })

  it('deployment override matches by either JS function name or CF queue name', () => {
    const triggerCode = `
@queue function marktplaats_processor(b, e, c) { msg.ack() }
`
    // Override keyed by JS function name (what user might naturally type)
    const byJsName = buildQueueConsumers(triggerCode, {
      queueConsumers: [{ queue: 'marktplaats_processor', maxBatchSize: 1 }],
    })
    expect(byJsName).toEqual([{ queue: 'marktplaats-processor', maxBatchSize: 1 }])
    // Override keyed by CF queue name (what shows up in wrangler.json)
    const byCFName = buildQueueConsumers(triggerCode, {
      queueConsumers: [{ queue: 'marktplaats-processor', maxBatchSize: 1 }],
    })
    expect(byCFName).toEqual([{ queue: 'marktplaats-processor', maxBatchSize: 1 }])
  })

  it('returns undefined on annotation parse error (already surfaced by generate)', () => {
    const triggerCode = `@fetch function notHandler() {}`
    expect(buildQueueConsumers(triggerCode, undefined)).toBeUndefined()
  })

  it('applies inline @config block as the per-queue default', () => {
    const triggerCode = `
@queue function emails(b, e, c) {
  @config {
    max_batch_size: 1,
    max_retries: 5,
    dead_letter_queue: "emails-dlq"
  }
  msg.ack()
}
`
    const result = buildQueueConsumers(triggerCode, undefined)
    expect(result).toEqual([
      {
        queue: 'emails',
        maxBatchSize: 1,
        maxRetries: 5,
        deadLetterQueue: 'emails-dlq',
      },
    ])
  })

  it('deploymentConfig override wins over inline @config (per-environment tuning)', () => {
    const triggerCode = `
@queue function emails(b, e, c) {
  @config { max_batch_size: 1, max_retries: 5 }
}
`
    const result = buildQueueConsumers(triggerCode, {
      queueConsumers: [{ queue: 'emails', maxBatchSize: 50 }],
    })
    expect(result).toEqual([
      {
        queue: 'emails',
        maxBatchSize: 50, // override wins
        maxRetries: 5, // from inline @config (not overridden)
      },
    ])
  })

  it('different queues can have different inline @config blocks', () => {
    const triggerCode = `
@queue function emails(b, e, c) {
  @config { max_batch_size: 50 }
}
@queue function jobs(b, e, c) {
  @config { max_batch_size: 1, max_concurrency: 20 }
}
`
    const result = buildQueueConsumers(triggerCode, undefined)
    expect(result).toEqual([
      { queue: 'emails', maxBatchSize: 50 },
      { queue: 'jobs', maxBatchSize: 1, maxConcurrency: 20 },
    ])
  })
})

describe('buildCronTriggers', () => {
  it('returns undefined when neither annotations nor config provide crons', () => {
    expect(buildCronTriggers(undefined, undefined)).toBeUndefined()
    expect(
      buildCronTriggers('try { return new Response() } catch(e) {}', undefined),
    ).toBeUndefined()
  })

  it('extracts crons from a single @scheduled handler', () => {
    const triggerCode = `
@scheduled function nightly(controller, env, ctx) {
  @crons ["0 2 * * *"]
}
`
    expect(buildCronTriggers(triggerCode, undefined)).toEqual(['0 2 * * *'])
  })

  it('unions crons from multiple @scheduled handlers in declaration order', () => {
    const triggerCode = `
@scheduled function morning(controller, env, ctx) {
  @crons ["0 6 * * *"]
}

@scheduled function evening(controller, env, ctx) {
  @crons ["0 18 * * *", "0 20 * * *"]
}
`
    expect(buildCronTriggers(triggerCode, undefined)).toEqual([
      '0 6 * * *',
      '0 18 * * *',
      '0 20 * * *',
    ])
  })

  it('merges deploymentConfig.cronTriggers with annotation crons (annotations first, dedup)', () => {
    const triggerCode = `
@scheduled function nightly(controller, env, ctx) {
  @crons ["0 2 * * *"]
}
`
    const result = buildCronTriggers(triggerCode, {
      cronTriggers: ['0 2 * * *', '*/15 * * * *'],
    })
    // "0 2 * * *" appears once even though both sources list it.
    expect(result).toEqual(['0 2 * * *', '*/15 * * * *'])
  })

  it('uses deploymentConfig.cronTriggers when no annotation handlers are declared', () => {
    expect(buildCronTriggers(undefined, { cronTriggers: ['0 0 * * *'] })).toEqual(['0 0 * * *'])
  })
})

describe('local test warnings', () => {
  it('warns for bindings wrangler dev cannot emulate', () => {
    const ir: WorkflowIR = {
      ...simpleIR,
      runtime: {
        resources: [
          { name: 'AI', kind: 'ai' },
          { name: 'KV_CACHE', kind: 'kv' },
          { name: 'SERVICE_API', kind: 'service' },
        ],
      },
    }
    const warnings = localDevWarnings(ir)
    expect(warnings).toHaveLength(2)
    expect(warnings.join(' ')).toContain('Workers AI binding "AI"')
    expect(warnings.join(' ')).toContain('service binding "SERVICE_API"')
  })
})

describe('Cloudflare capability requirements', () => {
  const adapter = new CloudflareWorkflowsAdapter()

  it('declares the binding kinds a Worker can be given', () => {
    expect(adapter.supportedBindingKinds).toEqual(
      expect.arrayContaining(['kv', 'd1', 'r2', 'queue', 'service', 'workflow']),
    )
  })

  it('reports a declared binding as a requirement', () => {
    const ir: WorkflowIR = {
      ...simpleIR,
      runtime: { resources: [{ name: 'USERS', kind: 'kv' }] },
    }
    expect(adapter.requirements(ir)).toContainEqual({
      kind: 'binding',
      id: 'kv',
      name: 'USERS',
      label: 'KV namespace "USERS"',
    })
  })

  it('reports bindings declared in a profile or discovered from usage', () => {
    const ir: WorkflowIR = {
      ...simpleIR,
      nodes: [
        {
          ...simpleIR.nodes[0]!,
          data: {
            code: "import { kv } from '#awaitstep/cloudflare'\nreturn kv(env, 'KV_USERS').get('a')",
          },
        },
      ],
      runtime: {
        provider: 'cloudflare',
        files: [
          {
            path: 'providers/cloudflare.ts',
            source: [
              "import { defineCloudflare } from '#awaitstep/cloudflare'",
              'export default defineCloudflare({',
              "  bindings: { DB_MAIN: { kind: 'd1' } },",
              '})',
            ].join('\n'),
          },
        ],
      },
    }
    expect(adapter.requirements(ir)).toEqual(
      expect.arrayContaining([
        {
          kind: 'binding',
          id: 'kv',
          name: 'KV_USERS',
          label: 'KV namespace "KV_USERS"',
          nodeId: 'step-1',
        },
        {
          kind: 'binding',
          id: 'd1',
          name: 'DB_MAIN',
          label: 'D1 database "DB_MAIN"',
          path: 'providers/cloudflare.ts',
        },
      ]),
    )
  })

  it('reports profile diagnostics against the file that carries them', () => {
    const ir: WorkflowIR = {
      ...simpleIR,
      runtime: {
        provider: 'cloudflare',
        files: [
          {
            path: 'providers/cloudflare.ts',
            source: [
              "import { defineCloudflare } from '#awaitstep/cloudflare'",
              'export default defineCloudflare({ bindings: { ...base } })',
            ].join('\n'),
          },
        ],
      },
    }
    const result = adapter.validate(ir)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'runtime.files.providers/cloudflare.ts',
          message: expect.stringContaining('Spreads'),
        }),
      )
    }
  })

  it('reports a sub-workflow binding as a workflow requirement', () => {
    const ir: WorkflowIR = {
      ...simpleIR,
      nodes: [
        ...simpleIR.nodes,
        {
          id: 'sub',
          type: 'sub_workflow',
          name: 'Child',
          position: { x: 0, y: 200 },
          version: '1.0.0',
          provider: 'cloudflare',
          data: { workflowId: 'wf-child', workflowName: 'ChildFlow' },
        },
      ],
      edges: [{ id: 'e1', source: 'step-1', target: 'sub' }],
    }
    expect(adapter.requirements(ir)).toContainEqual({
      kind: 'binding',
      id: 'workflow',
      name: 'CHILD_FLOW',
      label: 'workflow binding "CHILD_FLOW"',
    })
  })
})

describe('Cloudflare template requirements', () => {
  it('classifies a provider import in a custom-node template', () => {
    const withTemplate = new CloudflareWorkflowsAdapter({
      templateResolver: {
        getTemplate: () =>
          'import { env } from "cloudflare:workers"\nexport default async function() {}',
      },
    })
    const ir: WorkflowIR = {
      ...simpleIR,
      nodes: [{ ...simpleIR.nodes[0]!, type: 'custom-thing' }],
    }
    expect(withTemplate.requirements(ir)).toContainEqual(
      expect.objectContaining({ kind: 'provider', id: 'cloudflare' }),
    )
  })
})

describe('Cloudflare script bundle modules', () => {
  const adapter = new CloudflareWorkflowsAdapter()

  const scriptIr: ScriptIR = {
    kind: 'script',
    metadata: { name: 'scriptflow', version: 1, createdAt: '', updatedAt: '' },
    nodes: [
      {
        id: 'call',
        type: 'sub_script',
        name: 'Call function',
        position: { x: 0, y: 0 },
        version: '1.0.0',
        provider: 'cloudflare',
        data: { workerName: 'my-func', url: 'https://invoke/', method: 'POST' },
      },
    ],
    edges: [],
    entryNodeId: 'call',
    trigger: { type: 'http' },
  }

  it('declares a sub-script service binding on the script Env', () => {
    const bundle = adapter.generate(scriptIr)
    expect(bundle.files.find((f) => f.path === 'awaitstep/function.ts')!.source).toContain(
      'MY_FUNC: Fetcher;',
    )
  })

  it('emits the provider module a project file imports', () => {
    const bundle = adapter.generate({
      ...scriptIr,
      runtime: {
        files: [{ path: 'lib/kv.ts', source: "export { kv } from '#awaitstep/cloudflare'" }],
      },
    })
    expect(bundle.files.some((file) => file.path === 'awaitstep/cloudflare.ts')).toBe(true)
  })
})
