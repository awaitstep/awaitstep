import type { RunHour } from '../../types/dashboard/workspaces'

// The Overview's Runs tile: the 24-bar strip and its "% passed", from the
// hourly counts the scope answer carries (`runsByHour`).

/** "96.9% passed": runs that finished well among those that finished; null while none has. */
export function passedLabel(hours: RunHour[]): string | null {
  let complete = 0
  let failed = 0
  for (const hour of hours) {
    complete += hour.complete
    failed += hour.failed
  }
  const finished = complete + failed
  if (finished === 0) return null
  return `${Number(((complete / finished) * 100).toFixed(1))}% passed`
}

export interface RunBar {
  /** The whole bar as a share of the busiest hour, 0–1. */
  height: number
  /** The failed part, on top, as a share of the busiest hour. */
  failedHeight: number
}

/** Each hour's bar, scaled to the busiest hour: an hour without runs is 0. */
export function runBars(hours: RunHour[]): RunBar[] {
  const busiest = Math.max(0, ...hours.map((hour) => hour.runs))
  return hours.map((hour) =>
    busiest === 0
      ? { height: 0, failedHeight: 0 }
      : { height: hour.runs / busiest, failedHeight: hour.failed / busiest },
  )
}
