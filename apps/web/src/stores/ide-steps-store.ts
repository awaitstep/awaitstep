import { create } from 'zustand'
import type { StepPlacement } from '@awaitstep/codegen'

export interface StepPickerRequest {
  /** The step whose choices lead the list (the palette's active step), or null. */
  preferredNodeId: string | null
  /** A placement the dialog opens on (a row menu's choice), or null. */
  placement: StepPlacement | null
}

interface IdeStepsState {
  /** The add-step dialog was asked for, with an optional step/placement to lead with. */
  picker: StepPickerRequest | null
  openPicker: (preferredNodeId?: string | null, placement?: StepPlacement | null) => void
  closePicker: () => void
  reset: () => void
}

/** Step-creation interaction state the palette, the Explorer and the Steps view all drive. */
export const useIdeStepsStore = create<IdeStepsState>((set) => ({
  picker: null,
  openPicker: (preferredNodeId = null, placement = null) =>
    set({ picker: { preferredNodeId, placement } }),
  closePicker: () => set({ picker: null }),
  reset: () => set({ picker: null }),
}))
