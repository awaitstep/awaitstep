import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import type { VariableInput, VariableScope } from '../../types/dashboard/variables'
import { dashKeys, invalidateAll, withMockContext } from './keys'
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

/** What a variable change shows up in: every Variables list and the setup counts. */
function variableKeys(org: string) {
  return [dashKeys.inOrg('variables', org), dashKeys.inOrg('setup', org)]
}

/** New variable, Edit, or Override. */
export function useSetVariable(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: VariableInput) => mockServer.variables.setVariable(ctx, org, input),
    onSuccess: () => invalidateAll(client, variableKeys(org)),
  })
}

export function useDeleteVariable(org: string) {
  const ctx = useMockContext()
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ scope, name }: { scope: VariableScope; name: string }) =>
      mockServer.variables.deleteVariable(ctx, org, scope, name),
    onSuccess: () => invalidateAll(client, variableKeys(org)),
  })
}
