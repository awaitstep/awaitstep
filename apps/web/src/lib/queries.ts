import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api, type ApiClient } from './api-client'

const infiniteDefaults = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage: { nextCursor: string | null }) => lastPage.nextCursor ?? undefined,
} as const

/** The query options for `client`'s calls; a workflow's pages get theirs from `useQueries`. */
export function createQueries(client: ApiClient) {
  return {
    workflows: {
      /** Under the key the editor, Overview and the frame share, so a rename shows everywhere. */
      detail: (workflowId: string) =>
        queryOptions({
          queryKey: ['workflow', workflowId] as const,
          queryFn: () => client.getWorkflow(workflowId),
        }),
      list: (projectId: string) =>
        infiniteQueryOptions({
          queryKey: ['workflows', projectId] as const,
          queryFn: ({ pageParam }) => client.listWorkflows({ cursor: pageParam }),
          ...infiniteDefaults,
        }),
      full: (workflowId: string, versionId?: string) =>
        queryOptions({
          queryKey: ['workflow-full', workflowId, versionId] as const,
          queryFn: () => client.getWorkflowFull(workflowId, versionId),
          retry: false,
        }),
      source: (workflowId: string, versionId?: string) =>
        queryOptions({
          queryKey: ['workflow-source', workflowId, versionId] as const,
          queryFn: () => client.getWorkflowSource(workflowId, versionId),
          retry: false,
        }),
      handlerConversion: (workflowId: string) =>
        queryOptions({
          queryKey: ['workflow-handler-conversion', workflowId] as const,
          queryFn: () => client.previewHandlerConversion(workflowId),
          // A dry run over the current file: never serve a stale plan.
          staleTime: 0,
          gcTime: 0,
          retry: false,
        }),
    },

    connections: {
      /** Under `DEPLOY_CONNECTIONS`, so a change to a project's accounts refreshes it. */
      forDeploy: (workflowId: string) =>
        queryOptions({
          queryKey: ['deploy-connections', workflowId] as const,
          queryFn: () => client.getDeployConnections(workflowId),
        }),
      list: (orgId: string) =>
        infiniteQueryOptions({
          queryKey: ['connections', orgId] as const,
          queryFn: ({ pageParam }) => client.listConnections({ cursor: pageParam }),
          ...infiniteDefaults,
        }),
    },

    projects: {
      list: (orgId: string) =>
        infiniteQueryOptions({
          queryKey: ['projects', orgId] as const,
          queryFn: ({ pageParam }) => client.listProjects({ cursor: pageParam }),
          ...infiniteDefaults,
        }),
    },

    runs: {
      byWorkflow: (workflowId: string) =>
        infiniteQueryOptions({
          queryKey: ['workflow-runs', workflowId] as const,
          queryFn: ({ pageParam }) => client.listWorkflowRuns(workflowId, { cursor: pageParam }),
          ...infiniteDefaults,
        }),
    },

    deployments: {
      byWorkflow: (workflowId: string) =>
        infiniteQueryOptions({
          queryKey: ['deployments', workflowId] as const,
          queryFn: ({ pageParam }) => client.listDeployments(workflowId, { cursor: pageParam }),
          ...infiniteDefaults,
        }),
    },

    versions: {
      byWorkflow: (workflowId: string) =>
        infiniteQueryOptions({
          queryKey: ['versions', workflowId] as const,
          queryFn: ({ pageParam }) => client.listVersions(workflowId, { cursor: pageParam }),
          ...infiniteDefaults,
        }),
    },

    apiKeys: {
      list: (projectId?: string) =>
        infiniteQueryOptions({
          queryKey: ['api-keys', projectId ?? 'all'] as const,
          queryFn: ({ pageParam }) => client.listApiKeys({ cursor: pageParam, projectId }),
          ...infiniteDefaults,
        }),
    },
  }
}

export type Queries = ReturnType<typeof createQueries>

export const queries = createQueries(api)

/** Flatten all pages from an infinite query into a single array */
export function flatPages<T>(data: { pages: { data: T[] }[] } | undefined): T[] {
  return data?.pages.flatMap((p) => p.data) ?? []
}
