import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import type { NewWorkspaceInput, WorkspaceUpdate } from '../../types/dashboard/workspaces'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/**
 * What the URL's slugs name, with the viewer's role and `viewerCan` at each
 * level. A missing slug and one the viewer can't open give the same
 * `{ found: false }` result, which pages render as NotFoundView.
 */
export function useScope(slugs: ScopeSlugs) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.scopeOf(slugs), ctx),
    queryFn: () => mockServer.workspaces.getScope(ctx, slugs),
  })
}

/** Everyone who can open the workspace, with their effective role there. */
export function useWorkspacePeople(slugs: Required<ScopeSlugs>) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.workspacePeople(slugs), ctx),
    queryFn: () => mockServer.workspaces.listWorkspacePeople(ctx, slugs),
  })
}

/** `enabled: false` holds the request back, e.g. until a dialog that needs it opens. */
export function useWorkspaces(
  org: string,
  project: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.workspaces(org, project), ctx),
    queryFn: () => mockServer.workspaces.listWorkspaces(ctx, org, project),
    enabled,
  })
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
  dashKeys.activity(org),
  // Workspace keys, overrides and grants go with a deleted workspace.
  dashKeys.setup(org, project),
  dashKeys.inProject('keys', org, project),
  dashKeys.inProject('variables', org, project),
  dashKeys.inProject('members', org, project),
]

export function useCreateWorkspace(org: string, project: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: NewWorkspaceInput) =>
      mockServer.workspaces.createWorkspace(ctx, org, project, input),
    onSuccess: () => invalidateAll(client, workspaceKeys(org, project)),
  })
}

export function useUpdateWorkspace(slugs: Required<ScopeSlugs>) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (update: WorkspaceUpdate) =>
      mockServer.workspaces.updateWorkspace(ctx, slugs, update),
    onSuccess: (updated) =>
      invalidateAll(
        client,
        workspaceKeys(slugs.org, slugs.project),
        updated.slug === slugs.workspace ? undefined : slugs,
      ),
  })
}

export function useDeleteWorkspace(slugs: Required<ScopeSlugs>) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => mockServer.workspaces.deleteWorkspace(ctx, slugs),
    onSuccess: () => invalidateAll(client, workspaceKeys(slugs.org, slugs.project), slugs),
  })
}
