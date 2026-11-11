import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { useOrgStore } from '../../stores/org-store'
import { useDeployStream } from '../use-deploy-stream'

// What the Deploy page reads from a deploy: where it got to, when it started
// and ended, and — for a failure — whether the server said so or the page
// simply lost the stream (then it may still be deploying).

function sse(events: unknown[], { close = true } = {}): Response {
  const encoder = new TextEncoder()
  const chunks = events.map((event) => {
    const name = (event as { stage?: string }).stage ? 'progress' : 'result'
    return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(event)}\n\n`)
  })
  // One chunk a read; then the end, or the connection dropping.
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks.shift()
      if (next) controller.enqueue(next)
      else if (close) controller.close()
      else controller.error(new TypeError('network error'))
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

async function deploy(response: Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response)),
  )
  const hook = renderHook(() => useDeployStream({ workflowId: 'wf-1' }), { wrapper })
  await act(() => hook.result.current.startDeploy('c-1', {}))
  return hook.result.current
}

beforeEach(() => {
  client = new QueryClient()
  useOrgStore.setState({ activeOrganizationId: 'org-1', activeProjectId: 'p-1' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useDeployStream', () => {
  it('keeps the last real stage, and the start and end, of a deploy that went live', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const done = await deploy(
      sse([
        { stage: 'INITIALIZING', message: '', progress: 5 },
        { stage: 'DEPLOYING', message: '', progress: 65 },
        { stage: 'COMPLETED', message: '', progress: 100 },
        { success: true, deploymentId: 'd', url: 'https://x.workers.dev' },
      ]),
    )
    expect(done.state).toBe('success')
    expect(done.reachedStage).toBe('COMPLETED')
    expect(done.startedAt).not.toBeNull()
    expect(done.finishedAt).toBeGreaterThanOrEqual(done.startedAt!)
    // A deploy stores the settings it went out with: Deploy reads them again.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['deploy-config', 'wf-1'] })
  })

  it('keeps the stage before FAILED, and says the server ended it', async () => {
    const done = await deploy(
      sse([
        { stage: 'CREATING_WORKER', message: '', progress: 55 },
        { stage: 'FAILED', message: 'Authentication error', progress: 0 },
      ]),
    )
    expect(done.state).toBe('error')
    expect(done.reachedStage).toBe('CREATING_WORKER')
    expect(done.failure).toBe('server')
    expect(done.error).toBe('Authentication error')
  })

  it('counts a refusal before the stream as the server’s answer', async () => {
    const done = await deploy(
      new Response(JSON.stringify({ error: 'Invalid deployment config' }), { status: 422 }),
    )
    expect(done.failure).toBe('server')
    expect(done.error).toContain('Invalid deployment config')
  })

  it('treats a dropped stream as unknown, not as failed or live', async () => {
    const dropped = await deploy(
      sse([{ stage: 'GENERATING_CODE', message: '', progress: 15 }], { close: false }),
    )
    expect(dropped.state).toBe('error')
    expect(dropped.failure).toBe('connection')
    expect(dropped.reachedStage).toBe('GENERATING_CODE')

    // A stream that just ends, with no result, doesn't say it went live either.
    const ended = await deploy(sse([{ stage: 'DEPLOYING', message: '', progress: 65 }]))
    expect(ended.state).toBe('error')
    expect(ended.failure).toBe('connection')
  })
})
