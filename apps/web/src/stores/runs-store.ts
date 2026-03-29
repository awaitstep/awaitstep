import { create } from 'zustand'
import type { RunSummary } from '../lib/api-client'

type FetchState = 'idle' | 'loading' | 'success' | 'error'

interface RunsState {
  runs: RunSummary[]
  fetchState: FetchState
  hasMore: boolean
  loadMore: (() => void) | null
  isFetchingMore: boolean
  setRuns: (runs: RunSummary[]) => void
  setFetchState: (state: FetchState) => void
  setPagination: (hasMore: boolean, loadMore: (() => void) | null) => void
  setIsFetchingMore: (isFetchingMore: boolean) => void
}

export const useRunsStore = create<RunsState>()((set) => ({
  runs: [],
  fetchState: 'idle',
  hasMore: false,
  loadMore: null,
  isFetchingMore: false,
  setRuns: (runs) => set({ runs }),
  setFetchState: (fetchState) => set({ fetchState }),
  setPagination: (hasMore, loadMore) => set({ hasMore, loadMore }),
  setIsFetchingMore: (isFetchingMore) => set({ isFetchingMore }),
}))
