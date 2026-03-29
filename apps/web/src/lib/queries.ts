import { infiniteQueryOptions } from '@tanstack/react-query'
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
    list: () =>
      infiniteQueryOptions({
        queryKey: ['api-keys'] as const,
        queryFn: ({ pageParam }) => api.listApiKeys({ cursor: pageParam }),
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
