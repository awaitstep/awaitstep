import { useMemo } from 'react'
import { Outlet } from '@tanstack/react-router'
import { EditorScopeProvider } from '../../contexts/editor-scope-context'

interface ItemScopeLayoutProps {
  org: string
  project: string
  workspace: string
}

/**
 * Everything under a workflow's workspace URL knows that workspace, so the
 * links its editor and pages share (Deploy, a run, Back to overview) stay in
 * it instead of falling back to the old `/workflows/…` pages.
 */
export function ItemScopeLayout({ org, project, workspace }: ItemScopeLayoutProps) {
  // One object per workspace: consumers memoise on it.
  const scope = useMemo(() => ({ org, project, workspace }), [org, project, workspace])
  return (
    <EditorScopeProvider value={scope}>
      <Outlet />
    </EditorScopeProvider>
  )
}
