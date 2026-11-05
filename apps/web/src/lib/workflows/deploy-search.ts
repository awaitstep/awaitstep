/** A deploy page's search: the version to deploy, when it isn't the current one. */
export function parseDeploySearch(search: Record<string, unknown>): { version?: string } {
  return {
    version: typeof search.version === 'string' && search.version ? search.version : undefined,
  }
}
