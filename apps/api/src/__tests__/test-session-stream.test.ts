import { describe, it, expect, beforeEach } from 'vitest'
import { TestSessionRefusal } from '@awaitstep/codegen'
import type { TestSession } from '@awaitstep/db'
import { FakeTestSessionRunner, mockDb, resetStore } from './helpers.js'
import {
  followTestSession,
  STREAM_MAX_MS,
  STREAM_TICK_MS,
  type StreamClock,
} from '../lib/test-session-stream.js'
import { resolveTestSessionLimits } from '../lib/test-session-policy.js'
import type { TestSessionDeps } from '../lib/test-sessions.js'

/** A clock that moves only when the stream sleeps. */
function fakeClock(): StreamClock & { at: number } {
  return {
    at: 0,
    now() {
      return this.at
    },
    async sleep(ms: number) {
      this.at += ms
    },
  }
}

const session = { id: 'sess-1', status: 'running' } as TestSession
const handle = { sessionId: 'sess-1', containerId: 'fake-sess-1', processId: 'p', port: 1 }

describe('followTestSession', () => {
  let runner: FakeTestSessionRunner
  let touches: number
  let alive: boolean
  let deps: TestSessionDeps
  let sent: { event: string; data: unknown }[]

  beforeEach(() => {
    resetStore()
    runner = new FakeTestSessionRunner()
    touches = 0
    alive = true
    sent = []
    deps = {
      db: {
        ...mockDb,
        touchTestSession: async () => {
          touches++
          return alive
        },
        markTestSessionStopped: async () => {},
      } as unknown as TestSessionDeps['db'],
      runner,
      limits: resolveTestSessionLimits(),
    }
  })

  function follow(options: { instanceId?: string; until?: number } = {}) {
    const clock = fakeClock()
    return followTestSession({
      deps,
      session,
      userId: 'u-1',
      handle,
      ...(options.instanceId && { instanceId: options.instanceId }),
      send: async (event, data) => {
        sent.push({ event, data })
      },
      isOpen: () => clock.at < (options.until ?? Number.POSITIVE_INFINITY),
      clock,
    })
  }

  it('marks the session used at most once a minute while a panel stays open', async () => {
    await follow({ until: 3 * 60_000 })
    // Three minutes of one-second ticks: a touch at 0, 1 and 2 minutes, never one per tick.
    expect(touches).toBeLessThanOrEqual(4)
    expect(touches).toBeGreaterThanOrEqual(3)
  })

  it('ends for good when the touch finds the session gone', async () => {
    alive = false
    await follow()
    expect(sent).toEqual([
      { event: 'closed', data: { final: true, reason: 'Test session is no longer running' } },
    ])
  })

  it('ends for good, and records it, when the runner no longer has the session between touches', async () => {
    runner.logs = async () => {
      throw new TestSessionRefusal('This test session has ended.', 410)
    }
    await follow()
    expect(sent.at(-1)).toEqual({
      event: 'closed',
      data: { final: true, reason: 'This test session has ended.' },
    })
    expect(runner.stopped).toEqual(['sess-1'])
  })

  it('asks the client to reconnect when the stream runs out of time', async () => {
    await follow()
    expect(sent.at(-1)).toEqual({
      event: 'closed',
      data: { final: false, reason: 'Stream expired — reconnect to continue' },
    })
  })

  it('sends the instance’s steps beside its status, and only when something changed', async () => {
    runner.instanceBody = { status: 'running' }
    let reads = 0
    runner.instanceSteps = async () => {
      reads++
      return {
        steps: [
          {
            name: 'send',
            kind: 'do' as const,
            index: 1,
            status: reads > 2 ? ('complete' as const) : ('running' as const),
            attemptCount: 1,
          },
        ],
      }
    }
    await follow({ instanceId: 'inst-1', until: 5 * STREAM_TICK_MS })
    const instances = sent.filter((item) => item.event === 'instance').map((item) => item.data)
    expect(instances).toEqual([
      { status: 'running', steps: [expect.objectContaining({ status: 'running' })] },
      { status: 'running', steps: [expect.objectContaining({ status: 'complete' })] },
    ])
  })

  it('says when earlier steps were not kept', async () => {
    runner.instanceBody = { status: 'running' }
    runner.instanceSteps = async () => ({ steps: [], incomplete: true })
    await follow({ instanceId: 'inst-1', until: STREAM_TICK_MS })
    expect(sent.find((item) => item.event === 'instance')?.data).toEqual({
      status: 'running',
      steps: [],
      stepsIncomplete: true,
    })
  })

  it('stops reading an instance once it has settled', async () => {
    runner.instanceBody = { status: 'complete' }
    await follow({ instanceId: 'inst-1', until: STREAM_MAX_MS })
    expect(runner.instanceStatusCalls).toBe(1)
  })

  // A run settles only after its last step record is written, so steps read after it are whole.
  it('reads an instance’s steps after its status, never beside it', async () => {
    const order: string[] = []
    runner.instanceBody = { status: 'complete' }
    const status = runner.instanceStatus.bind(runner)
    runner.instanceStatus = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      order.push('status')
      return status(...args)
    }
    runner.instanceSteps = async () => {
      order.push('steps')
      return { steps: [] }
    }
    await follow({ instanceId: 'inst-1', until: STREAM_MAX_MS })
    expect(order).toEqual(['status', 'steps'])
  })
})
