import { useQuery } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import { dashKeys, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/** Project settings → Variables: each name once, as the project resolves it. */
export function useProjectVariables(org: string, project: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.projectVariables(org, project), ctx),
    queryFn: () => mockServer.variables.listProjectVariables(ctx, org, project),
  })
}

/** Workspace settings → Variables: each name once, the closest level winning. */
export function useWorkspaceVariables(slugs: Required<ScopeSlugs>) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.workspaceVariables(slugs), ctx),
    queryFn: () => mockServer.variables.listWorkspaceVariables(ctx, slugs),
  })
}
