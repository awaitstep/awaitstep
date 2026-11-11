import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { defineToast } from '../../lib/action-toast'
import { dashboardApi } from '../../lib/dashboard-api'
import { mockServer } from '../../mocks/dashboard/server'
import type {
  AvailableConnection,
  NewProjectConnectionInput,
  ProjectConnections,
} from '../../types/dashboard/project-connections'
import { dashKeys, invalidateAll } from './keys'
import { useProjectId } from './projects'
import { useMockContext } from './scenario-context'
import { useDashKey, useDataSource } from './source'

// A project's Cloudflare accounts (23a–23c). On the API they're read and
// changed by the project's id, which the scope read gives.

/**
 * What a change to a project's accounts reaches: its page and Add connection
 * (under the org's connections key), the "Cloudflare connected" setup step,
 * Deploy's account list, and the old pages' connection list.
 */
function projectConnectionKeys(org: string, project: string) {
  return [
    dashKeys.connections(org),
    dashKeys.setup(org, project),
    DEPLOY_CONNECTIONS,
    LEGACY_CONNECTIONS,
  ]
}

/** `useDeployConnections`' key prefix: every workflow's. */
export const DEPLOY_CONNECTIONS = ['deploy-connections']
const LEGACY_CONNECTIONS = ['connections']

/** The project's accounts and where each workspace deploys (23a). */
export function useProjectConnections(org: string, project: string) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  const projectId = useProjectId(org, project)
  return useQuery({
    queryKey: key(dashKeys.projectConnections(org, project)),
    queryFn: (): Promise<ProjectConnections> =>
      source === 'api'
        ? dashboardApi.listProjectConnections(org, projectId!)
        : mockServer.projectConnections.listProjectConnections(ctx, org, project),
    enabled: source !== 'api' || projectId !== null,
  })
}

/** The org's accounts as Add connection lists them (23b); waits until the dialog opens. */
export function useAvailableConnections(org: string, project: string, enabled: boolean) {
  const source = useDataSource()
  const ctx = useMockContext()
  const key = useDashKey()
  const projectId = useProjectId(org, project)
  return useQuery({
    queryKey: key(dashKeys.availableConnections(org, project)),
    queryFn: (): Promise<AvailableConnection[]> =>
      source === 'api'
        ? dashboardApi.listAvailableProjectConnections(org, projectId!).then((res) => res.data)
        : mockServer.projectConnections.listAvailableProjectConnections(ctx, org, project),
    enabled: enabled && (source !== 'api' || projectId !== null),
  })
}

/** The mutations' common shape: the project's id on the API, its slug on dummy data. */
function useProjectMutation<V>(
  org: string,
  project: string,
  toast: { success: string | ((v: V) => string); error: string },
  call: (projectId: string, variables: V) => Promise<unknown>,
  mock: (variables: V) => Promise<unknown>,
) {
  const source = useDataSource()
  const client = useQueryClient()
  const projectId = useProjectId(org, project)
  return useMutation({
    meta: { toast: defineToast<V>(toast) },
    mutationFn: async (variables: V): Promise<void> => {
      if (source !== 'api') {
        await mock(variables)
        return
      }
      if (!projectId) throw new Error('The project isn’t loaded yet')
      await call(projectId, variables)
    },
    onSuccess: () => invalidateAll(client, projectConnectionKeys(org, project)),
  })
}

export function useAddProjectConnections(org: string, project: string) {
  const ctx = useMockContext()
  return useProjectMutation<string[]>(
    org,
    project,
    {
      success: (ids) => (ids.length === 1 ? 'Account added' : `${ids.length} accounts added`),
      error: 'Couldn’t add the accounts',
    },
    (projectId, ids) => dashboardApi.addProjectConnections(org, projectId, ids),
    (ids) => mockServer.projectConnections.addProjectConnections(ctx, org, project, ids),
  )
}

/** Connect a new account: on the API the token is checked with Cloudflare before anything is stored. */
export function useCreateProjectConnection(org: string, project: string) {
  const ctx = useMockContext()
  return useProjectMutation<NewProjectConnectionInput>(
    org,
    project,
    { success: 'Account connected', error: 'Couldn’t connect the account' },
    (projectId, input) =>
      dashboardApi.createProjectConnection(org, projectId, {
        name: input.name.trim(),
        accountId: input.accountId.trim(),
        token: input.token.trim(),
        makeDefault: input.makeDefault,
      }),
    (input) => mockServer.projectConnections.createProjectConnection(ctx, org, project, input),
  )
}

export function useReplaceProjectConnectionToken(org: string, project: string) {
  const ctx = useMockContext()
  return useProjectMutation<{ connectionId: string; token: string }>(
    org,
    project,
    { success: 'Token replaced', error: 'Couldn’t replace the token' },
    (projectId, v) =>
      dashboardApi.replaceProjectConnectionToken(org, projectId, v.connectionId, v.token.trim()),
    (v) =>
      mockServer.projectConnections.replaceProjectConnectionToken(
        ctx,
        org,
        project,
        v.connectionId,
        v.token,
      ),
  )
}

/** Renames an account the project owns. */
export function useRenameProjectConnection(org: string, project: string) {
  const ctx = useMockContext()
  return useProjectMutation<{ connectionId: string; name: string }>(
    org,
    project,
    { success: 'Account renamed', error: 'Couldn’t rename the account' },
    (projectId, v) =>
      dashboardApi.renameProjectConnection(org, projectId, v.connectionId, v.name.trim()),
    (v) =>
      mockServer.projectConnections.renameProjectConnection(
        ctx,
        org,
        project,
        v.connectionId,
        v.name,
      ),
  )
}

export function useRemoveProjectConnection(org: string, project: string) {
  const ctx = useMockContext()
  return useProjectMutation<string>(
    org,
    project,
    { success: 'Account removed', error: 'Couldn’t remove the account' },
    (projectId, connectionId) => dashboardApi.removeProjectConnection(org, projectId, connectionId),
    (connectionId) =>
      mockServer.projectConnections.removeProjectConnection(ctx, org, project, connectionId),
  )
}

export function useSetDefaultConnection(org: string, project: string) {
  const ctx = useMockContext()
  return useProjectMutation<string>(
    org,
    project,
    { success: 'Default account changed', error: 'Couldn’t change the default account' },
    (projectId, connectionId) =>
      dashboardApi.setProjectDefaultConnection(org, projectId, connectionId),
    (connectionId) =>
      mockServer.projectConnections.setProjectDefaultConnection(ctx, org, project, connectionId),
  )
}

export function useSetWorkspaceConnection(org: string, project: string) {
  const ctx = useMockContext()
  return useProjectMutation<{ workspaceId: string; connectionId: string | null }>(
    org,
    project,
    { success: 'Workspace account changed', error: 'Couldn’t change where it deploys' },
    (projectId, v) =>
      dashboardApi.setWorkspaceConnection(org, projectId, v.workspaceId, v.connectionId),
    (v) =>
      mockServer.projectConnections.setWorkspaceConnection(
        ctx,
        org,
        project,
        v.workspaceId,
        v.connectionId,
      ),
  )
}
