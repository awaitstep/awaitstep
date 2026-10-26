import { Switch } from './switch'

interface ShareToggleProps {
  shared: boolean
  onChange: (shared: boolean) => void
  /** Names the switch, e.g. "Share Lead enrichment with Project 101". */
  label: string
  /**
   * Why the viewer can't change it, e.g. "Viewers can't change sharing".
   * The switch stays focusable so the reason can be read, but ignores input.
   */
  disabledReason?: string
}

/** The Shared / Private switch on a workflow, function or library row. */
export function ShareToggle({ shared, onChange, label, disabledReason }: ShareToggleProps) {
  return (
    <span className="flex items-center justify-end gap-2 text-2xs text-muted-foreground">
      {/* The switch's checked state already says this to screen readers. */}
      <span aria-hidden="true">{shared ? 'Shared' : 'Private'}</span>
      <Switch
        checked={shared}
        onCheckedChange={onChange}
        label={label}
        disabledReason={disabledReason}
      />
    </span>
  )
}
