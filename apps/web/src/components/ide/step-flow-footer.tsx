import { Button } from '../ui/button'

interface StepFlowFooterProps {
  mode: 'fast' | 'map'
  name: string
  side: 'after' | 'before'
  fastChoiceName: string | null
  mapSummary: string
  canInsert: boolean
  onCancel: () => void
  /** Custom node chosen, none picked yet. */
  picking?: boolean
  /** What still stops Insert ("Fill in Action and User Message"), in place of the summary. */
  notice?: string | null
}

export function StepFlowFooter({
  mode,
  name,
  side,
  fastChoiceName,
  mapSummary,
  canInsert,
  onCancel,
  picking = false,
  notice = null,
}: StepFlowFooterProps) {
  return (
    <div className="mt-auto flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
      {notice ? (
        <p className="min-w-0 truncate text-xs text-muted-foreground">{notice}</p>
      ) : picking ? (
        <p className="min-w-0 truncate text-xs text-muted-foreground">Choose a node to add</p>
      ) : mode === 'fast' ? (
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{name.trim() || 'new_step'}</span>
          {' → '}
          <span className="text-primary-ink">
            {fastChoiceName !== null ? `${side} ${fastChoiceName}` : 'choose a step'}
          </span>
        </p>
      ) : (
        <p className="min-w-0 truncate text-xs text-primary-ink">{mapSummary}</p>
      )}
      <div className="flex shrink-0 items-center gap-2">
        {mode === 'fast' && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!canInsert}>
          Insert
        </Button>
      </div>
    </div>
  )
}
