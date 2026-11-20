import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../lib/dashboard-api'
import type { ProjectSetup } from '../../types/dashboard/setup'
import { dashKeys } from './keys'
import { useProjectId } from './projects'

/** Setup counts for the empty-project and empty-workspace pages. */
export function useProjectSetup(org: string, project: string) {
  const projectId = useProjectId(org, project)
  return useQuery({
    queryKey: dashKeys.setup(org, project),
    queryFn: (): Promise<ProjectSetup> => dashboardApi.getProjectSetup(org, projectId!),
    // On the API the counts are read by the project's id, which the scope read gives.
    enabled: projectId !== null,
  })
}
