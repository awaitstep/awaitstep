import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { EditorScopeProvider } from '../../../../contexts/editor-scope-context'

export const SLUGS = { org: 'acme', project: 'core', workspace: 'sales' }
export const BASE = '/acme/core/sales/workflows/wf_1'

/** Renders in the workspace with `pages` already loaded under each query key. */
export function renderWithPages(ui: ReactNode, pages: Record<string, unknown[]>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  for (const [key, data] of Object.entries(pages)) {
    client.setQueryData(JSON.parse(key), {
      pages: [{ data, nextCursor: null }],
      pageParams: [undefined],
    })
  }
  return render(
    <QueryClientProvider client={client}>
      <EditorScopeProvider value={SLUGS}>{ui}</EditorScopeProvider>
    </QueryClientProvider>,
  )
}

export const VERSIONS = [
  {
    id: 'v3',
    version: 12,
    locked: 0,
    createdAt: '2026-11-05T10:00:00.000Z',
    createdByName: 'Ama Mensah',
  },
  { id: 'v2', version: 11, locked: 0, createdAt: '2026-11-04T10:00:00.000Z', createdByName: null },
  {
    id: 'v1',
    version: 10,
    locked: 0,
    createdAt: '2026-11-03T10:00:00.000Z',
    createdByName: 'Lena Ortiz',
  },
]
