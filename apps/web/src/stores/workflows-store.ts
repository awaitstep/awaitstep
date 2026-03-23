import { create } from 'zustand'
import type { WorkflowSummary } from '../lib/api-client'

type FetchState = 'idle' | 'loading' | 'success' | 'error'

interface WorkflowsState {
  workflows: WorkflowSummary[]
  fetchState: FetchState
  setWorkflows: (workflows: WorkflowSummary[]) => void
  setFetchState: (state: FetchState) => void
}

export const useWorkflowsStore = create<WorkflowsState>()((set) => ({
  workflows: [],
  fetchState: 'idle',
  setWorkflows: (workflows) => set({ workflows }),
  setFetchState: (fetchState) => set({ fetchState }),
}))
