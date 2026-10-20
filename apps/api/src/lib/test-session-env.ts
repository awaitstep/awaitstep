import type { TestSessionLimits } from './test-session-policy.js'

/** What an entry point reads limits out of. Never read here directly. */
export type EnvSource = Record<string, string | undefined>

const OFF = new Set(['false', '0', 'no', 'off', 'disabled'])

/**
 * Test-session limits as an operator sets them. The caller supplies the
 * environment — `process.env` from a Node entry, the bindings object from the
 * Worker — because app code must not reach for a runtime's own globals.
 *
 * `ENABLE_TEST_SESSIONS` off is the kill switch: it zeroes the caps, which
 * the policy already reads as "no session may start", so the routes keep
 * answering and say why instead of vanishing.
 */
export function testSessionLimitsFromEnv(
  env: EnvSource,
): Partial<Record<keyof TestSessionLimits, number | undefined>> {
  if (isOff(env['ENABLE_TEST_SESSIONS'])) {
    return { maxConcurrentPerUser: 0, maxConcurrentTotal: 0, maxPerWindowPerProject: 0 }
  }
  return {
    idleMs: minutes(env['TEST_SESSION_IDLE_MINUTES']),
    maxLifetimeMs: minutes(env['TEST_SESSION_MAX_MINUTES']),
    startTimeoutMs: minutes(env['TEST_SESSION_START_TIMEOUT_MINUTES']),
    maxConcurrentPerUser: count(env['TEST_SESSION_MAX_PER_USER']),
    maxConcurrentTotal: count(env['TEST_SESSION_MAX_TOTAL']),
    maxPerWindowPerProject: count(env['TEST_SESSION_MAX_PER_PROJECT']),
  }
}

/**
 * Whether a flag reads as off. An operator who writes `FALSE` or `0` means
 * the same thing as `false`, and leaving sessions running because of the
 * spelling is the expensive way to be wrong.
 */
function isOff(value: string | undefined): boolean {
  return value !== undefined && OFF.has(value.trim().toLowerCase())
}

function minutes(value: string | undefined): number | undefined {
  const parsed = count(value)
  return parsed === undefined ? undefined : parsed * 60_000
}

function count(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
