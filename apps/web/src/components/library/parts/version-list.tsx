import type { ApiLibraryVersion } from '../../../lib/library-api'
import { timeAgoOrDay } from '../../../lib/time'
import { cn } from '../../../lib/utils'

interface VersionListProps {
  /** Newest first. */
  versions: ApiLibraryVersion[]
  selected: string | null
  /** Some workflow's live deployment runs it. */
  inUse: (version: string) => boolean
  onSelect: (version: string) => void
}

/** The kept versions, newest first, the current one marked (28i's left list). */
export function VersionList({ versions, selected, inUse, onSelect }: VersionListProps) {
  return (
    <ul aria-label="Versions" className="flex flex-col gap-px">
      {versions.map((version, index) => {
        const active = version.version === selected
        const current = index === 0
        const tag = current ? 'current' : inUse(version.version) ? 'in use' : null
        return (
          <li key={version.version}>
            <button
              type="button"
              aria-pressed={active}
              data-version={version.version}
              onClick={() => onSelect(version.version)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
                active ? 'bg-muted' : 'hover:bg-muted/50',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  current ? 'bg-status-success' : 'bg-muted-foreground/40',
                )}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'font-mono text-xs',
                      active || current ? 'text-foreground' : 'text-foreground/80',
                    )}
                  >
                    v{version.version}
                  </span>
                  {tag && (
                    <span className="rounded-full bg-muted px-1.5 py-px text-2xs text-muted-foreground">
                      {tag}
                    </span>
                  )}
                </span>
                <span className="truncate text-2xs text-muted-foreground">
                  {version.publishedBy?.name ?? 'Someone who left'} ·{' '}
                  {timeAgoOrDay(version.publishedAt)}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
