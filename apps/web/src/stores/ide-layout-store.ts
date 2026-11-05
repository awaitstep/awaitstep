import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Layout } from 'react-resizable-panels'
import { browserStorage } from './ssr-safe-storage'

export type SideBarTab = 'explorer' | 'search' | 'steps'

export const SIDE_BAR_TABS: readonly SideBarTab[] = ['explorer', 'search', 'steps']

export type DockTab = 'problems' | 'session' | 'quickTest'

const DOCK_TABS: readonly DockTab[] = ['problems', 'session', 'quickTest']

/**
 * A stored dock tab as a tab that exists. Run and Output became one Test
 * session tab, so those two open it; anything else unknown opens Problems.
 */
export function normalizeDockTab(stored: unknown): DockTab {
  if (stored === 'run' || stored === 'output') return 'session'
  return DOCK_TABS.find((tab) => tab === stored) ?? 'problems'
}

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
  /** Which view the side bar shows; remembered across reloads. */
  sideBarTab: SideBarTab
  layouts: Partial<Record<string, Layout>>
  toggleExplorer: () => void
  toggleDock: () => void
  togglePreview: () => void
  showDock: (tab: DockTab) => void
  /** Opens the side bar on a view, showing it first if it was hidden. */
  showSideBar: (tab: SideBarTab) => void
  setSideBarTab: (tab: SideBarTab) => void
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
      sideBarTab: 'explorer',
      layouts: {},
      toggleExplorer: () => set({ explorerOpen: !get().explorerOpen }),
      toggleDock: () => set({ dockOpen: !get().dockOpen }),
      togglePreview: () => set({ previewOpen: !get().previewOpen }),
      showDock: (dockTab) => set({ dockOpen: true, dockTab }),
      showSideBar: (sideBarTab) => set({ explorerOpen: true, sideBarTab }),
      setSideBarTab: (sideBarTab) => set({ sideBarTab }),
      setLayout: (key, layout) => set({ layouts: { ...get().layouts, [key]: layout } }),
    }),
    {
      name: 'awaitstep-ide',
      storage: createJSONStorage(() => browserStorage()),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<IdeLayoutState>
        return {
          ...current,
          ...stored,
          dockTab: normalizeDockTab(stored.dockTab),
          sideBarTab: SIDE_BAR_TABS.find((tab) => tab === stored.sideBarTab) ?? 'explorer',
        }
      },
    },
  ),
)
