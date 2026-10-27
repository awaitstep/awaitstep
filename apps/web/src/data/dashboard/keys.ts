import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { MockContext } from '../../mocks/dashboard/scenario'
import type { ItemKind } from '../../types/dashboard/items'
import type { RunFilter } from '../../types/dashboard/runs'
import type { ScopeSlugs } from '../../types/dashboard/scope'

type WorkspaceSlugs = Required<ScopeSlugs>

// One key tree for the dashboard. Each key starts with its domain so a
// mutation can invalidate a whole domain by prefix. Keys that read through a
// project or workspace are shaped [dash, domain, org, project, workspace | null, …]
// so `readsGoneSlugs` can find them after a delete or a URL change.
export const dashKeys = {
  viewer: () => ['dash', 'viewer'] as const,
  orgs: () => ['dash', 'orgs'] as const,
  projects: (org: string) => ['dash', 'projects', org] as const,
  failing: (org: string) => ['dash', 'failing', org] as const,
  activity: (org: string) => ['dash', 'activity', org] as const,
  scope: () => ['dash', 'scope'] as const,
  scopeOf: (slugs: ScopeSlugs) =>
    ['dash', 'scope', slugs.org, slugs.project ?? null, slugs.workspace ?? null] as const,
  workspaces: (org: string, project: string) => ['dash', 'workspaces', org, project, null] as const,
  workspacePeople: (s: WorkspaceSlugs) =>
    ['dash', 'workspaces', s.org, s.project, s.workspace, 'people'] as const,
  items: (org: string, project: string) => ['dash', 'items', org, project] as const,
  itemsOf: (s: WorkspaceSlugs, kind: ItemKind) =>
    ['dash', 'items', s.org, s.project, s.workspace, kind] as const,
  shared: (org: string, project: string) => ['dash', 'shared', org, project] as const,
  sharedWith: (s: WorkspaceSlugs, kind: ItemKind | null) =>
    ['dash', 'shared', s.org, s.project, s.workspace, kind] as const,
  projectShared: (org: string, project: string) => ['dash', 'shared', org, project, null] as const,
  runs: (org: string, project: string) => ['dash', 'runs', org, project] as const,
  runsOf: (s: WorkspaceSlugs, filter: RunFilter) =>
    ['dash', 'runs', s.org, s.project, s.workspace, filter] as const,
  library: (s: WorkspaceSlugs) => ['dash', 'library', s.org, s.project, s.workspace] as const,
  editRequest: (s: WorkspaceSlugs) => ['dash', 'requests', s.org, s.project, s.workspace] as const,
  setup: (org: string, project: string) => ['dash', 'setup', org, project, null] as const,
  projectKeys: (org: string, project: string) => ['dash', 'keys', org, project, null] as const,
  projectVariables: (org: string, project: string) =>
    ['dash', 'variables', org, project, null] as const,
  projectMembers: (org: string, project: string) =>
    ['dash', 'members', org, project, null] as const,
  orgPeople: (org: string) => ['dash', 'members', org, null, null] as const,
}

const SCOPED_DOMAINS = new Set([
  'scope',
  'workspaces',
  'items',
  'shared',
  'runs',
  'library',
  'requests',
  'setup',
  'keys',
  'variables',
  'members',
])

/**
 * Appends the dummy session's scenario and person, so switching either
 * refetches instead of serving another state's cache. Goes with the mocks.
 */
export function withMockContext(key: QueryKey, ctx: MockContext): QueryKey {
  return [...key, ctx.scenario, ctx.userId]
}

/** Whether a scoped key reads through slugs that no longer exist. */
function readsGoneSlugs(key: QueryKey, gone: ScopeSlugs): boolean {
  const [, domain, org, project, workspace] = key
  if (!SCOPED_DOMAINS.has(domain as string) || org !== gone.org) return false
  if (gone.project !== undefined && project !== gone.project) return false
  // Project-level keys (workspace slot null) outlive a gone workspace and are refetched.
  if (gone.workspace !== undefined && workspace !== gone.workspace) return false
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
