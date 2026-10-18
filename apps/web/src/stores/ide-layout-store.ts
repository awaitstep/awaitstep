import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Layout } from 'react-resizable-panels'
import { browserStorage } from './ssr-safe-storage'

export type DockTab = 'problems' | 'output' | 'run'

/** The two resizable groups: explorer | main, and editor / dock inside main. */
export type IdeLayoutKey = 'workspace' | 'editor'

interface IdeLayoutState {
  explorerOpen: boolean
  dockOpen: boolean
  dockTab: DockTab
  layouts: Partial<Record<IdeLayoutKey, Layout>>
  toggleExplorer: () => void
  toggleDock: () => void
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
      dockTab: 'problems',
      layouts: {},
      toggleExplorer: () => set({ explorerOpen: !get().explorerOpen }),
      toggleDock: () => set({ dockOpen: !get().dockOpen }),
      showDock: (dockTab) => set({ dockOpen: true, dockTab }),
      setLayout: (key, layout) => set({ layouts: { ...get().layouts, [key]: layout } }),
    }),
    {
      name: 'awaitstep-ide',
      storage: createJSONStorage(() => browserStorage()),
    },
  ),
)
