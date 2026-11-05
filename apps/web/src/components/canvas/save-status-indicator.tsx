import { AlertCircle, Check, Circle } from 'lucide-react'

interface SaveStatusIndicatorProps {
  isDirty: boolean
  isSaving: boolean
  lastSavedAt: Date | null
  saveError: string | null
}

/**
 * Where the canvas stands with saving: failed (with the reason on hover),
 * unsaved or saved. Its words show when the bar has room; the icon always does.
 */
export function SaveStatusIndicator({
  isDirty,
  isSaving,
  lastSavedAt,
  saveError,
}: SaveStatusIndicatorProps) {
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
