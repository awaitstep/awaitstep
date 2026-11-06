/**
 * A deploy page's search: the version to deploy, when it isn't the current one,
 * and the account to deploy it to (Roll back on one account's row).
 */
export function parseDeploySearch(search: Record<string, unknown>): {
  version?: string
  connection?: string
} {
  return {
    version: typeof search.version === 'string' && search.version ? search.version : undefined,
    connection:
      typeof search.connection === 'string' && search.connection ? search.connection : undefined,
  }
}
