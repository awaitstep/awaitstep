import type { ConnectionTokenStatus, DeployConnections } from '@awaitstep/ir'
import type { DeployTargetRow } from '@awaitstep/db'
import { parseCredentials } from './connection-token.js'

/** A Cloudflare account id: 32 hex digits. Anything else is refused before it is stored or sent. */
const CLOUDFLARE_ACCOUNT_ID = /^[a-f0-9]{32}$/i

export function badAccountId(provider: string, credentials: Record<string, string>): boolean {
  return provider === 'cloudflare' && !CLOUDFLARE_ACCOUNT_ID.test(credentials.accountId ?? '')
}

export const BAD_ACCOUNT_ID = {
  error: 'An account ID is 32 letters and digits (0–9, a–f)',
  field: 'accountId',
}

export function parseTokenStatus(value: string): ConnectionTokenStatus {
  return value === 'active' || value === 'invalid' ? value : 'unchecked'
}

/** The account named by its last four characters, from decrypted credentials; never the token. */
export function accountSuffixOf(credentials: string): string | null {
  const accountId = parseCredentials(credentials).accountId
  return accountId ? accountId.slice(-4) : null
}

/** The accounts Deploy offers, the workspace's (else the project's) default chosen. */
export function deployConnections(
  rows: DeployTargetRow[],
  deployedWith: DeployConnections['deployedWith'],
): DeployConnections {
  return {
    connections: rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      accountSuffix: accountSuffixOf(row.credentials),
      scope: row.scope,
      tokenStatus: parseTokenStatus(row.tokenStatus),
      tokenExpiresAt: row.tokenExpiresAt,
    })),
    defaultId: rows.find((row) => row.chosen)?.id ?? null,
    deployedWith,
  }
}
