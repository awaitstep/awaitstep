import { create } from 'zustand'
import type { Project } from './org-store'

interface RunSheetState {
  runId: string
  workflowId: string
  workflowName?: string
}

interface SheetState {
  runSheet: RunSheetState | null
  openRunSheet: (run: RunSheetState) => void
  closeRunSheet: () => void

  projectDialog: Project | 'new' | null
  openProjectDialog: (project?: Project) => void
  closeProjectDialog: () => void

  orgDialogOpen: boolean
  openOrgDialog: () => void
  closeOrgDialog: () => void
}

export const useSheetStore = create<SheetState>()(
    (set) => ({
      runSheet: null,
      openRunSheet: (run) => set({ runSheet: run }),
      closeRunSheet: () => set({ runSheet: null }),

      projectDialog: null,
      openProjectDialog: (project) => set({ projectDialog: project ?? 'new' }),
      closeProjectDialog: () => set({ projectDialog: null }),

      orgDialogOpen: false,
      openOrgDialog: () => set({ orgDialogOpen: true }),
      closeOrgDialog: () => set({ orgDialogOpen: false }),
    }),
   
)
