import { useEffect } from 'react'
import { useSidebarStore } from '../../stores/sidebar-store'
import { SidebarContent } from './sidebar-content'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

/**
 * Desktop navigation rail. Width is CSS-driven off html[data-sidebar] (set
 * pre-paint), so the persisted collapse state never flashes on load.
 *
 * z-index ladder: sidebar z-30 < mobile top bar z-40 < sheets/dialogs/onboarding z-50.
 */
export function AppSidebar() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'b') return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      useSidebarStore.getState().toggleCollapsed()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <aside className="sticky top-0 z-30 hidden h-svh w-60 shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 sidebar-collapsed:w-14 md:block">
      <SidebarContent />
    </aside>
  )
}
