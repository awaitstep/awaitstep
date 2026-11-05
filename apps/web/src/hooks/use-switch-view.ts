import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useItemSlugs } from '../contexts/editor-scope-context'
import { editorSearch, type WorkspaceSurface } from '../lib/workflows/surfaces'

/**
 * Moves within the editor — Canvas ↔ Code, or to another version of the
 * same view — without adding a history entry, so Back leaves the editor
 * instead of replaying every toggle. It stays on the workflow's workspace URL.
 *
 * It is still a router navigation, so the URL stays in sync with the view
 * and the active view's unsaved-changes blocker still gets its say.
 */
export function useSwitchView(workflowId: string) {
  const navigate = useNavigate()
  const scope = useItemSlugs()
  return useCallback(
    (view: WorkspaceSurface, extra?: { version?: string; file?: string; node?: string }) =>
      navigate({
        to: '/$org/$project/$workspace/workflows/$id',
        params: { ...scope, id: workflowId },
        search: editorSearch(view, extra),
        replace: true,
      }),
    [navigate, scope, workflowId],
  )
}
