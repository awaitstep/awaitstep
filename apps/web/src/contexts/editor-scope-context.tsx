import { createContext, useContext } from 'react'
import type { WorkspaceSlugs } from '../lib/dashboard-paths'

/**
 * The workspace a workflow's editor and pages are open in
 * (`/{org}/{project}/{workspace}/workflows/{id}`); null anywhere else.
 */
const EditorScopeContext = createContext<WorkspaceSlugs | null>(null)

export const EditorScopeProvider = EditorScopeContext.Provider

export function useEditorScope(): WorkspaceSlugs | null {
  return useContext(EditorScopeContext)
}

/**
 * The workspace a workflow's editor or page is open in. Those only render
 * under `ItemScopeLayout`, so a missing one is a wiring bug, not a state.
 */
export function useItemSlugs(): WorkspaceSlugs {
  const scope = useContext(EditorScopeContext)
  if (!scope) throw new Error('A workflow’s page rendered outside its workspace URL')
  return scope
}

/** What the viewer may do to the item an editor shows, from their workspace role. */
export interface EditorAccess {
  canEdit: boolean
  canDeploy: boolean
  /** Stop sharing a function shared from here. */
  canShare: boolean
  /** Move it to another workspace: this workspace's admins only. */
  canMove: boolean
  /** Why editing is refused, worded for the user; null when it isn't. */
  reason: string | null
}

// Fail closed: outside `ItemScopeLayout` nothing says what the viewer may do.
const NO_ACCESS: EditorAccess = {
  canEdit: false,
  canDeploy: false,
  canShare: false,
  canMove: false,
  reason: null,
}

const EditorAccessContext = createContext<EditorAccess>(NO_ACCESS)

export const EditorAccessProvider = EditorAccessContext.Provider

export function useEditorAccess(): EditorAccess {
  return useContext(EditorAccessContext)
}
