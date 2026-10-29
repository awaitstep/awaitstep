import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type {
  ApiKey,
  CreatedKey,
  NewKeyInput,
  ProjectKeys,
  WorkspaceKeys,
} from '../../types/dashboard/api-keys'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import {
  allKeyPages,
  toApiKey,
  toCreateKeyRequest,
  toCreatedKey,
  toProjectKeys,
  toWorkspaceKeys,
} from './api/keys'
import { dashKeys, invalidateAll } from './keys'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

/** Project settings → API keys: the project's keys and a key count per workspace. */
export function useProjectKeys(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.projectKeys(org, project)),
    queryFn: (): Promise<ProjectKeys> =>
      source === 'api'
        ? allKeyPages((cursor) => dashboardApi.listProjectKeys({ org, project }, cursor)).then(
            toProjectKeys,
          )
        : mockServer.keys.listProjectKeys(ctx, org, project),
  })
}

/** Revokes a project key; the key list and the "N project keys" counts follow. */
export function useRevokeProjectKey(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (keyId: string): Promise<void> => {
      if (source !== 'api') return mockServer.keys.revokeProjectKey(ctx, org, project, keyId)
      await dashboardApi.revokeKey({ org, project }, keyId)
    },
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.inProject('keys', org, project),
        dashKeys.setup(org, project),
      ]),
  })
}

/** Workspace settings → API keys: its own keys and the project keys that reach it. */
export function useWorkspaceKeys(slugs: Required<ScopeSlugs>) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.workspaceKeys(slugs)),
    queryFn: (): Promise<WorkspaceKeys> =>
      source === 'api'
        ? dashboardApi.listWorkspaceKeys(slugs).then(toWorkspaceKeys)
        : mockServer.keys.listWorkspaceKeys(ctx, slugs),
  })
}

/** Revokes a workspace key; the project's per-workspace key counts follow. */
export function useRevokeWorkspaceKey(slugs: Required<ScopeSlugs>) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (keyId: string): Promise<void> => {
      if (source !== 'api') return mockServer.keys.revokeWorkspaceKey(ctx, slugs, keyId)
      await dashboardApi.revokeKey(slugs, keyId)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.inProject('keys', slugs.org, slugs.project)]),
  })
}

/** Org Settings → API keys (owners and admins). */
export function useOrgKeys(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    queryKey: key(dashKeys.orgKeys(org)),
    queryFn: (): Promise<ApiKey[]> =>
      source === 'api'
        ? allKeyPages((cursor) => dashboardApi.listOrgKeys(org, cursor)).then((res) =>
            res.data.map(toApiKey),
          )
        : mockServer.keys.listOrgKeys(ctx, org),
  })
}

export function useRevokeOrgKey(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (keyId: string): Promise<void> => {
      if (source !== 'api') return mockServer.keys.revokeOrgKey(ctx, org, keyId)
      await dashboardApi.revokeKey({ org }, keyId)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.orgKeys(org)]),
  })
}

/** Create an API key at any level; the new key shows on its level's page. */
export function useCreateKey(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewKeyInput): Promise<CreatedKey> => {
      if (source !== 'api') return mockServer.keys.createKey(ctx, org, input)
      const { slugs, body } = toCreateKeyRequest(org, input)
      return dashboardApi.createKey(slugs, body).then(toCreatedKey)
    },
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.inOrg('keys', org),
        dashKeys.inOrg('setup', org),
        dashKeys.orgKeys(org),
      ]),
  })
}
