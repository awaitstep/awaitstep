import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type { ProjectSetup } from '../../types/dashboard/setup'
import { dashKeys } from './keys'
import { useProjectId } from './projects'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

/** Setup counts for the empty-project and empty-workspace pages. */
export function useProjectSetup(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  const projectId = useProjectId(org, project)
  return useQuery({
    queryKey: key(dashKeys.setup(org, project)),
    queryFn: (): Promise<ProjectSetup> =>
      source === 'api'
        ? dashboardApi.getProjectSetup(org, projectId!)
        : mockServer.setup.getProjectSetup(ctx, org, project),
    // On the API the counts are read by the project's id, which the scope read gives.
    enabled: source !== 'api' || projectId !== null,
  })
}
