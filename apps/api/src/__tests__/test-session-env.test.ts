import { describe, it, expect } from 'vitest'
import { testSessionLimitsFromEnv } from '../lib/test-session-env.js'
import { resolveTestSessionLimits, containerSleepAfter } from '../lib/test-session-policy.js'

describe('testSessionLimitsFromEnv', () => {
  it('reads nothing from an empty environment', () => {
    expect(testSessionLimitsFromEnv({})).toEqual({
      idleMs: undefined,
      maxLifetimeMs: undefined,
      startTimeoutMs: undefined,
      maxConcurrentPerUser: undefined,
      maxConcurrentTotal: undefined,
      maxPerWindowPerProject: undefined,
    })
  })

  it('reads windows in minutes and caps as counts', () => {
    const limits = testSessionLimitsFromEnv({
      TEST_SESSION_IDLE_MINUTES: '15',
      TEST_SESSION_MAX_MINUTES: '45',
      TEST_SESSION_MAX_PER_USER: '3',
      TEST_SESSION_MAX_TOTAL: '20',
    })
    expect(limits.idleMs).toBe(15 * 60_000)
    expect(limits.maxLifetimeMs).toBe(45 * 60_000)
    expect(limits.maxConcurrentPerUser).toBe(3)
    expect(limits.maxConcurrentTotal).toBe(20)
  })

  it.each(['false', 'FALSE', 'False', '0', 'no', 'off', ' off '])(
    'treats %s as the kill switch',
    (value) => {
      // Leaving sessions running because of the spelling is the expensive
      // way to be wrong.
      const limits = testSessionLimitsFromEnv({ ENABLE_TEST_SESSIONS: value })
      expect(limits.maxConcurrentPerUser).toBe(0)
      expect(limits.maxConcurrentTotal).toBe(0)
      expect(limits.maxPerWindowPerProject).toBe(0)
    },
  )

  it('leaves sessions on for anything that is not a negative', () => {
    for (const value of ['true', '1', 'yes', undefined]) {
      const limits = testSessionLimitsFromEnv(
        value === undefined ? {} : { ENABLE_TEST_SESSIONS: value },
      )
      expect(limits.maxConcurrentPerUser, String(value)).toBeUndefined()
    }
  })

  it('ignores values that are not numbers', () => {
    expect(
      testSessionLimitsFromEnv({ TEST_SESSION_IDLE_MINUTES: 'soon', TEST_SESSION_MAX_TOTAL: '' })
        .idleMs,
    ).toBeUndefined()
  })
})

describe('containerSleepAfter', () => {
  it('outlasts the longest window a session can use', () => {
    // A container asleep behind a live session leaves the API proxying into
    // nothing, so this has to follow the limits rather than be a constant.
    const limits = resolveTestSessionLimits({ idleMs: 60 * 60_000 })
    expect(containerSleepAfter(limits)).toBe('65m')
  })

  it('follows the default limits', () => {
    expect(containerSleepAfter(resolveTestSessionLimits())).toBe('65m')
  })
})
