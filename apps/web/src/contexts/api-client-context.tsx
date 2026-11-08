import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { api, createApiClient, type ApiClient } from '../lib/api-client'
import { createQueries, queries, type Queries } from '../lib/queries'
import type { ItemApiScope } from '../lib/workflows/route-scope'
import { useOrgStore } from '../stores/org-store'

interface ApiClientValue {
  api: ApiClient
  queries: Queries
  /** The ids a workflow's URL names; null outside one, where calls follow the old switcher. */
  scope: ItemApiScope | null
}

const ApiClientContext = createContext<ApiClientValue>({ api, queries, scope: null })

interface ApiClientProviderProps {
  scope: ItemApiScope | null
  children: ReactNode
}

/**
 * A client and its queries bound to `scope`'s project, one per scope, so a
 * query created with it keeps that project even when it refetches after you
 * have left. With no scope, the switcher's.
 */
export function useScopedClient(scope: ItemApiScope | null): ApiClientValue {
  const organizationId = scope?.organizationId
  const projectId = scope?.projectId
  const workspaceId = scope?.workspaceId
  return useMemo<ApiClientValue>(() => {
    if (!organizationId || !projectId || !workspaceId) return { api, queries, scope: null }
    const fixed = { organizationId, projectId, workspaceId }
    const client = createApiClient(() => fixed)
    return { api: client, queries: createQueries(client), scope: fixed }
  }, [organizationId, projectId, workspaceId])
}

/** Binds every call made under a workflow's URL to the project that URL names. */
export function ApiClientProvider({ scope, children }: ApiClientProviderProps) {
  const value = useScopedClient(scope)
  return <ApiClientContext.Provider value={value}>{children}</ApiClientContext.Provider>
}

/** The API client for where this component is: its workflow's project, else the switcher's. */
export function useApi(): ApiClient {
  return useContext(ApiClientContext).api
}

/** `queries`, built on `useApi()`'s client. */
export function useQueries(): Queries {
  return useContext(ApiClientContext).queries
}

/** The ids of the workflow URL this component is under, or null. */
export function useItemApiScope(): ItemApiScope | null {
  return useContext(ApiClientContext).scope
}

/**
 * Whether `useApi()`'s client can call yet: under a workflow's URL once the
 * app has loaded, elsewhere once the switcher has an org and project.
 */
export function useApiReady(): boolean {
  const scoped = useItemApiScope() !== null
  const appReady = useOrgStore((s) => s.appReady)
  const hasOrg = useOrgStore((s) => s.activeOrganizationId !== null)
  return scoped ? appReady : appReady && hasOrg
}

/** The organization `useApi()`'s client calls: the workflow URL's, else the switcher's. */
export function useApiOrganizationId(): string | null {
  const scoped = useItemApiScope()?.organizationId
  const active = useOrgStore((s) => s.activeOrganizationId)
  return scoped ?? active
}
