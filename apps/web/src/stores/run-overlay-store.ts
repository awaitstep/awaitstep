import { create } from 'zustand'

export type StepStatus = 'complete' | 'running' | 'errored' | 'pending' | 'skipped'

interface RunOverlayState {
  active: boolean
  nodeStatuses: Record<string, StepStatus>
  setOverlay: (statuses: Record<string, StepStatus>) => void
  clearOverlay: () => void
}

export const useRunOverlayStore = create<RunOverlayState>((set) => ({
  active: false,
  nodeStatuses: {},

  setOverlay: (statuses) => {
    set({ active: true, nodeStatuses: statuses })
  },

  clearOverlay: () => {
    set({ active: false, nodeStatuses: {} })
  },
}))
