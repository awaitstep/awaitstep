import { useQuery } from '@tanstack/react-query'
import { mockServer } from '../../mocks/dashboard/server'
import { dashKeys, withMockContext } from './keys'
import { useMockContext } from './scenario-context'

/** Project settings → Members: whole-project people and workspace-only people. */
export function useProjectMembers(org: string, project: string) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.projectMembers(org, project), ctx),
    queryFn: () => mockServer.members.listProjectMembers(ctx, org, project),
  })
}

/** Everyone in the org; `enabled: false` waits until a picker opens. */
export function useOrgPeople(org: string, { enabled = true }: { enabled?: boolean } = {}) {
  const ctx = useMockContext()
  return useQuery({
    queryKey: withMockContext(dashKeys.orgPeople(org), ctx),
    queryFn: () => mockServer.members.listOrgPeople(ctx, org),
    enabled,
  })
}
