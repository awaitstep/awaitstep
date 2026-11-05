import { cn } from '../../lib/utils'
import { ABOVE_LINK } from './linked-row'
import { Switch } from './switch'

interface ShareToggleProps {
  shared: boolean
  onChange: (shared: boolean) => void
  /**
   * Names the switch, starting with its visible word so speech control finds it,
   * e.g. "Shared with Project 101: Lead enrichment".
   */
  label: string
  /**
   * Why the viewer can't change it, e.g. "Viewers can't change sharing".
   * The switch stays focusable so the reason can be read, but ignores input.
   */
  disabledReason?: string
}

/**
 * The Shared switch on a workflow, function or library row. Its label stays
 * "Shared" and the switch says whether it is: a label that flipped to
 * "Private" read as the thing to switch to.
 */
export function ShareToggle({ shared, onChange, label, disabledReason }: ShareToggleProps) {
  return (
    <span className="flex items-center justify-end gap-2 text-2xs text-muted-foreground">
      {/* Only the visible caption: the switch is named by `label`, which starts with it. */}
      <span aria-hidden="true">Shared</span>
      {/* Above a row's link, when the row is one: a click on the switch stays the switch's. */}
      <span className={cn('inline-flex', ABOVE_LINK)}>
        <Switch
          checked={shared}
          onCheckedChange={onChange}
          label={label}
          disabledReason={disabledReason}
        />
      </span>
    </span>
  )
}
