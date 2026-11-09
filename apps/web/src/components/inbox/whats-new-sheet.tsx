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
import { RELEASES_URL } from '../navigation/nav-model'
import { LoadedQuery } from '../workspaces/loaded-query'
import { filterReleases, isUpToDate, releasesView, type ReleaseShow } from './inbox-filter'
import { ReleaseNote } from './parts/release-note'
import { NoMatchingNotes, NoReleaseNotes, UpToDateNote } from './parts/whats-new-states'

const SHOW_OPTIONS: FilterOption<ReleaseShow>[] = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'improved', label: 'Improved' },
  { id: 'fixed', label: 'Fixed' },
]

/** "2 updates since your last visit on 20 Oct". */
export function sinceLastVisit(feed: ReleaseFeed | undefined): string {
  if (!feed) return 'What we’ve shipped lately'
  if (feed.releases.length === 0) return 'Release notes show up here'
  if (!feed.lastVisit) return 'What we’ve shipped lately, all new to you'
  const fresh = feed.releases.filter((r) => r.fresh).length
  const day = format(new Date(feed.lastVisit), 'd MMM')
  if (fresh === 0) return 'Up to date'
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
  useRecordReleasesVisit(
    org,
    releases.data?.releases.map((release) => release.id),
  )

  function handleOpenChange(open: boolean) {
    if (!open) onClose()
  }

  function handleShowAll() {
    setShow('all')
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
      size="md"
      description={sinceLastVisit(releases.data)}
      footerStart={
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-foreground/80 hover:underline"
        >
          Full changelog
        </a>
      }
      actions={
        <Button type="button" onClick={onClose}>
          {releases.data?.releases.length === 0 ? 'Close' : 'Got it'}
        </Button>
      }
    >
      <LoadedQuery query={releases} what="what’s new">
        {(feed) => {
          const view = releasesView(feed.releases, show)
          if (view === 'none') return <NoReleaseNotes />
          return (
            <>
              <SegmentedFilter
                label="Show"
                options={SHOW_OPTIONS}
                value={show}
                onChange={setShow}
              />
              {show === 'all' && isUpToDate(feed.releases) && <UpToDateNote />}
              {view === 'nomatch' && show !== 'all' ? (
                <NoMatchingNotes tag={show} onShowAll={handleShowAll} />
              ) : (
                <div className="-mx-6 flex flex-col divide-y divide-border">
                  {filterReleases(feed.releases, show).map((release) => (
                    <ReleaseNote key={release.id} release={release} />
                  ))}
                </div>
              )}
            </>
          )
        }}
      </LoadedQuery>
    </SidePanel>
  )
}
