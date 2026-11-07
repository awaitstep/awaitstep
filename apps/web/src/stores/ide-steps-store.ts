import { create } from 'zustand'
import type { StepPlacement } from '@awaitstep/codegen'

interface IdeStepsState {
  /**
   * The placement the Steps view is collecting a name for, or null when no
   * name row is open. The palette and the view's own controls only ask for a
   * placement here; the row itself lives in the Steps view.
   */
  create: StepPlacement | null
  beginCreate: (placement: StepPlacement) => void
  endCreate: () => void
  reset: () => void
}

/** Step-creation interaction state the palette and the Steps view both drive. */
export const useIdeStepsStore = create<IdeStepsState>((set) => ({
  create: null,
  beginCreate: (create) => set({ create }),
  endCreate: () => set({ create: null }),
  reset: () => set({ create: null }),
}))
