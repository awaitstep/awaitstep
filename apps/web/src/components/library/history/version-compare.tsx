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

/**
 * 28i's two panes: the kept versions on the left, and on the right what
 * changed from the selected one to the current, under a compare bar.
 */
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
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="max-h-48 shrink-0 overflow-y-auto border-b border-border p-2 md:max-h-none md:w-[276px] md:border-b-0 md:border-r">
        <VersionList
          versions={versions}
          selected={selected.version}
          inUse={(v) => stillRunning(usages, v) > 0}
          onSelect={onSelect}
        />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border px-4 font-mono text-xs">
          {comparing ? (
            <>
              <span className="text-foreground/80">
                v{selected.version} → v{current.version} (current)
              </span>
              <span className="ml-auto text-status-success">+{totals.added}</span>
              <span className="text-status-error">−{totals.removed}</span>
            </>
          ) : (
            <span className="text-foreground/80">v{current.version} (current)</span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {comparing ? (
            <VersionDiffList
              diffs={diffs}
              loading={!currentDetail.data || !selectedDetail.data}
              fill
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              This is the current version. Pick an older one to see what changed since.
            </p>
          )}
          {running && <p className="text-xs text-status-warning">{running}</p>}
        </div>
      </div>
    </div>
  )
}
