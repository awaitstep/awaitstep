import { createContext, useContext } from 'react'
import type { WorkspaceSlugs } from '../lib/dashboard-paths'

/**
 * The workspace an editor was opened in, when it was opened from the
 * dashboard's workspace URL; null on the old `/workflows/$id/editor` route.
 * Moves within the editor (Canvas ↔ Code) stay on whichever route it is on.
 */
const EditorScopeContext = createContext<WorkspaceSlugs | null>(null)

export const EditorScopeProvider = EditorScopeContext.Provider

export function useEditorScope(): WorkspaceSlugs | null {
  return useContext(EditorScopeContext)
}
