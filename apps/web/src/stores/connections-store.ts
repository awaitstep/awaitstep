import { create } from 'zustand'
import type { ConnectionSummary } from '../lib/api-client'

type FetchState = 'idle' | 'loading' | 'success' | 'error'

interface ConnectionsState {
  connections: ConnectionSummary[]
  fetchState: FetchState
  hasMore: boolean
  loadMore: (() => void) | null
  isFetchingMore: boolean
  setConnections: (connections: ConnectionSummary[]) => void
  setFetchState: (state: FetchState) => void
  setPagination: (hasMore: boolean, loadMore: (() => void) | null) => void
  setIsFetchingMore: (isFetchingMore: boolean) => void
}

export const useConnectionsStore = create<ConnectionsState>()((set) => ({
  connections: [],
  fetchState: 'idle',
  hasMore: false,
  loadMore: null,
  isFetchingMore: false,
  setConnections: (connections) => set({ connections }),
  setFetchState: (fetchState) => set({ fetchState }),
  setPagination: (hasMore, loadMore) => set({ hasMore, loadMore }),
  setIsFetchingMore: (isFetchingMore) => set({ isFetchingMore }),
}))
