import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { slugify } from '@awaitstep/ir'
import { availableSlug } from '../../lib/available-slug'
import { ApiError } from '../../lib/api-client'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
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
import { toWorkspaceRun } from './api/runs'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

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
    queryKey: [...dashKeys.scopeOf(slugs), 'api'] as const,
    queryFn: () => dashboardApi.getScope(slugs).then(toScopeLookup),
  }
}

export function useScope(slugs: ScopeSlugs) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery(
    source === 'api'
      ? apiScopeQuery(slugs)
      : {
          queryKey: key(dashKeys.scopeOf(slugs)),
          queryFn: () => mockServer.workspaces.getScope(ctx, slugs),
        },
  )
}

/** Everyone who can open the workspace, with their effective role there. */
export function useWorkspacePeople(
  slugs: Required<ScopeSlugs>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  const workspaceId = useWorkspaceId(slugs)
  return useQuery({
    queryKey: key(dashKeys.workspacePeople(slugs)),
    queryFn: (): Promise<WorkspacePerson[]> =>
      source === 'api'
        ? dashboardApi
            .listWorkspacePeople(workspaceId!)
            .then((res) => res.data.map(toWorkspacePerson))
        : mockServer.workspaces.listWorkspacePeople(ctx, slugs),
    // On the API people are read by the workspace's id, which the scope read gives.
    enabled: enabled && (source !== 'api' || workspaceId !== null),
  })
}

/** Workspace Settings' three tab pills, without opening a tab. */
export function useWorkspaceSettingsCounts(
  slugs: Required<ScopeSlugs>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  const workspaceId = useWorkspaceId(slugs)
  return useQuery({
    queryKey: key(dashKeys.workspaceSettingsCounts(slugs)),
    queryFn: async (): Promise<{ members: number; keys: number; variables: number }> => {
      if (source === 'api') {
        if (!workspaceId) throw new Error('The workspace has not loaded yet')
        return dashboardApi.getWorkspaceSettingsCounts(workspaceId)
      }
      const [people, keys, variables] = await Promise.all([
        mockServer.workspaces.listWorkspacePeople(ctx, slugs),
        mockServer.keys.listWorkspaceKeys(ctx, slugs),
        mockServer.variables.listWorkspaceVariables(ctx, slugs),
      ])
      return {
        members: people.length,
        keys: keys.own.length + keys.reaching.length,
        variables: variables.length,
      }
    },
    enabled: enabled && (source !== 'api' || workspaceId !== null),
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
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  const workspaceId = useWorkspaceId(slugs)
  return useQuery({
    queryKey: key(dashKeys.workspaceOverview(slugs)),
    queryFn: async (): Promise<WorkspaceOverviewData> => {
      if (source === 'api') {
        if (!workspaceId) throw new Error('The workspace has not loaded yet')
        const overview = await dashboardApi.getWorkspaceOverview(workspaceId)
        return {
          counts: overview.counts,
          needsAttention: overview.needsAttention.map((entry) => ({
            item: entry.item,
            run: entry.run
              ? toWorkspaceRun(
                  {
                    id: entry.run.id,
                    workflowId: entry.run.workflowId,
                    versionId: null,
                    versionNumber: null,
                    connectionId: null,
                    instanceId: '',
                    status: entry.run.status,
                    output: null,
                    error: entry.run.error,
                    createdAt: entry.run.createdAt,
                    updatedAt: entry.run.createdAt,
                  },
                  entry.item,
                )
              : null,
            failures: entry.failures,
            total: entry.total,
          })),
          recent: overview.recent.map((run) =>
            toWorkspaceRun(
              {
                id: run.id,
                workflowId: run.workflowId,
                versionId: null,
                versionNumber: null,
                connectionId: null,
                instanceId: '',
                status: run.status,
                output: null,
                error: null,
                createdAt: run.createdAt,
                updatedAt: run.createdAt,
              },
              { name: run.workflowName, kind: run.kind },
            ),
          ),
          shared: {
            out: overview.shared.out,
            in: overview.shared.in.map((item) => ({
              id: item.id,
              name: item.name,
              kind: item.kind,
              version: null,
              from: { ...item.from },
              usedBy: [],
              canOpen: false,
              unshare: { allowed: false },
              sharedAt: '',
              sharedBy: { id: '', name: '' },
            })),
          },
        }
      }
      const workspace = (
        await mockServer.workspaces.listWorkspaces(ctx, slugs.org, slugs.project)
      ).find((row) => row.slug === slugs.workspace)
      if (!workspace) throw new Error('The workspace has not loaded yet')
      const [workflows, functions, page, sharedIn] = await Promise.all([
        mockServer.items.listItems(ctx, slugs, 'workflow'),
        mockServer.items.listItems(ctx, slugs, 'script'),
        mockServer.runs.listRuns(ctx, slugs, { period: '24h', limit: 50 }),
        mockServer.items.listSharedWith(ctx, slugs),
      ])
      const items = [...workflows, ...functions]
      const failed = page.data.filter((run) => run.result === 'failed')
      const recent: WorkspaceOverviewData['recent'] = []
      const seen = new Set<string>()
      for (const run of page.data) {
        if (run.result === 'running' || seen.has(run.workflowId)) continue
        seen.add(run.workflowId)
        recent.push(run)
        if (recent.length === 4) break
      }
      return {
        // Counted off the lists read above, so a scenario that empties them empties these too.
        counts: {
          ...workspace.counts,
          workflows: workflows.length,
          functions: functions.length,
          runs24h: page.data.length === 0 ? 0 : workspace.counts.runs24h,
        },
        needsAttention: items
          .filter((item) => item.lastRun?.result === 'failed')
          .map((item) => ({
            item: { id: item.id, name: item.name, kind: item.kind },
            run: failed.find((run) => run.workflowId === item.id) ?? null,
            failures: item.recentRuns.filter((result) => result === 'failed').length,
            total: item.recentRuns.length,
          })),
        recent,
        shared: {
          out: items.filter((item) => item.sharing).map(({ id, name }) => ({ id, name })),
          in: sharedIn,
        },
      }
    },
    enabled: enabled && (source !== 'api' || workspaceId !== null),
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
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return {
    queryKey: key(dashKeys.workspaces(org, project)),
    queryFn: (): Promise<Workspace[]> =>
      source === 'api'
        ? dashboardApi.listWorkspaces({ org, project }).then((res) => res.data.map(toWorkspace))
        : mockServer.workspaces.listWorkspaces(ctx, org, project),
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
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const siblings = useWorkspacesQuery(org, project)
  return useMutation({
    meta: { toast: { success: 'Workspace created', error: 'Couldn’t create the workspace' } },
    mutationFn: async (input: NewWorkspaceInput): Promise<Workspace> => {
      if (source !== 'api') return mockServer.workspaces.createWorkspace(ctx, org, project, input)
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
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const workspaceId = useWorkspaceId(slugs)
  return useMutation({
    meta: { toast: { success: 'Workspace saved', error: 'Couldn’t save the workspace' } },
    mutationFn: async (update: WorkspaceUpdate): Promise<Workspace> => {
      if (source !== 'api') return mockServer.workspaces.updateWorkspace(ctx, slugs, update)
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
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const workspaceId = useWorkspaceId(slugs)
  return useMutation({
    meta: { toast: { success: 'Workspace deleted', error: 'Couldn’t delete the workspace' } },
    mutationFn: async (): Promise<void> => {
      if (source !== 'api') return mockServer.workspaces.deleteWorkspace(ctx, slugs)
      if (!workspaceId) throw new Error('The workspace has not loaded yet')
      await dashboardApi.deleteWorkspace(workspaceId)
    },
    onSuccess: () => invalidateAll(client, workspaceKeys(slugs.org, slugs.project), slugs),
  })
}
