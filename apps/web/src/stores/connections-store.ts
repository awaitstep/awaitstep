import { create } from 'zustand'
import type { ConnectionSummary } from '../lib/api-client'

type FetchState = 'idle' | 'loading' | 'success' | 'error'

interface ConnectionsState {
  connections: ConnectionSummary[]
  fetchState: FetchState
  setConnections: (connections: ConnectionSummary[]) => void
  setFetchState: (state: FetchState) => void
}

export const useConnectionsStore = create<ConnectionsState>()((set) => ({
  connections: [],
  fetchState: 'idle',
  setConnections: (connections) => set({ connections }),
  setFetchState: (fetchState) => set({ fetchState }),
}))
