import type { RunHour } from '../../../types/dashboard/workspaces'
import { ShellLink } from '../../ui/shell-link'
import { passedLabel } from '../runs-by-hour'
import { HourBars } from './hour-bars'

interface RunsTileProps {
  runs: number
  /** The last 24 hours, oldest first; without them the tile is the count alone. */
  hours: RunHour[] | undefined
  href: string
}

/** `WsOverview`'s Runs tile: the day's count, "% passed", and a bar per hour with failures on top. */
export function RunsTile({ runs, hours, href }: RunsTileProps) {
  const passed = hours ? passedLabel(hours) : null

  return (
    <ShellLink
      href={href}
      className="col-span-2 flex min-w-0 flex-col rounded-xl border border-border bg-card px-4 py-2.5 transition-colors hover:border-foreground/20 md:col-span-1"
    >
      <span className="flex flex-wrap items-baseline gap-x-2.5">
        <span className="text-lg font-semibold">{runs}</span>{' '}
        {passed && <span className="text-2xs text-status-success">{passed}</span>}
      </span>{' '}
      <span className="text-2xs text-muted-foreground">Runs in the last 24 hours</span>
      {hours && hours.length > 0 && (
        <HourBars
          hours={hours}
          label="Runs per hour over the last 24 hours, with failures marked"
          className="mt-3 h-[42px]"
        />
      )}
    </ShellLink>
  )
}
