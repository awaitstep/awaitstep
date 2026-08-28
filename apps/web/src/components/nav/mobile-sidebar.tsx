import { Menu } from 'lucide-react'
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useSidebarStore } from '../../stores/sidebar-store'
import { Sheet, SheetContent, SheetTitle } from '../ui/sheet'
import { SidebarContent } from './sidebar-content'

/** Slim top bar with a drawer, shown below the md breakpoint. */
export function MobileSidebar() {
  const mobileOpen = useSidebarStore((s) => s.mobileOpen)
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen)

  function handleOpen() {
    setMobileOpen(true)
  }

  function handleOpenChange(open: boolean) {
    setMobileOpen(open)
  }

  function handleNavigate() {
    setMobileOpen(false)
  }

  return (
    <div className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3 md:hidden">
      <button
        onClick={handleOpen}
        aria-label="Open navigation"
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <Menu size={18} />
      </button>
      <span className="text-sm font-semibold tracking-tight">AwaitStep</span>
      <Sheet open={mobileOpen} onOpenChange={handleOpenChange}>
        <SheetContent side="left" className="w-72 max-w-[85vw] bg-sidebar p-0">
          <VisuallyHidden>
            <SheetTitle>Navigation</SheetTitle>
          </VisuallyHidden>
          <SidebarContent inDrawer onNavigate={handleNavigate} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
