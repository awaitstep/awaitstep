import { notFound } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { apiScopeQuery } from '../../data/dashboard/workspaces'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { getQueryClient } from '../../lib/query-client'
import { resolveItemScope, type ItemApiScope } from '../../lib/workflows/route-scope'

interface EditorRouteLoad {
  params: WorkspaceSlugs & { id: string }
}

/**
 * The item route's `beforeLoad`: the ids its URL names, handed to every call
 * made under it as route context (the org store is never touched). The lookup
 * is the dashboard shell's own scope query, so it is made once.
 */
export async function openEditorScope(
  { params }: EditorRouteLoad,
  client: QueryClient = getQueryClient(),
): Promise<{ itemScope: ItemApiScope | null }> {
  // The dashboard creates a workflow before opening it here, so there is no
  // unsaved `/new` at a workspace URL.
  if (params.id === 'new') throw notFound()
  const slugs = { org: params.org, project: params.project, workspace: params.workspace }
  const itemScope = await resolveItemScope(slugs, (s) => client.ensureQueryData(apiScopeQuery(s)))
  return { itemScope }
}
