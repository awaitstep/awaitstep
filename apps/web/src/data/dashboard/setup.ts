import { useQuery } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import { dashKeys, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/** Thin setup counts for the empty-project and empty-workspace pages, until P3–P6 bring the lists. */
export function useProjectSetup(org: string, project: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.setup(org, project), ctx),
    queryFn: () => mockServer.setup.getProjectSetup(ctx, org, project),
  })
}
