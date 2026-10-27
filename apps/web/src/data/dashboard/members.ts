import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import type { WorkspaceRole } from '../../types/dashboard/workspaces'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/** Project settings → Members: whole-project people and workspace-only people. */
export function useProjectMembers(org: string, project: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.projectMembers(org, project), ctx),
    queryFn: () => mockServer.members.listProjectMembers(ctx, org, project),
  })
}

/** Everyone in the org; `enabled: false` waits until a picker opens. */
export function useOrgPeople(org: string, { enabled = true }: { enabled?: boolean } = {}) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.orgPeople(org), ctx),
    queryFn: () => mockServer.members.listOrgPeople(ctx, org),
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
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: WorkspaceRole }) =>
      mockServer.members.addWorkspaceMember(ctx, slugs, userId, role),
    onSuccess: () => invalidateAll(client, memberKeys(slugs)),
  })
}

/** Changes the role on someone's own grant in this workspace. */
export function useSetWorkspaceRole(slugs: WorkspaceSlugs) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: WorkspaceRole }) =>
      mockServer.members.setWorkspaceRole(ctx, slugs, userId, role),
    onSuccess: () => invalidateAll(client, memberKeys(slugs)),
  })
}

/**
 * Removes someone's own grant in this workspace. `leaving`: it was the
 * viewer's only way in, so what reads through the workspace is only marked
 * stale (the page navigates away instead of flashing Not found).
 */
export function useRemoveWorkspaceMember(slugs: WorkspaceSlugs) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ userId }: { userId: string; leaving: boolean }) =>
      mockServer.members.removeWorkspaceMember(ctx, slugs, userId),
    onSuccess: (_result, { leaving }) =>
      invalidateAll(client, memberKeys(slugs), leaving ? slugs : undefined),
  })
}
