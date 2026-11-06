import { AlertCircle, Check, Circle } from 'lucide-react'
import { Button } from '../ui/button'

interface SaveStatusIndicatorProps {
  isDirty: boolean
  isSaving: boolean
  lastSavedAt: Date | null
  saveError: string | null
  /** Code saved this workflow since the canvas loaded it; nothing here can be saved until Reload. */
  conflict?: boolean
  onReload?: () => void
  reloading?: boolean
}

const CONFLICT_TITLE =
  'This workflow was changed in Code. Your canvas edits can’t be saved over it; reload to continue.'

/**
 * Where the canvas stands with saving: changed in Code (with Reload, the one
 * way on), failed (with the reason on hover), unsaved or saved. Its words
 * show when the bar has room; the icon always does.
 */
export function SaveStatusIndicator({
  isDirty,
  isSaving,
  lastSavedAt,
  saveError,
  conflict = false,
  onReload,
  reloading = false,
}: SaveStatusIndicatorProps) {
  if (conflict) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1.5 text-xs text-destructive"
        title={CONFLICT_TITLE}
      >
        <AlertCircle className="h-3 w-3" />
        <span className="sr-only @[940px]:not-sr-only">Changed in Code</span>
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onReload}
          disabled={reloading}
          aria-busy={reloading || undefined}
          title="Open the workflow as it is saved now"
        >
          {reloading ? 'Reloading…' : 'Reload'}
        </Button>
      </span>
    )
  }
  // The Save button says "Saving…" itself; saying it twice is noise.
  if (isSaving) return null
  if (saveError && isDirty) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-xs text-destructive"
        title={saveError}
      >
        <AlertCircle className="h-3 w-3" />
        <span className="sr-only @[940px]:not-sr-only">Couldn&apos;t save</span>
      </span>
    )
  }
  if (isDirty) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-xs text-status-warning"
        title="Unsaved changes"
      >
        <Circle className="h-2 w-2 fill-status-warning text-status-warning" />
        <span className="sr-only @[940px]:not-sr-only">Unsaved</span>
      </span>
    )
  }
  if (lastSavedAt) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
        title={`Saved at ${lastSavedAt.toLocaleTimeString()}`}
      >
        <Check className="h-3 w-3 text-status-success" />
        <span className="sr-only @[940px]:not-sr-only">Saved</span>
      </span>
    )
  }
  return null
}
