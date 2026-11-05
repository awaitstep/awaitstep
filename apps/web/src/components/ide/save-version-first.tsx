import { useSwitchView } from '../../hooks/use-switch-view'
import { SAVE_VERSION_FIRST } from '../../lib/ide/run-intent'
import { Button } from '../ui/button'

interface SaveVersionFirstProps {
  workflowId: string
  /** One short sentence on why this part needs a saved version. */
  reason: string
}

/**
 * What a part of the workspace shows when the workflow has never been saved
 * on the canvas: a test session, a quick test, the steps and the preview all
 * read a saved version, and there is none to read. Said once, with the way to
 * make one, instead of a request that can only fail.
 */
export function SaveVersionFirst({ workflowId, reason }: SaveVersionFirstProps) {
  const switchView = useSwitchView(workflowId)

  function handleOpenCanvas() {
    void switchView('canvas')
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 py-6 text-center">
      <p className="text-xs font-medium text-muted-foreground">{SAVE_VERSION_FIRST}</p>
      <p className="max-w-md text-[11px] text-muted-foreground">{reason}</p>
      <Button size="sm" variant="outline" className="mt-1.5" onClick={handleOpenCanvas}>
        Open canvas
      </Button>
    </div>
  )
}
