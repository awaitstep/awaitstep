import { useMutation, useQueryClient } from '@tanstack/react-query'
import { defineToast } from '../../lib/action-toast'
import { dashboardApi } from '../../lib/dashboard-api'
import type { LockTarget } from '../../types/dashboard/locks'
import { dashKeys, invalidateAll } from './keys'
import { useScope } from './workspaces'

/**
 * Turns the deletion lock on or off. The lock and the `delete` / `toggleLock`
 * capabilities it changes are read back through `useScope`.
 */
export function useSetLock(target: LockTarget) {
  const client = useQueryClient()
  // The scope the page already resolved: the id of what it is on.
  const { level, ...slugs } = target
  const scope = useScope(slugs)
  const found = scope.data?.found ? scope.data : null
  const id = level === 'project' ? found?.project?.project.id : found?.workspace?.workspace.id
  return useMutation({
    meta: {
      toast: defineToast<boolean>({
        success: (on) =>
          `${target.level === 'project' ? 'Project' : 'Workspace'} ${on ? 'locked' : 'unlocked'}`,
        error: (on) => `Couldn’t ${on ? 'lock' : 'unlock'} the ${target.level}`,
      }),
    },
    mutationFn: async (on: boolean): Promise<void> => {
      if (!id) throw new Error(`The ${level} has not loaded yet`)
      if (level === 'project') await dashboardApi.setProjectLock(target.org, id, on)
      else await dashboardApi.setWorkspaceLock(id, on)
    },
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.scope(),
        dashKeys.projects(target.org),
        dashKeys.inProject('workspaces', target.org, target.project),
      ]),
  })
}
