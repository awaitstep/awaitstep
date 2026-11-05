import { create } from 'zustand'

interface CanvasLayoutState {
  /** The node palette ("Steps") is open. */
  paletteOpen: boolean
  /**
   * The step inspector may show when a step is selected. A session choice, not
   * a stored one: a hidden inspector that outlived a reload left people
   * clicking steps and seeing nothing, with no hint why.
   */
  inspectorOpen: boolean
  togglePalette: () => void
  setPaletteOpen: (open: boolean) => void
  closePalette: () => void
  setInspectorOpen: (open: boolean) => void
}

/**
 * Canvas panel visibility, the counterpart of the IDE layout store for the
 * two toggles the unified top bar shows on the canvas (⌘B, ⌘J).
 */
export const useCanvasLayoutStore = create<CanvasLayoutState>()((set, get) => ({
  paletteOpen: false,
  inspectorOpen: true,
  togglePalette: () => set({ paletteOpen: !get().paletteOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  closePalette: () => set({ paletteOpen: false }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
}))
