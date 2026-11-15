import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { FieldUpdate, NodeSettings, SaveNodeFieldsOutcome } from '../../lib/ide/step-create'

export interface NodeEditValue {
  /** The workspace accepts edits right now (the current version, a role that may edit). */
  canEdit: boolean
  /** Why editing is refused right now (a read-only version, a Viewer), or null. */
  readOnlyReason?: string | null
  /** Records an edit to one node's fields as a pending graph edit; Save writes it. */
  saveNodeFields: (nodeId: string, update: FieldUpdate) => SaveNodeFieldsOutcome
  /** Records any change the node's settings panel makes: fields, name, connections. */
  saveNodeEdit?: (
    nodeId: string,
    update: (current: NodeSettings) => NodeSettings,
  ) => SaveNodeFieldsOutcome
}

const NodeEditContext = createContext<NodeEditValue | null>(null)

/** What Code may change on a node from its details, and how it is saved. */
export function NodeEditProvider({
  canEdit,
  readOnlyReason = null,
  saveNodeFields,
  saveNodeEdit,
  children,
}: NodeEditValue & { children: ReactNode }) {
  const value = useMemo(
    () => ({ canEdit, readOnlyReason, saveNodeFields, saveNodeEdit }),
    [canEdit, readOnlyReason, saveNodeFields, saveNodeEdit],
  )
  return <NodeEditContext.Provider value={value}>{children}</NodeEditContext.Provider>
}

/** Null outside the workspace (a preview, a test): the details stay read-only. */
export function useNodeEdit(): NodeEditValue | null {
  return useContext(NodeEditContext)
}
