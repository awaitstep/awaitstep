import { create } from 'zustand'
import type { RunSummary } from '../lib/api-client'

type FetchState = 'idle' | 'loading' | 'success' | 'error'

interface RunsState {
  runs: RunSummary[]
  fetchState: FetchState
  setRuns: (runs: RunSummary[]) => void
  setFetchState: (state: FetchState) => void
}

export const useRunsStore = create<RunsState>()((set) => ({
  runs: [],
  fetchState: 'idle',
  setRuns: (runs) => set({ runs }),
  setFetchState: (fetchState) => set({ fetchState }),
}))
