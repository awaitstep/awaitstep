import { Button } from '../ui/button'

interface StepFlowFooterProps {
  mode: 'fast' | 'map'
  name: string
  side: 'after' | 'before'
  fastChoiceName: string | null
  mapSummary: string
  busy: boolean
  canInsert: boolean
  onCancel: () => void
}

export function StepFlowFooter({
  mode,
  name,
  side,
  fastChoiceName,
  mapSummary,
  busy,
  canInsert,
  onCancel,
}: StepFlowFooterProps) {
  return (
    <div className="mt-auto flex shrink-0 items-center justify-between gap-3 border-t border-border px-5 py-3">
      {mode === 'fast' ? (
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{name.trim() || 'new_step'}</span>
          {' → '}
          <span className="text-primary">
            {fastChoiceName !== null ? `${side} ${fastChoiceName}` : 'choose a step'}
          </span>
        </p>
      ) : (
        <p className="min-w-0 truncate text-xs text-primary">{mapSummary}</p>
      )}
      <div className="flex shrink-0 items-center gap-2">
        {mode === 'fast' && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" loading={busy} disabled={!canInsert}>
          {busy ? 'Inserting…' : 'Insert'}
        </Button>
      </div>
    </div>
  )
}
