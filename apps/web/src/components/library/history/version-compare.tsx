import { useLibraryVersion } from '../../../data/dashboard/library'
import type { ApiLibraryUsages, ApiLibraryVersion } from '../../../lib/library-api'
import { diffTotals, diffVersions } from '../../../lib/library/version-diff'
import { VersionDiffList } from '../parts/version-diff-list'
import { VersionList } from '../parts/version-list'

/** How many workflows' live deployments still run `version`. */
export function stillRunning(usages: ApiLibraryUsages | undefined, version: string): number {
  if (!usages) return 0
  return usages.usedBy.visible.filter((c) => c.kind === 'workflow' && c.runs === version).length
}

function stillRunningLine(count: number, version: string): string | null {
  if (count === 0) return null
  return count === 1
    ? `1 workflow still runs v${version}`
    : `${count} workflows still run v${version}`
}

interface VersionCompareProps {
  itemId: string
  versions: ApiLibraryVersion[]
  selected: ApiLibraryVersion
  usages: ApiLibraryUsages | undefined
  onSelect: (version: string) => void
}

/** The kept versions beside what changed from the selected one to the current (28i). */
export function VersionCompare({
  itemId,
  versions,
  selected,
  usages,
  onSelect,
}: VersionCompareProps) {
  const current = versions[0]!
  const currentDetail = useLibraryVersion(itemId, current.version)
  const selectedDetail = useLibraryVersion(itemId, selected.version)
  const comparing = selected.version !== current.version
  const diffs =
    comparing && currentDetail.data && selectedDetail.data
      ? diffVersions(selectedDetail.data.files, currentDetail.data.files)
      : []
  const totals = diffTotals(diffs)
  const running = stillRunningLine(stillRunning(usages, selected.version), selected.version)

  return (
    <div className="grid min-h-0 gap-4 md:grid-cols-[200px_1fr]">
      <VersionList
        versions={versions}
        selected={selected.version}
        inUse={(v) => stillRunning(usages, v) > 0}
        onSelect={onSelect}
      />
      <div className="flex min-w-0 flex-col gap-3">
        {comparing ? (
          <>
            <p className="text-xs text-muted-foreground">
              v{selected.version} → v{current.version} (current){' '}
              <span className="text-status-success">+{totals.added}</span>{' '}
              <span className="text-status-error">−{totals.removed}</span>
            </p>
            <VersionDiffList diffs={diffs} loading={!currentDetail.data || !selectedDetail.data} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            This is the current version. Pick an older one to see what changed since.
          </p>
        )}
        {running && <p className="text-xs text-muted-foreground">{running}</p>}
      </div>
    </div>
  )
}
