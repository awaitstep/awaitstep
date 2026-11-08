import type { Context } from 'hono'
import type { CredentialsInspection, InspectOptions, WorkflowProvider } from '@awaitstep/codegen'
import { TOKEN_CHECKS_PER_TICK, TOKEN_RECHECK_MS } from '@awaitstep/ir'
import type { Connection, ConnectionTokenCheck, DatabaseAdapter } from '@awaitstep/db'
import type { AppEnv } from '../types.js'
import { createLogger } from './logger.js'
import { resolveProvider } from './provider-resolver.js'
import { providerIds } from './provider-registry.js'
import { noticeGroup, sendNotice } from './notify.js'
import { abandonVerifyGate, closeVerifyGate, openVerifyGate } from './verify-lockout.js'

const log = createLogger('connection-token')

/** The provider's display name: what lockout audit rows and messages say. */
export function providerLabel(provider: string): string {
  return providerNamed(provider)?.capabilities?.label ?? provider
}

/** The provider by name, or null when this build has none by that name. */
export function providerNamed(provider: string): WorkflowProvider | null {
  try {
    return resolveProvider(provider)
  } catch {
    return null
  }
}

export type GatedCheck =
  | { ok: true; inspection: CredentialsInspection; token: ConnectionTokenCheck }
  | { ok: false; response: Response }

/**
 * Asks the provider about credentials behind the SA-12 lockout — every
 * check is a token probe, whichever route makes it. A token the provider
 * refuses answers `400` on the token field; one that works but can't reach
 * the account named answers `400` on the account field; a provider that
 * couldn't be asked answers `502` and counts as no attempt.
 */
export async function checkCredentialsGated(
  c: Context<AppEnv>,
  provider: WorkflowProvider,
  credentials: Record<string, string>,
  options?: InspectOptions,
): Promise<GatedCheck> {
  const label = providerLabel(provider.name)
  if (!provider.inspectCredentials) {
    return {
      ok: true,
      inspection: { status: 'unknown', expiresAt: null, accounts: [], accountReachable: null },
      token: { status: 'unchecked', expiresAt: null, checkedAt: null },
    }
  }
  const gate = await openVerifyGate(c, label)
  if (gate instanceof Response) return { ok: false, response: gate }
  let inspection: CredentialsInspection
  try {
    // A person's check: a refusal stays a refusal (security review L4).
    inspection = await provider.inspectCredentials(credentials, {
      ...options,
      settleRefusals: true,
    })
  } catch (error) {
    await abandonVerifyGate(c, gate)
    throw error
  }
  if (inspection.status === 'unknown') {
    await abandonVerifyGate(c, gate)
    return {
      ok: false,
      response: c.json(
        { error: `Couldn’t reach ${label} to check the token. Try again in a minute.` },
        502,
      ),
    }
  }
  await closeVerifyGate(c, gate, label, inspection.status === 'active')
  if (inspection.status === 'invalid') {
    return {
      ok: false,
      response: c.json(
        { error: `${label} doesn’t accept this token, or it has expired`, field: 'token' },
        400,
      ),
    }
  }
  // Null: no account named, or Cloudflare didn't say — nothing to refuse on.
  if (inspection.accountReachable === false) {
    return {
      ok: false,
      response: c.json({ error: 'This token can’t reach that account', field: 'accountId' }, 400),
    }
  }
  return {
    ok: true,
    inspection,
    token: {
      status: 'active',
      expiresAt: inspection.expiresAt,
      checkedAt: new Date().toISOString(),
    },
  }
}

/**
 * The daily re-check (D-B9-5): Cloudflare connections never checked or
 * checked over a day ago, a bounded batch per tick, oldest first. A token
 * found dead tells whoever can replace it, once per time it is found so. A
 * provider that couldn't be asked changes nothing — the row stays due.
 * How many checks were stored.
 */
export async function recheckConnectionTokens(
  db: DatabaseAdapter,
  now = new Date(),
): Promise<number> {
  const checkedAt = now.toISOString()
  const dueSince = new Date(now.getTime() - TOKEN_RECHECK_MS).toISOString()
  let stored = 0
  for (const id of providerIds()) {
    const provider = providerNamed(id)
    if (!provider?.inspectCredentials) continue
    const due = await db.connectionsDueForTokenCheck(provider.name, dueSince, TOKEN_CHECKS_PER_TICK)
    // Each row on its own: one failing write never costs the others their check.
    const results = await Promise.all(
      due.map((connection) =>
        recheckOne(db, provider, connection, checkedAt, now).catch((err: unknown) => {
          log.error('Token re-check failed', {
            connectionId: connection.id,
            error: err instanceof Error ? err.message : String(err),
          })
          return 0
        }),
      ),
    )
    stored += results.filter(Boolean).length
  }
  return stored
}

async function recheckOne(
  db: DatabaseAdapter,
  provider: WorkflowProvider,
  connection: Connection,
  checkedAt: string,
  now: Date,
): Promise<boolean> {
  // Health only: the account was checked when the token was saved.
  const inspection = await provider.inspectCredentials!(parseCredentials(connection.credentials), {
    checkAccount: false,
  }).catch(() => null)
  if (!inspection || inspection.status === 'unknown') return false
  const written = await db.recordConnectionTokenCheck(connection.id, connection.tokenCheckedAt, {
    status: inspection.status,
    expiresAt: inspection.expiresAt,
    checkedAt,
  })
  if (!written) return false
  if (inspection.status === 'invalid' && connection.tokenStatus !== 'invalid') {
    await sendNotice(
      db,
      {
        event: 'connection.token_invalid',
        organizationId: written.organizationId,
        groupKey: noticeGroup.tokenInvalid(connection.id, checkedAt),
        meta: { connection: connection.name },
        recipients: { connectionKeepers: { connectionId: connection.id } },
      },
      now,
    )
  }
  return true
}

/** Stored credentials as an object; empty when they don't parse. */
export function parseCredentials(json: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(json)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}
