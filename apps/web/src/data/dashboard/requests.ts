import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

type WorkspaceSlugs = Required<ScopeSlugs>

/** The viewer's open edit-access request here, or null: "Asked Ama Mensah". */
export function useEditRequest(slugs: WorkspaceSlugs) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.editRequest(slugs), ctx),
    queryFn: () => mockServer.requests.getEditRequest(ctx, slugs),
  })
}

/** A Viewer's "Ask for edit access". Asking again returns the open request. */
export function useRequestEditAccess(slugs: WorkspaceSlugs) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => mockServer.requests.requestEditAccess(ctx, slugs),
    onSuccess: () => invalidateAll(client, [dashKeys.editRequest(slugs)]),
  })
}
