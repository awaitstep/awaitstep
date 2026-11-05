import { notFound } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { apiScopeQuery } from '../../data/dashboard/workspaces'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { getQueryClient } from '../../lib/query-client'
import { resolveItemScope, type ItemApiScope } from '../../lib/workflows/route-scope'
import {
  ALLOW_MOCK_SOURCE,
  dataSourceFor,
  type DashboardSearch,
} from '../navigation/dashboard-providers'

interface EditorRouteLoad {
  params: WorkspaceSlugs & { id: string }
  search: Pick<DashboardSearch, 'mock' | 'as'>
}

/**
 * The item route's `beforeLoad`: the ids its URL names, handed to every call
 * made under it as route context (the org store is never touched). The lookup
 * is the dashboard shell's own scope query, so it is made once. Sample data
 * has no project to call.
 */
export async function openEditorScope(
  { params, search }: EditorRouteLoad,
  client: QueryClient = getQueryClient(),
  allowMock: boolean = ALLOW_MOCK_SOURCE,
): Promise<{ itemScope: ItemApiScope | null }> {
  // The dashboard creates a workflow before opening it here, so there is no
  // unsaved `/new` at a workspace URL.
  if (params.id === 'new') throw notFound()
  if (dataSourceFor(search, allowMock) !== 'api') return { itemScope: null }
  const slugs = { org: params.org, project: params.project, workspace: params.workspace }
  const itemScope = await resolveItemScope(slugs, (s) => client.ensureQueryData(apiScopeQuery(s)))
  return { itemScope }
}
