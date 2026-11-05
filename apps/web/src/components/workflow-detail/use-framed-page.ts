import { useQuery } from '@tanstack/react-query'
import { useParams } from '@tanstack/react-router'
import { useScopedClient } from '../../contexts/api-client-context'
import { useDataSource } from '../../data/dashboard/source'
import { isInOtherWorkspace, itemScopeFrom } from '../../lib/workflows/route-scope'
import type { ScopeLookup } from '../../types/dashboard/scope'
import type { DashboardPage } from '../navigation/dashboard-page'

/**
 * The page the frame shows. A workflow's own pages declare only which page
 * they are; the frame also needs the item, for its breadcrumb and for which
 * list (Workflows or Functions) the panel marks. The frame sits above the
 * item's route, so it reads the item through the project its own scope
 * lookup names, the same one the route hands down.
 */
export function useFramedPage(declared: DashboardPage | null, lookup: ScopeLookup | undefined) {
  const { id } = useParams({ strict: false }) as { id?: string }
  const source = useDataSource()
  const isItem = declared?.kind === 'item' && !!id
  const itemScope = source === 'api' ? itemScopeFrom(lookup) : null
  const { queries } = useScopedClient(itemScope)
  const workflow = useQuery({
    ...queries.workflows.detail(id ?? ''),
    enabled: isItem && itemScope !== null,
  })
  const inOtherWorkspace = isInOtherWorkspace(workflow.data, itemScope?.workspaceId)
  if (declared?.kind !== 'item' || !id) return declared
  // Not this workspace's: the page says not found, so the frame doesn't name it either.
  const data = inOtherWorkspace ? undefined : workflow.data
  return {
    ...declared,
    item: { id, name: data?.name, kind: data ? (data.kind ?? 'workflow') : undefined },
  } satisfies DashboardPage
}
