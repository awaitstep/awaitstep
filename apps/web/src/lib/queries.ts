import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { api } from './api-client'

const infiniteDefaults = {
  initialPageParam: undefined as string | undefined,
  getNextPageParam: (lastPage: { nextCursor: string | null }) => lastPage.nextCursor ?? undefined,
} as const

export const queries = {
  workflows: {
    list: (projectId: string) =>
      infiniteQueryOptions({
        queryKey: ['workflows', projectId] as const,
        queryFn: ({ pageParam }) => api.listWorkflows({ cursor: pageParam }),
        ...infiniteDefaults,
      }),
    full: (workflowId: string, versionId?: string) =>
      queryOptions({
        queryKey: ['workflow-full', workflowId, versionId] as const,
        queryFn: () => api.getWorkflowFull(workflowId, versionId),
        retry: false,
      }),
    source: (workflowId: string, versionId?: string) =>
      queryOptions({
        queryKey: ['workflow-source', workflowId, versionId] as const,
        queryFn: () => api.getWorkflowSource(workflowId, versionId),
        retry: false,
      }),
    handlerConversion: (workflowId: string) =>
      queryOptions({
        queryKey: ['workflow-handler-conversion', workflowId] as const,
        queryFn: () => api.previewHandlerConversion(workflowId),
        // A dry run over the current file: never serve a stale plan.
        staleTime: 0,
        gcTime: 0,
        retry: false,
      }),
  },

  connections: {
    list: (orgId: string) =>
      infiniteQueryOptions({
        queryKey: ['connections', orgId] as const,
        queryFn: ({ pageParam }) => api.listConnections({ cursor: pageParam }),
        ...infiniteDefaults,
      }),
  },

  projects: {
    list: (orgId: string) =>
      infiniteQueryOptions({
        queryKey: ['projects', orgId] as const,
        queryFn: ({ pageParam }) => api.listProjects({ cursor: pageParam }),
        ...infiniteDefaults,
      }),
  },

  runs: {
    all: (projectId: string) =>
      infiniteQueryOptions({
        queryKey: ['all-runs', projectId] as const,
        queryFn: ({ pageParam }) => api.listAllRuns({ cursor: pageParam }),
        ...infiniteDefaults,
      }),
    byWorkflow: (workflowId: string) =>
      infiniteQueryOptions({
        queryKey: ['workflow-runs', workflowId] as const,
        queryFn: ({ pageParam }) => api.listWorkflowRuns(workflowId, { cursor: pageParam }),
        ...infiniteDefaults,
      }),
  },

  deployments: {
    byWorkflow: (workflowId: string) =>
      infiniteQueryOptions({
        queryKey: ['deployments', workflowId] as const,
        queryFn: ({ pageParam }) => api.listDeployments(workflowId, { cursor: pageParam }),
        ...infiniteDefaults,
      }),
  },

  versions: {
    byWorkflow: (workflowId: string) =>
      infiniteQueryOptions({
        queryKey: ['versions', workflowId] as const,
        queryFn: ({ pageParam }) => api.listVersions(workflowId, { cursor: pageParam }),
        ...infiniteDefaults,
      }),
  },

  envVars: {
    list: () =>
      infiniteQueryOptions({
        queryKey: ['env-vars'] as const,
        queryFn: ({ pageParam }) => api.listEnvVars({ cursor: pageParam }),
        ...infiniteDefaults,
      }),
  },

  apiKeys: {
    list: (projectId?: string) =>
      infiniteQueryOptions({
        queryKey: ['api-keys', projectId ?? 'all'] as const,
        queryFn: ({ pageParam }) => api.listApiKeys({ cursor: pageParam, projectId }),
        ...infiniteDefaults,
      }),
  },

  installedNodes: {
    list: (orgId: string) =>
      infiniteQueryOptions({
        queryKey: ['installed-nodes', orgId] as const,
        queryFn: ({ pageParam }) => api.listInstalledNodes({ cursor: pageParam }),
        ...infiniteDefaults,
      }),
  },
}

/** Flatten all pages from an infinite query into a single array */
export function flatPages<T>(data: { pages: { data: T[] }[] } | undefined): T[] {
  return data?.pages.flatMap((p) => p.data) ?? []
}
