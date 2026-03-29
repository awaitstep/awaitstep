import { create } from 'zustand'
import type { WorkflowSummary } from '../lib/api-client'

type FetchState = 'idle' | 'loading' | 'success' | 'error'

interface WorkflowsState {
  workflows: WorkflowSummary[]
  fetchState: FetchState
  hasMore: boolean
  loadMore: (() => void) | null
  isFetchingMore: boolean
  setWorkflows: (workflows: WorkflowSummary[]) => void
  setFetchState: (state: FetchState) => void
  setPagination: (hasMore: boolean, loadMore: (() => void) | null) => void
  setIsFetchingMore: (isFetchingMore: boolean) => void
}

export const useWorkflowsStore = create<WorkflowsState>()((set) => ({
  workflows: [],
  fetchState: 'idle',
  hasMore: false,
  loadMore: null,
  isFetchingMore: false,
  setWorkflows: (workflows) => set({ workflows }),
  setFetchState: (fetchState) => set({ fetchState }),
  setPagination: (hasMore, loadMore) => set({ hasMore, loadMore }),
  setIsFetchingMore: (isFetchingMore) => set({ isFetchingMore }),
}))
