import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TEST_SESSION_LIMITS,
  expiryMessage,
  quotaWindowStart,
  resolveTestSessionLimits,
  testSessionCutoffs,
  testSessionStartRefusal,
  type TestSessionLimits,
} from '../lib/test-session-policy.js'

const NOW = Date.parse('2026-10-19T12:00:00.000Z')
const limits: TestSessionLimits = {
  idleMs: 10 * 60_000,
  maxLifetimeMs: 60 * 60_000,
  startTimeoutMs: 5 * 60_000,
  maxConcurrentPerUser: 1,
  maxConcurrentTotal: 5,
  maxPerWindowPerProject: 3,
  quotaWindowMs: 24 * 60 * 60_000,
}

describe('resolveTestSessionLimits', () => {
  it('returns the defaults when there is nothing to override', () => {
    expect(resolveTestSessionLimits()).toEqual(DEFAULT_TEST_SESSION_LIMITS)
    expect(resolveTestSessionLimits({})).toEqual(DEFAULT_TEST_SESSION_LIMITS)
  })

  it('applies usable overrides and ignores values that are not numbers', () => {
    const resolved = resolveTestSessionLimits({
      idleMs: 5 * 60_000,
      maxConcurrentPerUser: 3,
      maxPerWindowPerProject: Number.NaN,
      quotaWindowMs: Number.POSITIVE_INFINITY,
    })
    expect(resolved.idleMs).toBe(5 * 60_000)
    expect(resolved.maxConcurrentPerUser).toBe(3)
    expect(resolved.maxPerWindowPerProject).toBe(DEFAULT_TEST_SESSION_LIMITS.maxPerWindowPerProject)
    expect(resolved.quotaWindowMs).toBe(DEFAULT_TEST_SESSION_LIMITS.quotaWindowMs)
  })

  it('clamps a too-small positive value instead of discarding it', () => {
    // Substituting the default for "5 seconds" would leave an operator with
    // ten minutes and no sign their setting did nothing.
    const resolved = resolveTestSessionLimits({ idleMs: 5_000 })
    expect(resolved.idleMs).toBe(60_000)
  })

  it('rounds a fractional cap rather than flooring it to zero', () => {
    // 0.5 flooring to 0 would switch test sessions off for everyone.
    expect(resolveTestSessionLimits({ maxConcurrentPerUser: 0.5 }).maxConcurrentPerUser).toBe(1)
    expect(resolveTestSessionLimits({ maxPerWindowPerProject: 2.4 }).maxPerWindowPerProject).toBe(2)
  })

  it('honours a cap of zero as a kill-switch', () => {
    expect(resolveTestSessionLimits({ maxConcurrentPerUser: 0 }).maxConcurrentPerUser).toBe(0)
    expect(resolveTestSessionLimits({ maxPerWindowPerProject: 0 }).maxPerWindowPerProject).toBe(0)
  })

  it('never lets a duration reach zero, which would expire everything at once', () => {
    // Zero is meaningless for a window, so it falls back rather than clamping
    // to a minute the operator never asked for.
    expect(resolveTestSessionLimits({ idleMs: 0 }).idleMs).toBe(DEFAULT_TEST_SESSION_LIMITS.idleMs)
    expect(resolveTestSessionLimits({ startTimeoutMs: 0 }).startTimeoutMs).toBe(
      DEFAULT_TEST_SESSION_LIMITS.startTimeoutMs,
    )
  })

  it('keeps the lifetime above the start timeout', () => {
    // Otherwise a slow start activates already past its lifetime and is
    // reaped on the user's first poll.
    const resolved = resolveTestSessionLimits({
      maxLifetimeMs: 5 * 60_000,
      startTimeoutMs: 600_000,
    })
    expect(resolved.maxLifetimeMs).toBeGreaterThanOrEqual(resolved.startTimeoutMs)
  })

  it('never turns sessions off from a value nobody meant as off', () => {
    // -1 reads as "unlimited" to an operator and 0.4 as "some"; clamping
    // either down to 0 would refuse every start.
    expect(resolveTestSessionLimits({ maxConcurrentPerUser: -1 }).maxConcurrentPerUser).toBe(
      DEFAULT_TEST_SESSION_LIMITS.maxConcurrentPerUser,
    )
    expect(resolveTestSessionLimits({ maxConcurrentPerUser: 0.4 }).maxConcurrentPerUser).toBe(1)
    expect(resolveTestSessionLimits({ idleMs: -5 }).idleMs).toBe(DEFAULT_TEST_SESSION_LIMITS.idleMs)
  })

  it('clamps overrides to their bounds instead of trusting them', () => {
    const resolved = resolveTestSessionLimits({
      idleMs: 30 * 24 * 60 * 60_000,
      maxConcurrentPerUser: 500,
    })
    expect(resolved.idleMs).toBe(60 * 60_000)
    expect(resolved.maxConcurrentPerUser).toBe(10)
  })

  it('never leaves a lifetime shorter than the idle window', () => {
    const resolved = resolveTestSessionLimits({ idleMs: 30 * 60_000, maxLifetimeMs: 5 * 60_000 })
    expect(resolved.maxLifetimeMs).toBe(resolved.idleMs)
  })
})

describe('cut-offs and windows', () => {
  it('derives every cut-off from the limits', () => {
    expect(testSessionCutoffs(limits, NOW)).toEqual({
      idle: '2026-10-19T11:50:00.000Z',
      started: '2026-10-19T11:00:00.000Z',
      starting: '2026-10-19T11:55:00.000Z',
    })
  })

  it('opens the quota window a full window back', () => {
    expect(quotaWindowStart(limits, NOW)).toBe('2026-10-18T12:00:00.000Z')
  })

  it('explains every reason a session stopped', () => {
    expect(expiryMessage('idle')).toMatch(/idle/i)
    expect(expiryMessage('lifetime')).toMatch(/lifetime/i)
    expect(expiryMessage('start-timeout')).toMatch(/starting/i)
  })
})

describe('testSessionStartRefusal', () => {
  it('reports the concurrency limit a user can clear themselves', () => {
    const refusal = testSessionStartRefusal(
      { activeForUser: 1, activeEverywhere: 1, createdInWindow: 0 },
      limits,
    )
    expect(refusal.limit).toBe('concurrency')
    expect(refusal.error).toContain('stop it')
  })

  it('names the limit when more than one session is allowed', () => {
    const refusal = testSessionStartRefusal(
      { activeForUser: 2, activeEverywhere: 2, createdInWindow: 0 },
      { ...limits, maxConcurrentPerUser: 2 },
    )
    expect(refusal.error).toContain('2 test sessions')
  })

  it('reports a spent project quota', () => {
    expect(
      testSessionStartRefusal({ activeForUser: 0, activeEverywhere: 0, createdInWindow: 3 }, limits)
        .limit,
    ).toBe('quota')
  })

  it('reports concurrency first when both limits are reached', () => {
    expect(
      testSessionStartRefusal({ activeForUser: 1, activeEverywhere: 1, createdInWindow: 3 }, limits)
        .limit,
    ).toBe('concurrency')
  })

  it('says sessions are disabled when a cap is zeroed', () => {
    for (const zeroed of [
      { ...limits, maxConcurrentPerUser: 0 },
      { ...limits, maxPerWindowPerProject: 0 },
    ]) {
      const refusal = testSessionStartRefusal(
        { activeForUser: 0, activeEverywhere: 0, createdInWindow: 0 },
        zeroed,
      )
      expect(refusal.limit).toBe('disabled')
      expect(refusal.error).toContain('disabled')
    }
  })

  it('does not blame a full quota when the reservation lost a race', () => {
    // Both caps have room, so the refusal came from the unique index, not a
    // limit — telling the user their quota is spent would be a lie.
    const refusal = testSessionStartRefusal(
      { activeForUser: 0, activeEverywhere: 0, createdInWindow: 0 },
      limits,
    )
    expect(refusal.limit).toBe('race')
    expect(refusal.error).toContain('try again')
  })
})
