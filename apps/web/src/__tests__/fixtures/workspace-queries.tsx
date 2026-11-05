import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { SourceFile } from '../../lib/api-client'
import { ItemTestScope } from './item-scope'

export const WORKFLOW_ID = 'wf_1'

export function createWorkspaceClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  })
}

export interface SeedOptions {
  files?: SourceFile[]
  workflow?: Record<string, unknown>
  versionParam?: string
  versions?: { id: string; version: number }[]
  currentVersionId?: string
}

/** Puts a workflow's full and source responses in the cache so no request is made. */
export function seedWorkspaceQueries(client: QueryClient, options: SeedOptions = {}) {
  const currentVersionId = options.currentVersionId ?? 'v-2'
  const versions = options.versions ?? [
    { id: 'v-2', version: 2 },
    { id: 'v-1', version: 1 },
  ]
  client.setQueryData(['workflow-full', WORKFLOW_ID, options.versionParam], {
    workflow: {
      id: WORKFLOW_ID,
      name: 'Orders',
      kind: 'workflow',
      currentVersionId,
      ...options.workflow,
    },
    version: { id: currentVersionId, version: 2 },
    versions,
    handlers: { modules: [] },
    activeDeployment: null,
  })
  client.setQueryData(['workflow-source', WORKFLOW_ID, options.versionParam], {
    files: options.files ?? [
      { path: 'workflow.ts', source: 'export {}\n', role: 'entry', hash: 'h1' },
      { path: 'generated.ts', source: '// gen\n', role: 'config' },
    ],
    primary: 'workflow.ts',
    entry: 'workflow.ts',
    manifest: null,
    versionId: currentVersionId,
    diagnostics: [],
  })
}

export function workspaceWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ItemTestScope>{children}</ItemTestScope>
      </QueryClientProvider>
    )
  }
}
