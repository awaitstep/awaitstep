import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LocalTestMode = 'canvas' | 'ide'

interface LocalTestState {
  open: boolean
  mode: LocalTestMode
  /** The workflow the open panel belongs to; a different workflow hides it. */
  workflowId: string | null
  triggerInput: string
  /** Bumped when a surface asks to close; the panel decides whether to prompt. */
  closeRequested: number
  openFor: (workflowId: string, mode: LocalTestMode) => void
  requestClose: () => void
  close: () => void
  setTriggerInput: (value: string) => void
}

/**
 * The local test panel outlives the surface that opened it. Closing it hides
 * the panel; it never stops the server. The mode is which workspace opened it,
 * so a session started from the canvas is still there from the IDE.
 */
export const useLocalTestStore = create<LocalTestState>()(
  persist(
    (set) => ({
      open: false,
      mode: 'canvas',
      workflowId: null,
      triggerInput: '{}',
      closeRequested: 0,
      openFor: (workflowId, mode) => set({ open: true, workflowId, mode }),
      requestClose: () => set((state) => ({ closeRequested: state.closeRequested + 1 })),
      close: () => set({ open: false }),
      setTriggerInput: (triggerInput) => set({ triggerInput }),
    }),
    {
      name: 'awaitstep-local-test',
      partialize: (state) => ({
        open: state.open,
        mode: state.mode,
        workflowId: state.workflowId,
        triggerInput: state.triggerInput,
      }),
    },
  ),
)
