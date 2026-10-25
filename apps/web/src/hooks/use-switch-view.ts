import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { editorSearch, type WorkspaceSurface } from '../lib/workflows/surfaces'

/**
 * Moves within the editor — Canvas ↔ Code, or to another version of the
 * same view — without adding a history entry, so Back leaves the editor
 * instead of replaying every toggle.
 *
 * It is still a router navigation, so the URL stays in sync with the view
 * and the active view's unsaved-changes blocker still gets its say.
 */
export function useSwitchView(workflowId: string) {
  const navigate = useNavigate()
  return useCallback(
    (view: WorkspaceSurface, extra?: { version?: string; file?: string }) =>
      navigate({
        to: '/workflows/$workflowId/editor',
        params: { workflowId },
        search: editorSearch(view, extra),
        replace: true,
      }),
    [navigate, workflowId],
  )
}
