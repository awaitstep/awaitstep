import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { slugify } from '@awaitstep/ir'
import { availableSlug } from '../../lib/available-slug'
import { ApiError } from '../../lib/api-client'
import { dashboardApi } from '../../lib/dashboard-api'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import type {
  NewWorkspaceInput,
  Workspace,
  WorkspaceOverviewData,
  WorkspacePerson,
  WorkspaceUpdate,
} from '../../types/dashboard/workspaces'
import { toWorkspacePerson } from './api/access'
import { toScopeLookup, toWorkspace, workspaceFromRow } from './api/records'
import { toWorkspaceOverview } from './api/workspace-overview'
import { dashKeys, invalidateAll } from './keys'

/**
 * What the URL's slugs name, with the viewer's role and `viewerCan` at each
 * level. A missing slug and one the viewer can't open give the same
 * `{ found: false }` result, which pages render as NotFoundView.
 */
/**
 * The API's scope lookup, as one query: the dashboard shell reads it, and the
 * editor route waits on the same cache entry before it opens.
 */
export function apiScopeQuery(slugs: ScopeSlugs) {
  return {
    queryKey: dashKeys.scopeOf(slugs),
    queryFn: () => dashboardApi.getScope(slugs).then(toScopeLookup),
  }
}

export function useScope(slugs: ScopeSlugs) {
  return useQuery(apiScopeQuery(slugs))
}

/** Everyone who can open the workspace, with their effective role there. */
export function useWorkspacePeople(
  slugs: Required<ScopeSlugs>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const workspaceId = useWorkspaceId(slugs)
  return useQuery({
    queryKey: dashKeys.workspacePeople(slugs),
    queryFn: (): Promise<WorkspacePerson[]> =>
      dashboardApi.listWorkspacePeople(workspaceId!).then((res) => res.data.map(toWorkspacePerson)),
    // On the API people are read by the workspace's id, which the scope read gives.
    enabled: enabled && workspaceId !== null,
  })
}

/** Workspace Settings' three tab pills, without opening a tab. */
export function useWorkspaceSettingsCounts(
  slugs: Required<ScopeSlugs>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const workspaceId = useWorkspaceId(slugs)
  return useQuery({
    queryKey: dashKeys.workspaceSettingsCounts(slugs),
    queryFn: async (): Promise<{ members: number; keys: number; variables: number }> => {
      if (!workspaceId) throw new Error('The workspace has not loaded yet')
      return dashboardApi.getWorkspaceSettingsCounts(workspaceId)
    },
    enabled: enabled && workspaceId !== null,
  })
}

/**
 * A workspace's Overview in one request: counts, the failing items, the latest
 * run of each item, and what is shared in and out. People come from `/scope`.
 */
export function useWorkspaceOverview(
  slugs: Required<ScopeSlugs>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const workspaceId = useWorkspaceId(slugs)
  return useQuery({
    queryKey: dashKeys.workspaceOverview(slugs),
    queryFn: async (): Promise<WorkspaceOverviewData> => {
      if (!workspaceId) throw new Error('The workspace has not loaded yet')
      const overview = await dashboardApi.getWorkspaceOverview(workspaceId)
      return toWorkspaceOverview(overview)
    },
    enabled: enabled && workspaceId !== null,
  })
}

/** `enabled: false` holds the request back, e.g. until a dialog that needs it opens. */
export function useWorkspaces(
  org: string,
  project: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({ ...useWorkspacesQuery(org, project), enabled })
}

/** The list's key and fetcher, for the hooks that read it from the cache before a write. */
function useWorkspacesQuery(org: string, project: string) {
  return {
    queryKey: dashKeys.workspaces(org, project),
    queryFn: (): Promise<Workspace[]> =>
      dashboardApi.listWorkspaces({ org, project }).then((res) => res.data.map(toWorkspace)),
  }
}

/** The workspace's id from the scope the page already resolved; a page edits what it is on. */
export function useWorkspaceId(slugs: Required<ScopeSlugs>): string | null {
  const scope = useScope(slugs)
  return scope.data?.found ? (scope.data.workspace?.workspace.id ?? null) : null
}

const workspaceKeys = (org: string, project: string) => [
  dashKeys.inProject('workspaces', org, project),
  dashKeys.projects(org),
  dashKeys.scope(),
  // A deleted workspace takes its items, runs and shares with it.
  dashKeys.items(org, project),
  dashKeys.shared(org, project),
  dashKeys.runs(org, project),
  dashKeys.failing(org),
  dashKeys.homeSummary(org),
  // Workspace keys, overrides and grants go with a deleted workspace.
  dashKeys.setup(org, project),
  dashKeys.inProject('keys', org, project),
  dashKeys.inProject('variables', org, project),
  dashKeys.inProject('members', org, project),
  // A workspace's row on the project's Connections page, and its override with it.
  dashKeys.projectConnections(org, project),
]

/**
 * Creates the workspace. The slug comes from the name, stepped past the
 * project's existing ones ("Ops" twice gives `ops-2`), as the dummy server
 * does. "Who can get in → choose people" is written with it, as one unit.
 */
export function useCreateWorkspace(org: string, project: string) {
  const client = useQueryClient()
  const siblings = useWorkspacesQuery(org, project)
  return useMutation({
    meta: { toast: { success: 'Workspace created', error: 'Couldn’t create the workspace' } },
    mutationFn: async (input: NewWorkspaceInput): Promise<Workspace> => {
      const name = input.name.trim()
      const base = slugify(name)
      if (!base) {
        throw new ApiError('The workspace name needs at least one letter or number', 422, {
          field: 'name',
        })
      }
      // The list the page already holds, else one read: the slug steps past the siblings.
      const taken = new Set((await client.ensureQueryData(siblings)).map((w) => w.slug))
      const row = await dashboardApi.createWorkspace(
        { org, project },
        {
          name,
          slug: availableSlug('workspace', base, (slug) => taken.has(slug)),
          colour: input.colour,
          description: input.description?.trim() || undefined,
          members: input.access.kind === 'pick' ? input.access.people : undefined,
        },
      )
      return workspaceFromRow(row)
    },
    onSuccess: () => invalidateAll(client, workspaceKeys(org, project)),
  })
}

export function useUpdateWorkspace(slugs: Required<ScopeSlugs>) {
  const client = useQueryClient()
  const workspaceId = useWorkspaceId(slugs)
  return useMutation({
    meta: { toast: { success: 'Workspace saved', error: 'Couldn’t save the workspace' } },
    mutationFn: async (update: WorkspaceUpdate): Promise<Workspace> => {
      if (!workspaceId) throw new Error('The workspace has not loaded yet')
      const row = await dashboardApi.updateWorkspace(workspaceId, update)
      return workspaceFromRow(row)
    },
    onSuccess: (updated) =>
      invalidateAll(
        client,
        workspaceKeys(slugs.org, slugs.project),
        updated.slug === slugs.workspace ? undefined : slugs,
      ),
  })
}

export function useDeleteWorkspace(slugs: Required<ScopeSlugs>) {
  const client = useQueryClient()
  const workspaceId = useWorkspaceId(slugs)
  return useMutation({
    meta: { toast: { success: 'Workspace deleted', error: 'Couldn’t delete the workspace' } },
    mutationFn: async (): Promise<void> => {
      if (!workspaceId) throw new Error('The workspace has not loaded yet')
      await dashboardApi.deleteWorkspace(workspaceId)
    },
    onSuccess: () => invalidateAll(client, workspaceKeys(slugs.org, slugs.project), slugs),
  })
}
