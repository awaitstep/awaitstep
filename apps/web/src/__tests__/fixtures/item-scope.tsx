import type { ReactNode } from 'react'
import { EditorAccessProvider, EditorScopeProvider } from '../../contexts/editor-scope-context'

export const ITEM_SLUGS = { org: 'acme', project: 'core', workspace: 'sales' }

const EDITOR_ACCESS = { canEdit: true, canDeploy: true, reason: null }

/** What `ItemScopeLayout` gives a workflow's editor: its workspace, as an Editor. */
export function ItemTestScope({ children }: { children: ReactNode }) {
  return (
    <EditorScopeProvider value={ITEM_SLUGS}>
      <EditorAccessProvider value={EDITOR_ACCESS}>{children}</EditorAccessProvider>
    </EditorScopeProvider>
  )
}
