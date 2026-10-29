import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type { EditRequest } from '../../types/dashboard/access'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import { toEditRequest } from './api/access'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'
import { useWorkspaceId } from './workspaces'

type WorkspaceSlugs = Required<ScopeSlugs>

/** The viewer's open edit-access request here, or null: "Asked Ama Mensah". */
export function useEditRequest(slugs: WorkspaceSlugs) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  const workspaceId = useWorkspaceId(slugs)
  return useQuery({
    queryKey: key(dashKeys.editRequest(slugs)),
    queryFn: (): Promise<EditRequest | null> =>
      source === 'api'
        ? dashboardApi.getEditRequest(workspaceId!).then((row) => (row ? toEditRequest(row) : null))
        : mockServer.requests.getEditRequest(ctx, slugs),
    // On the API the request is addressed by the workspace's id, which the scope read gives.
    enabled: source !== 'api' || workspaceId !== null,
  })
}

/** A Viewer's "Ask for edit access". Asking again returns the open request. It lands in an Inbox. */
export function useRequestEditAccess(slugs: WorkspaceSlugs) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  const workspaceId = useWorkspaceId(slugs)
  return useMutation({
    mutationFn: async (): Promise<EditRequest> => {
      if (source !== 'api') return mockServer.requests.requestEditAccess(ctx, slugs)
      if (!workspaceId) throw new Error('The workspace has not loaded yet')
      return dashboardApi.requestEditAccess(workspaceId).then(toEditRequest)
    },
    onSuccess: () =>
      invalidateAll(client, [dashKeys.editRequest(slugs), dashKeys.notifications(slugs.org)]),
  })
}
