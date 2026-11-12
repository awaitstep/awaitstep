import { useLibraryVersions } from '../../../data/dashboard/library'
import type { ApiLibraryTreeItem } from '../../../lib/library-api'
import { timeAgoOrDay } from '../../../lib/time'
import { Button } from '../../ui/button'
import { DetailsEmpty, DetailsSection, DotRow } from './details-section'

interface VersionsSectionProps {
  item: ApiLibraryTreeItem
  canEdit: boolean
  onRestore: (version: string) => void
  onHistory: () => void
}

/** The kept versions (at most three), the newest current, Restore on the older ones (28d). */
export function VersionsSection({ item, canEdit, onRestore, onHistory }: VersionsSectionProps) {
  const versions = useLibraryVersions(item.id)
  const list = versions.data ?? []
  return (
    <DetailsSection
      title="Versions"
      action={
        list.length > 0 ? (
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onHistory}>
            All {list.length}
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
        <DetailsEmpty>Loading…</DetailsEmpty>
      ) : list.length === 0 ? (
        <DetailsEmpty>
          Nothing published yet. Publishing records a version you can go back to.
        </DetailsEmpty>
      ) : (
        <ul className="flex flex-col">
          {list.map((version, index) => (
            <DotRow key={version.version} on={index === 0}>
              <span className="font-mono text-foreground">v{version.version}</span>
              <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
                {version.publishedBy ? `${version.publishedBy.name} · ` : ''}
                {timeAgoOrDay(version.publishedAt)}
              </span>
              {index === 0 ? (
                <span className="text-2xs text-muted-foreground">current</span>
              ) : (
                canEdit && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => onRestore(version.version)}
                  >
                    Restore
                  </Button>
                )
              )}
            </DotRow>
          ))}
        </ul>
      )}
    </DetailsSection>
  )
}
