import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dashboardApi } from '../../lib/dashboard-api'
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

/** Project settings → API keys: the project's keys and a key count per workspace. */
export function useProjectKeys(org: string, project: string) {
  return useQuery({
    queryKey: dashKeys.projectKeys(org, project),
    queryFn: (): Promise<ProjectKeys> =>
      dashboardApi.listProjectKeys({ org, project }).then(toProjectKeys),
  })
}

/** Revokes a project key whole (the kill-switch, for keys homed here); list + counts follow. */
export function useRevokeProjectKey(org: string, project: string) {
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'Key revoked', error: 'Couldn’t revoke the key' } },
    mutationFn: async (keyId: string): Promise<void> => {
      await dashboardApi.revokeKey({ org, project }, keyId)
    },
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.inProject('keys', org, project),
        dashKeys.setup(org, project),
        dashKeys.inOrg('settings-counts', org),
      ]),
  })
}

/** Drops this project's slice of a shared key (per-consumer revoke); the others keep it. */
export function useRevokeProjectKeyScope(org: string, project: string) {
  const client = useQueryClient()
  return useMutation({
    meta: {
      toast: { success: 'Access revoked for this project', error: 'Couldn’t revoke access' },
    },
    mutationFn: async (keyId: string): Promise<void> => {
      await dashboardApi.revokeKeyScope({ org, project }, keyId)
    },
    // The slice dropped here belongs to an org-homed multi-project bundle, so the
    // Org keys page (its Reaches column, or the row itself on the last revoke) follows too.
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.inProject('keys', org, project),
        dashKeys.setup(org, project),
        dashKeys.inOrg('settings-counts', org),
        dashKeys.orgKeys(org),
      ]),
  })
}

/** Workspace settings → API keys: its own keys and the project keys that reach it. */
export function useWorkspaceKeys(
  slugs: Required<ScopeSlugs>,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: dashKeys.workspaceKeys(slugs),
    queryFn: (): Promise<WorkspaceKeys> =>
      dashboardApi.listWorkspaceKeys(slugs).then(toWorkspaceKeys),
    enabled,
  })
}

/** Revokes a workspace key whole (the kill-switch, for keys homed here); the counts follow. */
export function useRevokeWorkspaceKey(slugs: Required<ScopeSlugs>) {
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'Key revoked', error: 'Couldn’t revoke the key' } },
    mutationFn: async (keyId: string): Promise<void> => {
      await dashboardApi.revokeKey(slugs, keyId)
    },
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.inProject('keys', slugs.org, slugs.project),
        dashKeys.inOrg('settings-counts', slugs.org),
      ]),
  })
}

/** Drops this workspace's slice of a shared key (per-consumer revoke); the others keep it. */
export function useRevokeWorkspaceKeyScope(slugs: Required<ScopeSlugs>) {
  const client = useQueryClient()
  return useMutation({
    meta: {
      toast: { success: 'Access revoked for this workspace', error: 'Couldn’t revoke access' },
    },
    mutationFn: async (keyId: string): Promise<void> => {
      await dashboardApi.revokeKeyScope(slugs, keyId)
    },
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.inProject('keys', slugs.org, slugs.project),
        dashKeys.inOrg('settings-counts', slugs.org),
      ]),
  })
}

/** Org Settings → API keys (owners and admins). */
/** `enabled: false` for someone who may not see them: the API refuses them (403). */
export function useOrgKeys(org: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    enabled,
    queryKey: dashKeys.orgKeys(org),
    queryFn: (): Promise<ApiKey[]> =>
      allPages((cursor) => dashboardApi.listOrgKeys(org, cursor)).then((res) =>
        res.data.map(toApiKey),
      ),
  })
}

export function useRevokeOrgKey(org: string) {
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'Key revoked', error: 'Couldn’t revoke the key' } },
    mutationFn: async (keyId: string): Promise<void> => {
      await dashboardApi.revokeKey({ org }, keyId)
    },
    // A whole-revoked org key can be a multi-project bundle that reaches projects,
    // so the projects' keys lists and setup counts follow — as they do on create.
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.orgKeys(org),
        dashKeys.inOrg('keys', org),
        dashKeys.inOrg('setup', org),
        dashKeys.inOrg('settings-counts', org),
      ]),
  })
}

/** Create an API key at any level; the new key shows on its level's page. */
export function useCreateKey(org: string) {
  const client = useQueryClient()
  return useMutation({
    meta: { toast: { success: 'Key created', error: 'Couldn’t create the key' } },
    mutationFn: async (input: NewKeyInput): Promise<CreatedKey> => {
      const { slugs, body } = toCreateKeyRequest(org, input)
      return dashboardApi.createKey(slugs, body).then(toCreatedKey)
    },
    onSuccess: () =>
      invalidateAll(client, [
        dashKeys.inOrg('keys', org),
        dashKeys.inOrg('setup', org),
        dashKeys.orgKeys(org),
        dashKeys.inOrg('settings-counts', org),
      ]),
  })
}
