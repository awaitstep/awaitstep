import type { TestSessionCutoffs, TestSessionExpiry, TestSessionUsage } from '@awaitstep/db'

/**
 * Cost controls for test sessions. Containers are billed to us, not to the
 * user's Cloudflare account, so every session is time-boxed and counted.
 */
export interface TestSessionLimits {
  /** Idle time before a session is reaped. */
  idleMs: number
  /** Hard ceiling regardless of activity, so a polled session cannot live forever. */
  maxLifetimeMs: number
  /** How long a session may stay `starting` before its container is written off. */
  startTimeoutMs: number
  /** Live sessions one user may hold across every project. Zero disables starts. */
  maxConcurrentPerUser: number
  /**
   * Live sessions everyone may hold together. Containers come from a fixed
   * pool shared with deploys, so without this a few users each holding one
   * can leave nothing to deploy with.
   */
  maxConcurrentTotal: number
  /** Sessions a project may start inside `quotaWindowMs`. Zero disables starts. */
  maxPerWindowPerProject: number
  quotaWindowMs: number
}

export const DEFAULT_TEST_SESSION_LIMITS: TestSessionLimits = {
  idleMs: 10 * 60_000,
  maxLifetimeMs: 60 * 60_000,
  startTimeoutMs: 5 * 60_000,
  maxConcurrentPerUser: 1,
  maxConcurrentTotal: 10,
  maxPerWindowPerProject: 50,
  quotaWindowMs: 24 * 60 * 60_000,
}

// Bounds an operator override cannot cross — a 10-day session is never
// intended. The caps accept zero so configuration can stop all new sessions
// without a deploy; the durations cannot be zeroed, since a zero window would
// reap every session on its first check.
const BOUNDS = {
  idleMs: { min: 60_000, max: 60 * 60_000 },
  maxLifetimeMs: { min: 5 * 60_000, max: 8 * 60 * 60_000 },
  startTimeoutMs: { min: 30_000, max: 30 * 60_000 },
  maxConcurrentPerUser: { min: 0, max: 10 },
  maxConcurrentTotal: { min: 0, max: 50 },
  maxPerWindowPerProject: { min: 0, max: 10_000 },
  quotaWindowMs: { min: 60_000, max: 7 * 24 * 60 * 60_000 },
} as const satisfies Record<keyof TestSessionLimits, { min: number; max: number }>

// Only an exact 0 disables test sessions. Anything else positive resolves to
// at least one session: rounding 0.4 down, or clamping a negative "unlimited"
// up from below, would switch sessions off for everyone from a value nobody
// meant that way.
function resolveCap(value: number, bounds: { min: number; max: number }): number | null {
  if (value === 0) return 0
  if (value < 0) return null
  return Math.min(bounds.max, Math.max(1, Math.round(value)))
}

function resolveDuration(value: number, bounds: { min: number; max: number }): number | null {
  if (value <= 0) return null
  return Math.min(bounds.max, Math.max(bounds.min, Math.floor(value)))
}

const CAP_KEYS = new Set<keyof TestSessionLimits>([
  'maxConcurrentPerUser',
  'maxConcurrentTotal',
  'maxPerWindowPerProject',
])

/**
 * Applies operator overrides (environment config) over the defaults, ignoring
 * anything unusable and clamping the rest. Never throws: a bad value falls
 * back to the default rather than taking the API down at boot. A cap of zero
 * is honoured — that is the kill-switch.
 */
export function resolveTestSessionLimits(
  overrides?: Partial<Record<keyof TestSessionLimits, number | undefined>>,
): TestSessionLimits {
  const resolved = { ...DEFAULT_TEST_SESSION_LIMITS }
  if (!overrides) return resolved
  for (const key of Object.keys(BOUNDS) as (keyof TestSessionLimits)[]) {
    const value = overrides[key]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    // In-range values are clamped rather than discarded: silently
    // substituting the default for "5 seconds" leaves an operator with ten
    // minutes and no indication the setting did nothing. A value that cannot
    // be honoured at all falls back to the default instead of to zero.
    const applied = CAP_KEYS.has(key)
      ? resolveCap(value, BOUNDS[key])
      : resolveDuration(value, BOUNDS[key])
    if (applied !== null) resolved[key] = applied
  }
  // A lifetime below the idle window would reap sessions before they go idle,
  // and one below the start timeout would expire a slow start on arrival.
  resolved.maxLifetimeMs = Math.max(
    resolved.maxLifetimeMs,
    resolved.idleMs,
    resolved.startTimeoutMs,
  )
  return resolved
}

export function expiryMessage(expiry: Exclude<TestSessionExpiry, null>): string {
  switch (expiry) {
    case 'idle':
      return 'Test session stopped after being idle'
    case 'lifetime':
      return 'Test session reached its maximum lifetime'
    case 'start-timeout':
      return 'Test session never finished starting'
  }
}

/**
 * The instants that separate live sessions from expired ones. Queries use
 * these from both sides — live is strictly after, expired is at or before —
 * so TTL lives here and never in a stored column.
 */
export function testSessionCutoffs(
  limits: TestSessionLimits,
  now: number = Date.now(),
): TestSessionCutoffs {
  return {
    idle: new Date(now - limits.idleMs).toISOString(),
    started: new Date(now - limits.maxLifetimeMs).toISOString(),
    starting: new Date(now - limits.startTimeoutMs).toISOString(),
  }
}

/**
 * How long a session's container may idle before the platform sleeps it.
 * It has to outlast the session itself — a container asleep behind a live
 * session leaves the API proxying into nothing — so it follows the limits
 * rather than being a constant that quietly stops matching them.
 */
export function containerSleepAfter(limits: TestSessionLimits): string {
  const longest = Math.max(limits.idleMs, limits.maxLifetimeMs, limits.startTimeoutMs)
  return `${Math.ceil(longest / 60_000) + 5}m`
}

/** When the quota window opened — the lower bound for a usage count. */
export function quotaWindowStart(limits: TestSessionLimits, now: number = Date.now()): string {
  return new Date(now - limits.quotaWindowMs).toISOString()
}

export type TestSessionStartRefusal = {
  limit: 'concurrency' | 'capacity' | 'quota' | 'disabled' | 'race'
  error: string
}

/**
 * Explains a reservation the database refused. The caps ride inside the
 * reservation statement, so this runs *after* it and only to produce a
 * message — reading usage first would be a second round trip that decides
 * nothing. Concurrency is reported before quota: it is the limit a user can
 * resolve themselves by stopping the session they already have.
 */
export function testSessionStartRefusal(
  usage: TestSessionUsage,
  limits: TestSessionLimits,
): TestSessionStartRefusal {
  if (
    limits.maxConcurrentPerUser === 0 ||
    limits.maxConcurrentTotal === 0 ||
    limits.maxPerWindowPerProject === 0
  ) {
    return { limit: 'disabled', error: 'Test sessions are currently disabled' }
  }
  if (usage.activeForUser >= limits.maxConcurrentPerUser) {
    return {
      limit: 'concurrency',
      error:
        limits.maxConcurrentPerUser === 1
          ? 'You already have a test session running — stop it before starting another'
          : `You already have ${limits.maxConcurrentPerUser} test sessions running`,
    }
  }
  if (usage.activeEverywhere >= limits.maxConcurrentTotal) {
    return {
      limit: 'capacity',
      error: 'All test session capacity is in use — try again in a few minutes',
    }
  }
  if (usage.createdInWindow >= limits.maxPerWindowPerProject) {
    return {
      limit: 'quota',
      error: 'This project has reached its test-session quota — try again later',
    }
  }
  // Neither cap is full now, so the reservation lost a race — telling the
  // user their quota is spent would be a lie they cannot act on.
  return { limit: 'race', error: 'Could not start a test session — try again' }
}
