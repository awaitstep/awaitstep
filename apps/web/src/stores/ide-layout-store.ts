import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Layout } from 'react-resizable-panels'
import { browserStorage } from './ssr-safe-storage'

export type DockTab = 'problems' | 'output' | 'run' | 'quickTest'

/** The two resizable groups: explorer | main, and editor / dock inside main. */
/**
 * Layouts are remembered per set of panels showing: the library only applies a
 * saved layout when it names exactly the panels mounted, so the workspace
 * group is keyed by which of explorer / preview are open.
 */
export type IdeLayoutKey = string

interface IdeLayoutState {
  explorerOpen: boolean
  dockOpen: boolean
  /** The read-only graph floating over the editor. */
  previewOpen: boolean
  dockTab: DockTab
  layouts: Partial<Record<string, Layout>>
  toggleExplorer: () => void
  toggleDock: () => void
  togglePreview: () => void
  showDock: (tab: DockTab) => void
  setLayout: (key: IdeLayoutKey, layout: Layout) => void
}

/**
 * Workspace preferences that outlive a session and apply to every workflow:
 * pane sizes and which panels are showing. Kept apart from the per-workflow
 * session store so tab switches never touch localStorage.
 */
export const useIdeLayoutStore = create<IdeLayoutState>()(
  persist(
    (set, get) => ({
      explorerOpen: true,
      dockOpen: true,
      // Open by default: the graph is what the code workspace was missing,
      // and a panel nobody knows to open is a panel nobody uses.
      previewOpen: true,
      dockTab: 'problems',
      layouts: {},
      toggleExplorer: () => set({ explorerOpen: !get().explorerOpen }),
      toggleDock: () => set({ dockOpen: !get().dockOpen }),
      togglePreview: () => set({ previewOpen: !get().previewOpen }),
      showDock: (dockTab) => set({ dockOpen: true, dockTab }),
      setLayout: (key, layout) => set({ layouts: { ...get().layouts, [key]: layout } }),
    }),
    {
      name: 'awaitstep-ide',
      storage: createJSONStorage(() => browserStorage()),
    },
  ),
)
