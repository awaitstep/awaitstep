import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { defineToast } from '../../lib/action-toast'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type { ProjectMembers } from '../../types/dashboard/access'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import type { Person } from '../../types/dashboard/session'
import type { WorkspaceRole } from '../../types/dashboard/workspaces'
import { toProjectMembers } from './api/access'
import { toPerson } from './api/records'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'
import { useWorkspaceId } from './workspaces'

/** Project settings → Members: whole-project people and workspace-only people. */
export function useProjectMembers(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.projectMembers(org, project)),
    queryFn: (): Promise<ProjectMembers> =>
      source === 'api'
        ? dashboardApi.listProjectMembers({ org, project }).then(toProjectMembers)
        : mockServer.members.listProjectMembers(ctx, org, project),
  })
}

/** Everyone in the org; `enabled: false` waits until a picker opens. */
export function useOrgPeople(org: string, { enabled = true }: { enabled?: boolean } = {}) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.orgPeople(org)),
    queryFn: (): Promise<Person[]> =>
      source === 'api'
        ? dashboardApi.listOrgMembers(org).then((res) => res.data.map(toPerson))
        : mockServer.members.listOrgPeople(ctx, org),
    enabled,
  })
}

type WorkspaceSlugs = Required<ScopeSlugs>

/** Who can open the workspace changes its people, the project's Members page and the scope. */
function memberKeys(slugs: WorkspaceSlugs) {
  return [
    // Workspace people live under the workspaces domain.
    dashKeys.inProject('workspaces', slugs.org, slugs.project),
    dashKeys.inProject('members', slugs.org, slugs.project),
    dashKeys.projects(slugs.org),
    dashKeys.scope(),
  ]
}

/** Add member: someone in the org gets a role in this workspace. */
export function useAddWorkspaceMember(slugs: WorkspaceSlugs) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const workspaceId = useWorkspaceId(slugs)
  return useMutation({
    meta: { toast: { success: 'Member added', error: 'Couldn’t add the member' } },
    mutationFn: async ({ userId, role }: { userId: string; role: WorkspaceRole }) => {
      if (source !== 'api') return mockServer.members.addWorkspaceMember(ctx, slugs, userId, role)
      if (!workspaceId) throw new Error('The workspace has not loaded yet')
      await dashboardApi.addWorkspaceMember(workspaceId, { userId, role })
    },
    onSuccess: () => invalidateAll(client, memberKeys(slugs)),
  })
}

/** Changes the role on someone's own grant in this workspace. */
export function useSetWorkspaceRole(slugs: WorkspaceSlugs) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const workspaceId = useWorkspaceId(slugs)
  return useMutation({
    meta: { toast: { success: 'Role changed', error: 'Couldn’t change the role' } },
    mutationFn: async ({ userId, role }: { userId: string; role: WorkspaceRole }) => {
      if (source !== 'api') return mockServer.members.setWorkspaceRole(ctx, slugs, userId, role)
      if (!workspaceId) throw new Error('The workspace has not loaded yet')
      await dashboardApi.setWorkspaceRole(workspaceId, userId, role)
    },
    onSuccess: () => invalidateAll(client, memberKeys(slugs)),
  })
}

/**
 * Removes someone's own grant in this workspace. `leaving`: it was the
 * viewer's only way in, so what reads through the workspace is only marked
 * stale (the page navigates away instead of flashing Not found).
 */
export function useRemoveWorkspaceMember(slugs: WorkspaceSlugs) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const workspaceId = useWorkspaceId(slugs)
  return useMutation({
    meta: {
      toast: defineToast<{ userId: string; leaving: boolean }>({
        success: (v) => (v.leaving ? 'You left the workspace' : 'Member removed'),
        error: (v) => (v.leaving ? 'Couldn’t leave the workspace' : 'Couldn’t remove the member'),
      }),
    },
    mutationFn: async ({ userId }: { userId: string; leaving: boolean }) => {
      if (source !== 'api') return mockServer.members.removeWorkspaceMember(ctx, slugs, userId)
      if (!workspaceId) throw new Error('The workspace has not loaded yet')
      await dashboardApi.removeWorkspaceMember(workspaceId, userId)
    },
    onSuccess: (_result, { leaving }) =>
      invalidateAll(client, memberKeys(slugs), leaving ? slugs : undefined),
  })
}
