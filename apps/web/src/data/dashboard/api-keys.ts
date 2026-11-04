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
  toApiKey,
  toCreateKeyRequest,
  toCreatedKey,
  toProjectKeys,
  toWorkspaceKeys,
} from './api/keys'
import { allPages } from './api/pages'
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
        ? dashboardApi.listProjectKeys({ org, project }).then(toProjectKeys)
        : mockServer.keys.listProjectKeys(ctx, org, project),
  })
}

/** Revokes a project key whole (the kill-switch, for keys homed here); list + counts follow. */
export function useRevokeProjectKey(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'Key revoked', error: 'Couldn’t revoke the key' } },
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

/** Drops this project's slice of a shared key (per-consumer revoke); the others keep it. */
export function useRevokeProjectKeyScope(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    meta: {
      toast: { success: 'Access revoked for this project', error: 'Couldn’t revoke access' },
    },
    mutationFn: async (keyId: string): Promise<void> => {
      if (source !== 'api') return mockServer.keys.revokeProjectKeyScope(ctx, org, project, keyId)
      await dashboardApi.revokeKeyScope({ org, project }, keyId)
    },
    // The slice dropped here belongs to an org-homed multi-project bundle, so the
    // Org keys page (its Reaches column, or the row itself on the last revoke) follows too.
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.inProject('keys', org, project),
        dashKeys.setup(org, project),
        dashKeys.orgKeys(org),
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

/** Revokes a workspace key whole (the kill-switch, for keys homed here); the counts follow. */
export function useRevokeWorkspaceKey(slugs: Required<ScopeSlugs>) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'Key revoked', error: 'Couldn’t revoke the key' } },
    mutationFn: async (keyId: string): Promise<void> => {
      if (source !== 'api') return mockServer.keys.revokeWorkspaceKey(ctx, slugs, keyId)
      await dashboardApi.revokeKey(slugs, keyId)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.inProject('keys', slugs.org, slugs.project)]),
  })
}

/** Drops this workspace's slice of a shared key (per-consumer revoke); the others keep it. */
export function useRevokeWorkspaceKeyScope(slugs: Required<ScopeSlugs>) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    meta: {
      toast: { success: 'Access revoked for this workspace', error: 'Couldn’t revoke access' },
    },
    mutationFn: async (keyId: string): Promise<void> => {
      if (source !== 'api') return mockServer.keys.revokeWorkspaceKeyScope(ctx, slugs, keyId)
      await dashboardApi.revokeKeyScope(slugs, keyId)
    },
    onSuccess: () => invalidateAll(client, [dashKeys.inProject('keys', slugs.org, slugs.project)]),
  })
}

/** Org Settings → API keys (owners and admins). */
/** `enabled: false` for someone who may not see them: the API refuses them (403). */
export function useOrgKeys(org: string, { enabled = true }: { enabled?: boolean } = {}) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  return useQuery({
    enabled,
    queryKey: key(dashKeys.orgKeys(org)),
    queryFn: (): Promise<ApiKey[]> =>
      source === 'api'
        ? allPages((cursor) => dashboardApi.listOrgKeys(org, cursor)).then((res) =>
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
    meta: { toast: { success: 'Key revoked', error: 'Couldn’t revoke the key' } },
    mutationFn: async (keyId: string): Promise<void> => {
      if (source !== 'api') return mockServer.keys.revokeOrgKey(ctx, org, keyId)
      await dashboardApi.revokeKey({ org }, keyId)
    },
    // A whole-revoked org key can be a multi-project bundle that reaches projects,
    // so the projects' keys lists and setup counts follow — as they do on create.
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.orgKeys(org),
        dashKeys.inOrg('keys', org),
        dashKeys.inOrg('setup', org),
      ]),
  })
}

/** Create an API key at any level; the new key shows on its level's page. */
export function useCreateKey(org: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'Key created', error: 'Couldn’t create the key' } },
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
