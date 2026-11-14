import { create } from 'zustand'

/** Unsaved field edits to one node, and the saved data they were started from. */
export interface NodeFieldDraft {
  /** `JSON.stringify` of the node's saved data when editing began. */
  base: string
  data: Record<string, unknown>
}

interface NodeFieldDraftsState {
  /** By `<workflowId>:<nodeId>`, so one workflow's edits never show on another. */
  drafts: Readonly<Record<string, NodeFieldDraft>>
  /** Why a node's last Save failed, by the same key. */
  errors: Readonly<Record<string, string>>
  setDraft: (key: string, draft: NodeFieldDraft) => void
  dropDraft: (key: string) => void
  setError: (key: string, error: string | null) => void
}

function without<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const { [key]: _dropped, ...rest } = record
  return rest
}

/**
 * Field edits typed in Code's node details and not yet handed to the
 * workspace's pending graph edits, with why the last Save was refused. They
 * outlive the panel, so picking another node and coming back keeps them;
 * Save, Discard, or new data on that node ends a draft.
 */
export const useNodeFieldDraftsStore = create<NodeFieldDraftsState>()((set) => ({
  drafts: {},
  errors: {},
  setDraft: (key, draft) =>
    set((state) => ({
      drafts: { ...state.drafts, [key]: draft },
      errors: without(state.errors, key),
    })),
  dropDraft: (key) =>
    set((state) => ({ drafts: without(state.drafts, key), errors: without(state.errors, key) })),
  setError: (key, error) =>
    set((state) => ({
      errors: error === null ? without(state.errors, key) : { ...state.errors, [key]: error },
    })),
}))

export function nodeDraftKey(workflowId: string, nodeId: string): string {
  return `${workflowId}:${nodeId}`
}
