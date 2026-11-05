import { Button } from '../ui/button'

interface NarrowWindowNoticeProps {
  onOpenCanvas: () => void
  onBack: () => void
}

/** The code workspace needs room; below this width it steps aside instead of squeezing. */
export function NarrowWindowNotice({ onOpenCanvas, onBack }: NarrowWindowNoticeProps) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-foreground">
          The code workspace needs a wider window
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Make this window wider, or open the canvas, which works at any width. Your edits are kept.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button size="sm" onClick={onOpenCanvas}>
            Open canvas
          </Button>
          <Button size="sm" variant="outline" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    </div>
  )
}
