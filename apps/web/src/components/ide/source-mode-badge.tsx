import type { SourceMode } from '@awaitstep/codegen'
import { cn } from '../../lib/utils'

interface ModeStyle {
  label: string
  title: string
  className: string
}

const MODES: Record<SourceMode, ModeStyle> = {
  generated: {
    label: 'Generated',
    title: 'Source is generated from the canvas and read-only here — eject to edit it',
    className: 'bg-muted/60 text-muted-foreground',
  },
  ejected: {
    label: 'Ejected',
    title: 'Source is the truth for this version; canvas saves start a new generated version',
    className: 'bg-primary/10 text-primary',
  },
  sdk: {
    label: 'SDK',
    title: 'Pushed from the SDK; the canvas can only edit config literals and layout',
    className: 'bg-status-warning/10 text-status-warning',
  },
}

// The API may be newer than this bundle; an unknown mode renders as-is
// instead of crashing the workspace.
function styleFor(mode: string): ModeStyle {
  return (
    (MODES as Record<string, ModeStyle | undefined>)[mode] ?? {
      label: mode,
      title: 'Source mode not recognised by this version of the app',
      className: 'bg-muted/60 text-muted-foreground',
    }
  )
}

export function SourceModeBadge({ mode, className }: { mode: SourceMode; className?: string }) {
  const style = styleFor(mode)
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1.5 py-0.5 text-xs font-medium',
        style.className,
        className,
      )}
      title={style.title}
    >
      {style.label}
    </span>
  )
}
