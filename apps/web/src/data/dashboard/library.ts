import { useQuery } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import { dashKeys, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/** A workspace's modules and resource nodes: always empty until W2. */
export function useWorkspaceLibrary(slugs: Required<ScopeSlugs>) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.library(slugs), ctx),
    queryFn: () => mockServer.items.listLibrary(ctx, slugs),
  })
}
