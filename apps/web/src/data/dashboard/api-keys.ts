import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { ScopeSlugs } from '../../types/dashboard/scope'
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
      invalidateAll(client, [
        dashKeys.inProject('keys', org, project),
        dashKeys.setup(org, project),
      ]),
  })
}

/** Workspace settings → API keys: its own keys and the project keys that reach it. */
export function useWorkspaceKeys(slugs: Required<ScopeSlugs>) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.workspaceKeys(slugs), ctx),
    queryFn: () => mockServer.keys.listWorkspaceKeys(ctx, slugs),
  })
}

/** Revokes a workspace key; the project's per-workspace key counts follow. */
export function useRevokeWorkspaceKey(slugs: Required<ScopeSlugs>) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (keyId: string) => mockServer.keys.revokeWorkspaceKey(ctx, slugs, keyId),
    onSuccess: () => invalidateAll(client, [dashKeys.inProject('keys', slugs.org, slugs.project)]),
  })
}
