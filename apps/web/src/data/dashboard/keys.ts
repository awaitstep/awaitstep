import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { MockContext } from '../../mocks/dashboard/scenario'
import type { ScopeSlugs } from '../../types/dashboard/scope'

// One key tree for the dashboard. Each key starts with its domain so a
// mutation can invalidate a whole domain by prefix.
export const dashKeys = {
  viewer: () => ['dash', 'viewer'] as const,
  orgs: () => ['dash', 'orgs'] as const,
  projects: (org: string) => ['dash', 'projects', org] as const,
  scope: () => ['dash', 'scope'] as const,
  scopeOf: (slugs: ScopeSlugs) =>
    ['dash', 'scope', slugs.org, slugs.project ?? null, slugs.workspace ?? null] as const,
  workspaces: (org: string, project: string) => ['dash', 'workspaces', org, project] as const,
}

/**
 * Appends the dummy session's scenario and person, so switching either
 * refetches instead of serving another state's cache. Goes with the mocks.
 */
export function withMockContext(key: QueryKey, ctx: MockContext): QueryKey {
  return [...key, ctx.scenario, ctx.userId]
}

/** Whether a scope or workspace-list key reads through slugs that no longer exist. */
function readsGoneSlugs(key: QueryKey, gone: ScopeSlugs): boolean {
  const [, domain, org, project, workspace] = key
  if ((domain !== 'scope' && domain !== 'workspaces') || org !== gone.org) return false
  if (gone.project !== undefined && project !== gone.project) return false
  // A gone workspace leaves its project's workspace list behind, to be refetched.
  if (gone.workspace !== undefined) return domain === 'scope' && workspace === gone.workspace
  return true
}

/**
 * Invalidates every query under `keys`. With `gone` (the slugs a delete or a
 * URL change just removed), queries that read through those slugs are only
 * marked stale, not refetched: the page still showing them is about to
 * navigate away, and a refetch would flash it to Not found first.
 */
export function invalidateAll(
  client: QueryClient,
  keys: QueryKey[],
  gone?: ScopeSlugs,
): Promise<void> {
  const reads = (key: QueryKey) => gone !== undefined && readsGoneSlugs(key, gone)
  return Promise.all(
    keys.flatMap((queryKey) => [
      client.invalidateQueries({ queryKey, predicate: (query) => !reads(query.queryKey) }),
      client.invalidateQueries({
        queryKey,
        predicate: (query) => reads(query.queryKey),
        refetchType: 'none',
      }),
    ]),
  ).then(() => undefined)
}
