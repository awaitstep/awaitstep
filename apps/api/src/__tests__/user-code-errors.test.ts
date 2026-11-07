import { describe, it, expect, beforeEach } from 'vitest'
import { createTestApp, resetStore, TEST_USER_ID, TEST_PROJECT_ID, mockDb } from './helpers.js'

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

describe('a mistake in code the user wrote', () => {
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
  })

  // Two @fetch handlers in one file: the generator refuses, and it is the
  // file that is wrong, not the generator. Before these were classed as
  // input errors they came back as a 500 — so an agent fixing its own
  // handlers.ts was told the server had broken.
  const twoFetchHandlers = [
    '@fetch function handler(request, env) { return new Response("a") }',
    '@fetch function other(request, env) { return new Response("b") }',
  ].join('\n')

  async function seed() {
    const saved = await app.request(url('/api/workflows/wf-1/versions'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ir: validIR }),
    })
    expect(saved.status).toBe(201)
    // These tests model the legacy annotation file, which cannot sit beside
    // the HTTP entry a fresh first save seeds: drop the seeded module first.
    await app.request(url('/api/workflows/wf-1/files/handlers/fetch.ts'), { method: 'DELETE' })
    const put = await app.request(url('/api/workflows/wf-1/files/handlers.ts'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: twoFetchHandlers }),
    })
    expect(put.status).toBe(201)
  }

  it('is a finding the check reports, not a 500', async () => {
    await seed()
    const res = await app.request(url('/api/workflows/wf-1/source/check'), { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      diagnostics: { source: string; message: string; path?: string }[]
    }
    expect(body.ok).toBe(false)
    const problem = body.diagnostics.find((d) => d.message.includes('@fetch'))
    expect(problem).toBeDefined()
    // It names the file, so an editor can open it. Without a path the
    // diagnostic arrives as an `ir` problem with nothing to point at.
    expect(problem).toMatchObject({ source: 'ir', path: 'handlers.ts' })
    expect(problem!.message).toMatch(/line \d+/)
  })

  it('still lets the workspace open, with the problem attached', async () => {
    await seed()
    const res = await app.request(url('/api/workflows/wf-1/source'))
    // No bundle to show, but a 4xx naming the file — never a 500.
    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain('@fetch')
  })
})
