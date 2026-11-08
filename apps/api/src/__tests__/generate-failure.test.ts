import { describe, it, expect, beforeEach, vi } from 'vitest'
import type * as ProviderResolver from '../lib/provider-resolver.js'
import { createTestApp, resetStore, TEST_USER_ID, TEST_PROJECT_ID, mockDb } from './helpers.js'

/**
 * A generator that blows up for a reason it does not blame on its input.
 * Everything else about the provider is real, so the prepare reaches
 * generation the way it normally would.
 */
vi.mock('../lib/provider-resolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProviderResolver>()
  return {
    ...actual,
    resolveProvider: (...args: Parameters<typeof actual.resolveProvider>) => {
      const adapter = actual.resolveProvider(...args)
      return new Proxy(adapter, {
        get(target, property, receiver) {
          if (property === 'generate') {
            return () => {
              throw new TypeError("Cannot read properties of undefined (reading 'kind')")
            }
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
    },
  }
})

const validIR = {
  metadata: {
    name: 'test',
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
      data: { code: 'return 1;' },
    },
  ],
  edges: [],
  entryNodeId: 'step-1',
}

function url(path: string) {
  return `${path}${path.includes('?') ? '&' : '?'}projectId=${TEST_PROJECT_ID}`
}

describe('a generator that fails for its own reasons', () => {
  let app: ReturnType<typeof createTestApp>

  beforeEach(async () => {
    resetStore()
    app = createTestApp()
    await mockDb.createWorkflow({
      id: 'wf-1',
      projectId: TEST_PROJECT_ID,
      createdBy: TEST_USER_ID,
      name: 'Test',
    })
    const version = await mockDb.createVersion({
      id: 'v-1',
      workflowId: 'wf-1',
      ir: JSON.stringify(validIR),
    })
    await mockDb.updateWorkflow('wf-1', { currentVersionId: version.id })
  })

  it('is a 500 from the check, not a problem with the workflow', async () => {
    // Reported as `ok: false` with an `ir` diagnostic, an agent would go
    // looking for the mistake in its own files — and the exception would
    // never reach a log or an error rate.
    const res = await app.request(url('/api/workflows/wf-1/source/check'), { method: 'POST' })
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; ok?: boolean }
    expect(body.ok).toBeUndefined()
  })

  it('does not run provider generation for a presentation read', async () => {
    // The provider generator still throws (the check above proves it), but
    // the IDE/source view is the portable module and never invokes it.
    const res = await app.request(url('/api/workflows/wf-1/source'))
    expect(res.status).toBe(200)
  })
})
