import { useQuery } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import { dashKeys, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/** Org home "Recent activity", across every project and workspace the viewer can open. */
export function useOrgActivity(org: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.activity(org), ctx),
    queryFn: () => mockServer.activity.listActivity(ctx, org),
  })
}
