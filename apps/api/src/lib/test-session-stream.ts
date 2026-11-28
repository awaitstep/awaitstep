import {
  TestSessionRefusal,
  type StartedTestSessionHandle,
  type TestInstanceSteps,
} from '@awaitstep/codegen'
import type { TestSession } from '@awaitstep/db'
import { testSessionCutoffs } from './test-session-policy.js'
import { stopTestSession, type TestSessionDeps } from './test-sessions.js'

/** How long one stream stays open before the client reconnects. */
export const STREAM_MAX_MS = 5 * 60_000
export const STREAM_TICK_MS = 1_000
/**
 * How often an open stream marks the session used. The reaper's idle window
 * is ten minutes, so once a minute keeps a watched run alive at a sixtieth of
 * the writes a touch per tick made.
 */
export const STREAM_TOUCH_MS = 60_000

/** Statuses an instance does not leave: the stream stops reading it. */
const SETTLED = new Set(['complete', 'errored', 'terminated'])
/**
 * Reads of a settled instance before the stream stops. Its steps are read
 * after its status: a run settles only once its last step record is written,
 * so the read that says settled has them all.
 */
const SETTLED_READS = 1

export interface StreamClock {
  now(): number
  sleep(ms: number): Promise<void>
}

const realClock: StreamClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export interface FollowTestSessionInput {
  deps: TestSessionDeps
  session: TestSession
  userId: string
  handle: StartedTestSessionHandle
  after?: string
  instanceId?: string
  send(event: 'logs' | 'instance' | 'closed', data: unknown): Promise<void>
  isOpen(): boolean
  clock?: StreamClock
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** The runner no longer has the session. */
function isGone(err: unknown): err is TestSessionRefusal {
  return err instanceof TestSessionRefusal && err.status === 410
}

/**
 * The instance event: the runner's status answer, with the steps beside it
 * when the runner keeps them and the instance is this session's.
 */
function instanceEvent(body: unknown, steps: TestInstanceSteps | null | undefined): unknown {
  const record = asRecord(body)
  if (!record || !steps) return body
  return { ...record, steps: steps.steps, ...(steps.incomplete && { stepsIncomplete: true }) }
}

/**
 * Logs, and one instance's status and steps when the client names it, until
 * the client leaves, the stream's time is up, or the session ends.
 *
 * The session is marked used at most once a minute: an open stream is a
 * session in use, and an active run must not be reaped mid-flight. Between
 * touches, a session that has ended shows as the runner's 410.
 */
export async function followTestSession(input: FollowTestSessionInput): Promise<void> {
  const { deps, session, userId, handle, instanceId, send, isOpen } = input
  const clock = input.clock ?? realClock
  const startedAt = clock.now()
  let cursor = input.after
  let lastInstance = ''
  let settledReads = 0
  let lastTouch = Number.NEGATIVE_INFINITY

  const end = async (reason: string) => {
    // `final` is what a client acts on: the wording is for people.
    await send('closed', { final: true, reason })
  }
  const gone = async (err: TestSessionRefusal) => {
    await stopTestSession(deps, session, 'stopped', { error: err.message })
    await end(err.message)
  }

  while (isOpen() && clock.now() - startedAt < STREAM_MAX_MS) {
    if (clock.now() - lastTouch >= STREAM_TOUCH_MS) {
      lastTouch = clock.now()
      const alive = await deps.db.touchTestSession(
        session.id,
        userId,
        testSessionCutoffs(deps.limits),
      )
      if (!alive) return end('Test session is no longer running')
    }

    try {
      const page = await deps.runner.logs(handle, cursor)
      cursor = page.cursor
      if (page.entries.length > 0) await send('logs', { entries: page.entries, cursor })
    } catch (err) {
      if (isGone(err)) return gone(err)
      // A log read failing is not worth ending the stream over; the next
      // tick either recovers or the session shows as gone.
    }

    if (instanceId && settledReads < SETTLED_READS) {
      try {
        const status = await deps.runner.instanceStatus(handle, instanceId)
        const steps = await deps.runner.instanceSteps?.(handle, instanceId)
        const event = instanceEvent(status.body, steps)
        const serialized = JSON.stringify(event)
        if (serialized !== lastInstance) {
          lastInstance = serialized
          await send('instance', event)
        }
        const word = asRecord(status.body)?.['status']
        if (typeof word === 'string' && SETTLED.has(word)) settledReads++
      } catch (err) {
        if (isGone(err)) return gone(err)
        // Same again: report what we can, keep the stream.
      }
    }

    await clock.sleep(STREAM_TICK_MS)
  }

  // Only when the stream ran out of time. Saying "reconnect" after the
  // session died sends the client back for a 410.
  if (isOpen()) {
    await send('closed', { final: false, reason: 'Stream expired — reconnect to continue' })
  }
}
