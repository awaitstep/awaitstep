import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { LockTarget } from '../../types/dashboard/locks'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'

/**
 * Turns the deletion lock on or off. The lock and the `delete` / `toggleLock`
 * capabilities it changes are read back through `useScope`.
 */
export function useSetLock(target: LockTarget) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (on: boolean) => mockServer.locks.setLock(ctx, target, on),
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.scope(),
        dashKeys.projects(target.org),
        dashKeys.workspaces(target.org, target.project),
      ]),
  })
}
