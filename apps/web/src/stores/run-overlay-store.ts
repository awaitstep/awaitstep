import { create } from 'zustand'

/** `timed_out`: a wait whose event never came; the run went on down its timeout path. */
export type StepStatus = 'complete' | 'running' | 'errored' | 'timed_out' | 'pending' | 'skipped'

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
