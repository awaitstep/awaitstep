import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/** The signed-in person (dummy until B2; P9's sign-in stays on real auth). */
export function useViewer() {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.viewer(), ctx),
    queryFn: () => mockServer.session.getViewer(ctx),
  })
}

export function useOrgs() {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.orgs(), ctx),
    queryFn: () => mockServer.session.listOrgs(ctx),
  })
}

/** Marks an org as the one opened last; the org switcher and ChooseOrg call it. */
export function useSwitchOrg() {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (orgSlug: string) => mockServer.session.openOrg(ctx, orgSlug),
    onSuccess: () => invalidateAll(client, [dashKeys.viewer(), dashKeys.orgs()]),
  })
}
