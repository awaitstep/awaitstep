import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dashboardApi } from '../../lib/dashboard-api'
import type { EditRequest } from '../../types/dashboard/access'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import { toEditRequest } from './api/access'
import { dashKeys, invalidateAll } from './keys'
import { useWorkspaceId } from './workspaces'

type WorkspaceSlugs = Required<ScopeSlugs>

/** The viewer's open edit-access request here, or null: "Asked Ama Mensah". */
export function useEditRequest(slugs: WorkspaceSlugs) {
  const workspaceId = useWorkspaceId(slugs)
  return useQuery({
    queryKey: dashKeys.editRequest(slugs),
    queryFn: (): Promise<EditRequest | null> =>
      dashboardApi.getEditRequest(workspaceId!).then((row) => (row ? toEditRequest(row) : null)),
    // On the API the request is addressed by the workspace's id, which the scope read gives.
    enabled: workspaceId !== null,
  })
}

/** A Viewer's "Ask for edit access". Asking again returns the open request. It lands in an Inbox. */
export function useRequestEditAccess(slugs: WorkspaceSlugs) {
  const client = useQueryClient()
  const workspaceId = useWorkspaceId(slugs)
  return useMutation({
    meta: { toast: { success: 'Edit access requested', error: 'Couldn’t request edit access' } },
    mutationFn: async (): Promise<EditRequest> => {
      if (!workspaceId) throw new Error('The workspace has not loaded yet')
      return dashboardApi.requestEditAccess(workspaceId).then(toEditRequest)
    },
    onSuccess: () =>
      invalidateAll(client, [dashKeys.editRequest(slugs), dashKeys.notifications(slugs.org)]),
  })
}
