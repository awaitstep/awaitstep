import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import { dashKeys, invalidateAll, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/** Project settings → API keys: the project's keys and a key count per workspace. */
export function useProjectKeys(org: string, project: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.projectKeys(org, project), ctx),
    queryFn: () => mockServer.keys.listProjectKeys(ctx, org, project),
  })
}

/** Revokes a project key; the key list and the "N project keys" counts follow. */
export function useRevokeProjectKey(org: string, project: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (keyId: string) => mockServer.keys.revokeProjectKey(ctx, org, project, keyId),
    onSuccess: () =>
      invalidateAll(client, [dashKeys.projectKeys(org, project), dashKeys.setup(org, project)]),
  })
}
