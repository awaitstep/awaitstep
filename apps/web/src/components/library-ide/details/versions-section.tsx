import { useLibraryVersions } from '../../../data/dashboard/library'
import type { ApiLibraryTreeItem } from '../../../lib/library-api'
import { timeAgoOrDay } from '../../../lib/time'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { DetailsSection } from './details-section'

interface VersionsSectionProps {
  item: ApiLibraryTreeItem
  canEdit: boolean
  onRestore: (version: string) => void
  onHistory: () => void
}

/** The kept versions (at most three) with Restore on the older ones. */
export function VersionsSection({ item, canEdit, onRestore, onHistory }: VersionsSectionProps) {
  const versions = useLibraryVersions(item.id)
  const list = versions.data ?? []
  return (
    <DetailsSection
      title="Versions"
      action={
        list.length > 0 ? (
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onHistory}>
            History
          </Button>
        ) : undefined
      }
      note={
        list.length > 1 && canEdit
          ? 'Restore copies that code into your working copy as the next version.'
          : undefined
      }
    >
      {versions.isPending ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground">Not published yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((version, index) => (
            <li key={version.version} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-foreground">v{version.version}</span>
              {index === 0 && <Badge variant="success">current</Badge>}
              <span className="flex-1 truncate text-muted-foreground">
                {timeAgoOrDay(version.publishedAt)}
              </span>
              {index > 0 && canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2"
                  onClick={() => onRestore(version.version)}
                >
                  Restore
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </DetailsSection>
  )
}
