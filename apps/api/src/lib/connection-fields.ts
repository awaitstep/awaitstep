import type { ConnectionTokenStatus, DeployConnections } from '@awaitstep/ir'
import type { DeployTargetRow } from '@awaitstep/db'
import { resolveProvider } from './provider-resolver.js'
import { hasProvider } from './provider-registry.js'
import { parseCredentials } from './connection-token.js'

/** A provider's own credential-shape refusal, if it has one. */
export function credentialError(
  provider: string,
  credentials: Record<string, string>,
): { field: string; error: string } | null {
  if (!hasProvider(provider)) {
    return { field: 'provider', error: `Unsupported provider: ${provider}` }
  }
  // A validator that throws is a provider bug, not permission to store the
  // credentials: let it surface as a 500/failure instead of failing open.
  return resolveProvider(provider).validateCredentials?.(credentials) ?? null
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
    defaultId: rows.find((row) => row.chosen)?.id ?? null,
    deployedWith,
    connections: rows.map((row) => ({
      id: row.id,
      provider: row.provider,
      name: row.name,
      accountSuffix: accountSuffixOf(row.credentials),
      scope: row.scope,
      tokenStatus: parseTokenStatus(row.tokenStatus),
      tokenExpiresAt: row.tokenExpiresAt,
    })),
  }
}
