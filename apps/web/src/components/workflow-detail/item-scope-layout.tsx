import { useMemo } from 'react'
import { Outlet } from '@tanstack/react-router'
import { ApiClientProvider } from '../../contexts/api-client-context'
import {
  EditorAccessProvider,
  EditorScopeProvider,
  type EditorAccess,
} from '../../contexts/editor-scope-context'
import { VIEW_ONLY_MESSAGE } from '../../lib/ide/editability'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
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
  const access = useEditorAccessFor(scope)
  return (
    <ApiClientProvider scope={ids}>
      <EditorScopeProvider value={scope}>
        <EditorAccessProvider value={access}>
          <Outlet />
        </EditorAccessProvider>
      </EditorScopeProvider>
    </ApiClientProvider>
  )
}

const NO_ACCESS_YET: EditorAccess = { canEdit: false, canDeploy: false, reason: null }

/** The viewer's edit and deploy rights in this workspace; none until its scope is known. */
function useEditorAccessFor(slugs: { org: string; project: string; workspace: string }) {
  const can = useWorkspaceScope(slugs)?.workspace.viewerCan
  const canEdit = can?.edit.allowed ?? false
  const canDeploy = can?.deploy.allowed ?? false
  const reason = can && !can.edit.allowed ? (can.edit.reason ?? VIEW_ONLY_MESSAGE) : null
  return useMemo<EditorAccess>(
    () => (can ? { canEdit, canDeploy, reason } : NO_ACCESS_YET),
    [can, canEdit, canDeploy, reason],
  )
}
