import type { ReactNode } from 'react'
import { useRouter } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../ui/button'

interface WorkspaceChromeProps {
  /** The workflow title and whatever badges this surface shows. */
  title: ReactNode
  /** This surface's own actions, right-aligned. */
  actions?: ReactNode
}

/**
 * The bar both editing surfaces share: back, the title, and a slot for
 * whatever that surface does.
 *
 * Both routes remount when you move between them, so the bar's height, the
 * back button and the title landing on identical pixels is what makes the
 * move read as changing surface rather than loading a page. That only holds
 * while one component owns them.
 *
 * Actions stay with each surface deliberately, and the way across is one of
 * them. Canvas offers a Code button because leaving the canvas is the whole
 * move; Code offers a canvas preview it can keep open beside the editor,
 * because a dev wants to see the graph without giving up the files. Those
 * are different needs, and a single shared switch served neither well.
 */
export function WorkspaceChrome({ title, actions }: WorkspaceChromeProps) {
  const router = useRouter()

  function handleBack() {
    router.history.back()
  }

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground/80"
          onClick={handleBack}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="hidden h-5 w-px shrink-0 bg-muted/70 sm:block" />
        {title}
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">{actions}</div>
    </header>
  )
}
