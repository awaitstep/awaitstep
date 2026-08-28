import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { browserStorage } from './ssr-safe-storage'

interface SidebarState {
  collapsed: boolean
  mobileOpen: boolean
  toggleCollapsed: () => void
  setMobileOpen: (open: boolean) => void
}

// The sidebar width is driven purely by CSS via html[data-sidebar] (see the
// sidebar-collapsed custom variant in styles.css), so server and client render
// identical markup and the persisted state never causes a hydration flash. The
// attribute is set pre-paint by the init script in theme-script.tsx; this store
// only mirrors it for client-side behavior (tooltips, toggling).
function syncHtmlAttribute(collapsed: boolean) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded'
  }
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      collapsed: false,
      mobileOpen: false,
      toggleCollapsed: () => {
        const collapsed = !get().collapsed
        syncHtmlAttribute(collapsed)
        set({ collapsed })
      },
      setMobileOpen: (mobileOpen) => set({ mobileOpen }),
    }),
    {
      name: 'awaitstep-sidebar',
      storage: createJSONStorage(() => browserStorage()),
      partialize: (state) => ({ collapsed: state.collapsed }),
    },
  ),
)
