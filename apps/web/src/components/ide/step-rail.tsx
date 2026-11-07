import { cn } from '../../lib/utils'
import type { RailRow } from '../../lib/ide/step-rail-layout'

/** Left edge of the gutter: the depth-0 dot must not touch the panel's edge. */
const BASE = 16
const INDENT = 14
/** Center of the name line: the row pads 4px, then the 16px name. */
const DOT_TOP = 12
/** The rail is structural, not a divider: `border` (8% white) disappears on the card. */
const LINE = 'bg-muted-foreground/35'
const DOT = 'border-muted-foreground/50'

/** The center of the rail line at a depth, inside the row's left gutter. */
function railX(depth: number): number {
  return BASE + depth * INDENT - 7
}

interface StepRailProps {
  layout: RailRow
  /** The graph's entry: its dot is filled. */
  entry: boolean
  /** A container's dot is a diamond; the arms hang from its rail. */
  container: boolean
  /** The new step's row: a dashed dot, no solid lane. */
  ghost?: boolean
}

/**
 * The list's left rail: one vertical line per active level, a dot on the row's
 * own line, and a tick where an arm leaves its container. It is CSS, not a
 * canvas — the side bar stays narrow and every row keeps its row height.
 */
export function StepRail({ layout, entry, container, ghost = false }: StepRailProps) {
  const { depth, lanes, below, connector } = layout
  const width = BASE + depth * INDENT
  return (
    <span className="relative shrink-0 self-stretch" style={{ width }} aria-hidden>
      {lanes.map((lane) => (
        <span
          key={`${lane.level}:${lane.to}`}
          className={cn('absolute w-px', LINE)}
          style={{
            left: railX(lane.level),
            top: 0,
            ...(lane.to === 'dot' ? { height: DOT_TOP } : { bottom: 0 }),
          }}
        />
      ))}
      {below && (
        <span
          className={cn('absolute w-px', LINE)}
          style={{ left: railX(depth), top: DOT_TOP, bottom: 0 }}
        />
      )}
      {connector && (
        <span
          className={cn('absolute h-px', LINE)}
          style={{ left: railX(depth - 1), top: DOT_TOP, width: INDENT }}
        />
      )}
      <span
        className={cn(
          'absolute size-2 -translate-x-1/2 -translate-y-1/2 border bg-card',
          container ? 'rotate-45 rounded-[1px]' : 'rounded-full',
          ghost
            ? 'border-dashed border-primary/70 bg-primary/10'
            : entry
              ? 'border-primary bg-primary'
              : container
                ? 'border-primary/60'
                : DOT,
        )}
        style={{ left: railX(depth), top: DOT_TOP }}
      />
    </span>
  )
}
