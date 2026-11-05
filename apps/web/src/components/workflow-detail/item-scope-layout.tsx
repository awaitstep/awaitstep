import { useMemo } from 'react'
import { Outlet } from '@tanstack/react-router'
import { ApiClientProvider } from '../../contexts/api-client-context'
import { EditorScopeProvider } from '../../contexts/editor-scope-context'
import type { ItemApiScope } from '../../lib/workflows/route-scope'

interface ItemScopeLayoutProps {
  org: string
  project: string
  workspace: string
  /** The ids the URL names, from the route's `beforeLoad`; null for sample data. */
  scope: ItemApiScope | null
}

/**
 * Everything under a workflow's workspace URL knows that workspace, so the
 * links its editor and pages share (Deploy, a run, Back to overview) stay in
 * it instead of falling back to the old `/workflows/…` pages, and its API calls
 * go to that workspace's project whatever the old switcher has picked.
 */
export function ItemScopeLayout({ org, project, workspace, scope: ids }: ItemScopeLayoutProps) {
  // One object per workspace: consumers memoise on it.
  const scope = useMemo(() => ({ org, project, workspace }), [org, project, workspace])
  return (
    <ApiClientProvider scope={ids}>
      <EditorScopeProvider value={scope}>
        <Outlet />
      </EditorScopeProvider>
    </ApiClientProvider>
  )
}
