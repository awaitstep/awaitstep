import { notFound } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { apiScopeQuery } from '../../data/dashboard/workspaces'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { getQueryClient } from '../../lib/query-client'
import { enterRouteScope } from '../../lib/workflows/route-scope'
import {
  ALLOW_MOCK_SOURCE,
  dataSourceFor,
  type DashboardSearch,
} from '../navigation/dashboard-providers'

interface EditorRouteLoad {
  params: WorkspaceSlugs & { id: string }
  search: Pick<DashboardSearch, 'mock' | 'as'>
  preload: boolean
  signal?: AbortSignal
}

/**
 * The editor route's `beforeLoad`: wait until API calls follow the URL's
 * project. The lookup is the dashboard shell's own scope query, so it is
 * made once. A hover preload changes nothing, and sample data has no project
 * to follow.
 */
export async function openEditorScope(
  { params, search, preload, signal }: EditorRouteLoad,
  client: QueryClient = getQueryClient(),
  allowMock: boolean = ALLOW_MOCK_SOURCE,
): Promise<void> {
  // The dashboard creates a workflow before opening it here, so there is no
  // unsaved `/new` at a workspace URL.
  if (params.id === 'new') throw notFound()
  if (preload || dataSourceFor(search, allowMock) !== 'api') return
  const slugs = { org: params.org, project: params.project, workspace: params.workspace }
  await enterRouteScope(slugs, {
    signal,
    lookup: (s) => client.ensureQueryData(apiScopeQuery(s)),
  })
}
