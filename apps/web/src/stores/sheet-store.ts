import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface RunSheetState {
  runId: string
  workflowId: string
  workflowName?: string
}

interface SheetState {
  runSheet: RunSheetState | null
  openRunSheet: (run: RunSheetState) => void
  closeRunSheet: () => void
}

export const useSheetStore = create<SheetState>()(
  persist(
    (set) => ({
      runSheet: null,
      openRunSheet: (run) => set({ runSheet: run }),
      closeRunSheet: () => set({ runSheet: null }),
    }),
    { name: 'awaitstep-sheets' },
  ),
)
