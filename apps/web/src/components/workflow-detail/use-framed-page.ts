import { useParams } from '@tanstack/react-router'
import { useDataSource } from '../../data/dashboard/source'
import type { WorkspaceSlugs } from '../../lib/dashboard-paths'
import { useInOtherWorkspace } from '../../lib/workflows/route-scope'
import type { ScopeSlugs } from '../../types/dashboard/scope'
import type { DashboardPage } from '../navigation/dashboard-page'
import { useScopedWorkflow } from './use-scoped-workflow'

/**
 * The page the frame shows. A workflow's own pages declare only which page
 * they are; the frame also needs the item, for its breadcrumb and for which
 * list (Workflows or Functions) the panel marks.
 */
export function useFramedPage(declared: DashboardPage | null, slugs: ScopeSlugs) {
  const { id } = useParams({ strict: false }) as { id?: string }
  const source = useDataSource()
  const isItem = declared?.kind === 'item' && !!id
  const workflow = useScopedWorkflow(slugs as WorkspaceSlugs, id ?? '', isItem && source === 'api')
  const inOtherWorkspace = useInOtherWorkspace(workflow.data)
  if (declared?.kind !== 'item' || !id) return declared
  // Not this workspace's: the page says not found, so the frame doesn't name it either.
  const data = inOtherWorkspace ? undefined : workflow.data
  return {
    ...declared,
    item: { id, name: data?.name, kind: data ? (data.kind ?? 'workflow') : undefined },
  } satisfies DashboardPage
}
