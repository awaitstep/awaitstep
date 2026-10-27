import { useState } from 'react'
import { format } from 'date-fns'
import { Sparkles } from 'lucide-react'
import { useRecordReleasesVisit, useReleases } from '../../data/dashboard/inbox'
import { plural } from '../../lib/plural'
import type { ReleaseFeed } from '../../types/dashboard/inbox'
import { Button } from '../ui/button'
import { SegmentedFilter, type FilterOption } from '../ui/segmented-filter'
import { SidePanel } from '../ui/side-panel'
import { Tile } from '../ui/tile'
import { DOCS_URL } from '../navigation/nav-model'
import { LoadedQuery } from '../workspaces/loaded-query'
import { filterReleases, type ReleaseShow } from './inbox-filter'
import { ReleaseNote } from './parts/release-note'

const SHOW_OPTIONS: FilterOption<ReleaseShow>[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'improved', label: 'Improved' },
  { id: 'fixed', label: 'Fixed' },
]

/** "2 updates since your last visit on 20 Oct". */
export function sinceLastVisit(feed: ReleaseFeed | undefined): string {
  if (!feed) return 'What we’ve shipped lately'
  if (!feed.lastVisit) return 'What we’ve shipped lately, all new to you'
  const fresh = feed.releases.filter((r) => r.fresh).length
  const day = format(new Date(feed.lastVisit), 'd MMM')
  if (fresh === 0) return `Nothing new since your last visit on ${day}`
  return `${plural(fresh, 'update')} since your last visit on ${day}`
}

interface WhatsNewSheetProps {
  org: string
  onClose: () => void
}

/**
 * `WhatsNew` (`?open=whats-new`). "New to you" stays as it was on opening;
 * closing, however it happens, records the visit and clears the rail's dot (D-P8-6).
 */
export function WhatsNewSheet({ org, onClose }: WhatsNewSheetProps) {
  const releases = useReleases(org)
  const [show, setShow] = useState<ReleaseShow>('all')
  useRecordReleasesVisit(releases.data !== undefined)

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  return (
    <SidePanel
      open
      onOpenChange={handleOpenChange}
      leading={
        <Tile tone="ok" size="lg">
          <Sparkles />
        </Tile>
      }
      title="What’s new"
      description={sinceLastVisit(releases.data)}
      footerStart={
        <a
          href={DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-foreground/80 hover:underline"
        >
          Full changelog
        </a>
      }
      actions={
        <Button type="button" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <SegmentedFilter label="Show" options={SHOW_OPTIONS} value={show} onChange={setShow} />
      <LoadedQuery query={releases} what="what’s new">
        {(feed) => {
          const shown = filterReleases(feed.releases, show)
          if (shown.length === 0) {
            return <p className="py-6 text-sm text-muted-foreground">Nothing here yet.</p>
          }
          return (
            <div className="-mx-6 flex flex-col divide-y divide-border">
              {shown.map((release) => (
                <ReleaseNote key={release.id} release={release} />
              ))}
            </div>
          )
        }}
      </LoadedQuery>
    </SidePanel>
  )
}
