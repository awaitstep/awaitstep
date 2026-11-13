import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { SaveNodeFieldsOutcome } from '../../lib/ide/step-create'

export interface NodeEditValue {
  /** The workspace accepts edits right now (the current version, a role that may edit). */
  canEdit: boolean
  /** Saves one node's field edits (from `base`) as the next version. */
  saveNodeFields: (
    nodeId: string,
    edited: Record<string, unknown>,
    base: Record<string, unknown>,
  ) => Promise<SaveNodeFieldsOutcome>
}

const NodeEditContext = createContext<NodeEditValue | null>(null)

/** What Code may change on a node from its details, and how it is saved. */
export function NodeEditProvider({
  canEdit,
  saveNodeFields,
  children,
}: NodeEditValue & { children: ReactNode }) {
  const value = useMemo(() => ({ canEdit, saveNodeFields }), [canEdit, saveNodeFields])
  return <NodeEditContext.Provider value={value}>{children}</NodeEditContext.Provider>
}

/** Null outside the workspace (a preview, a test): the details stay read-only. */
export function useNodeEdit(): NodeEditValue | null {
  return useContext(NodeEditContext)
}
