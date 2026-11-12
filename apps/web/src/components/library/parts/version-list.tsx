import type { ApiLibraryVersion } from '../../../lib/library-api'
import { timeAgoOrDay } from '../../../lib/time'
import { cn } from '../../../lib/utils'
import { Badge } from '../../ui/badge'

interface VersionListProps {
  /** Newest first. */
  versions: ApiLibraryVersion[]
  selected: string | null
  /** Some workflow's live deployment runs it. */
  inUse: (version: string) => boolean
  onSelect: (version: string) => void
}

/** The kept versions, newest first, the current one tagged (28i's left list). */
export function VersionList({ versions, selected, inUse, onSelect }: VersionListProps) {
  return (
    <ul aria-label="Versions" className="flex flex-col gap-1">
      {versions.map((version, index) => {
        const active = version.version === selected
        return (
          <li key={version.version}>
            <button
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(version.version)}
              className={cn(
                'flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left text-xs',
                active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                v{version.version}
                {index === 0 && <Badge variant="success">current</Badge>}
                {index > 0 && inUse(version.version) && <Badge variant="info">in use</Badge>}
              </span>
              <span className="truncate">
                {version.publishedBy?.name ?? 'Someone who left'} ·{' '}
                {timeAgoOrDay(version.publishedAt)}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
