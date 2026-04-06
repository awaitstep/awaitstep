import { describe, it, expect, vi } from 'vitest'
import type { WorkflowIR } from '@awaitstep/ir'
import type { ProviderConfig } from '@awaitstep/codegen'
import { CloudflareWorkflowsAdapter } from '../adapter.js'
import { deployWithWrangler } from '../deploy.js'

vi.mock('../deploy.js', () => ({
  deployWithWrangler: vi.fn().mockResolvedValue({
    success: true,
    workerName: 'awaitstep-test-workflow',
    stdout: 'deployed',
  }),
}))

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
  provider: 'cloudflare-workflows',
  credentials: { accountId: 'acc123', apiToken: 'tok123' },
  options: { workflowId: 'test-workflow', workflowName: 'test-workflow' },
}

describe('CloudflareWorkflowsAdapter', () => {
  const adapter = new CloudflareWorkflowsAdapter()

  it('has the correct name', () => {
    expect(adapter.name).toBe('cloudflare-workflows')
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
      const artifact = adapter.generate(simpleIR)
      expect(artifact.filename).toBe('worker.ts')
      expect(artifact.source).toContain('WorkflowEntrypoint')
      expect(artifact.source).toContain('class TestWorkflow')
      expect(artifact.source).toContain('step.do("Hello"')
    })

    it('uses default trigger code when no triggerCode provided', () => {
      const artifact = adapter.generate(simpleIR)
      expect(artifact.source).toContain('const params = await request.json()')
      expect(artifact.source).toContain('env.WORKFLOW.create({ params })')
    })

    it('uses custom triggerCode from config options', () => {
      const customTrigger =
        'const { name } = await request.json();\nconst instance = await env.WORKFLOW.create({ name });\nreturn Response.json({ instanceId: instance.id });'
      const config: ProviderConfig = {
        provider: 'cloudflare-workflows',
        credentials: {},
        options: { triggerCode: customTrigger },
      }
      const artifact = adapter.generate(simpleIR, config)
      expect(artifact.source).toContain('const { name } = await request.json()')
      expect(artifact.source).toContain('env.WORKFLOW.create({ name })')
      expect(artifact.source).not.toContain('env.WORKFLOW.create({ params })')
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

    it('passes routes from deployConfig to deployWithWrangler', async () => {
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
      const call = vi.mocked(deployWithWrangler).mock.lastCall!
      const deployOpts = call[1]
      expect(deployOpts.routes).toEqual([
        { pattern: 'example.com/my-workflow/*', zone_name: 'example.com' },
        { pattern: 'example.com/my-workflow*', zone_name: 'example.com' },
      ])
    })

    it('omits routes when deployConfig has no route', async () => {
      const artifact = adapter.generate(simpleIR)
      await adapter.deploy(artifact, providerConfig)
      const call = vi.mocked(deployWithWrangler).mock.lastCall!
      const deployOpts = call[1]
      expect(deployOpts.routes).toBeUndefined()
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
      const call = vi.mocked(deployWithWrangler).mock.lastCall!
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
