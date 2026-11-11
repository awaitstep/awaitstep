import { useState } from 'react'
import { failedOnly, flatSteps, type StepListEntry, type StepItem } from '../../lib/run-step-list'
import { RunCard } from './parts/run-card'
import { GroupRow, StepRow, stepRowDomId } from './parts/step-rows'
import { SegmentedFilter } from '../ui/segmented-filter'

/** Past this many rows the list gets its filter, jump and scroll (26c). */
const LONG_LIST = 10

type Filter = 'all' | 'failed'

interface RunStepsCardProps {
  entries: StepListEntry[]
  spanMs: number
  loaded: boolean
  runStatus: string
  selectedId: string | undefined
  onSelect: (id: string) => void
  /** The step to jump to: where it failed, or where it is now. */
  focus: StepItem | undefined
}

/** One row per step on a shared time axis; a loop's iterations fold into one (26a/26c). */
export function RunStepsCard({
  entries,
  spanMs,
  loaded,
  runStatus,
  selectedId,
  onSelect,
  focus,
}: RunStepsCardProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const all = flatSteps(entries)
  const failedCount = all.filter((i) => i.state === 'failed').length
  const long = all.length > LONG_LIST
  const shown = filter === 'failed' ? failedOnly(entries) : entries
  const grouped = entries.some((e) => e.kind === 'group')

  function handleToggleGroup(id: string) {
    setOpen((was) => {
      const next = new Set(was)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleJump() {
    if (!focus) return
    const group = entries.find((e) => e.kind === 'group' && e.items.some((i) => i.id === focus.id))
    if (group) setOpen((was) => new Set(was).add(group.id))
    if (filter === 'failed' && focus.state !== 'failed') setFilter('all')
    onSelect(focus.id)
    // After the row is drawn open; a jump is the person's own click.
    requestAnimationFrame(() => {
      document.getElementById(stepRowDomId(focus.id))?.scrollIntoView({ block: 'nearest' })
    })
  }

  const meta = long
    ? `${all.length} steps · ${failedCount} failed`
    : `${all.length} billable step${all.length === 1 ? '' : 's'}${runStatus === 'running' ? ' so far' : ''}`

  const actions = long ? (
    <>
      <SegmentedFilter<Filter>
        label="Filter steps"
        options={[
          { id: 'all', label: 'All' },
          { id: 'failed', label: 'Failed', count: failedCount, tone: 'danger' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {focus && (
        <button
          type="button"
          onClick={handleJump}
          className="text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {runStatus === 'errored' ? 'Jump to failure' : 'Jump to current'}
        </button>
      )}
    </>
  ) : null

  let footer: string | undefined
  if (long && filter === 'failed') {
    footer = `${failedCount} failed step${failedCount === 1 ? '' : 's'} · ${all.length - failedCount} hidden`
  } else if (long || grouped) {
    footer = `Showing ${entries.length} of ${all.length}${grouped ? ' · loop iterations are grouped' : ''}`
  }

  return (
    <RunCard title="Steps" meta={loaded ? meta : undefined} actions={actions} footer={footer}>
      {!loaded ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">Loading steps…</p>
      ) : all.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No steps yet. They appear as Cloudflare reports them.
        </p>
      ) : (
        <ul className={long ? 'max-h-[360px] overflow-y-auto' : undefined}>
          {shown.map((entry) =>
            entry.kind === 'group' ? (
              <GroupRow
                key={entry.id}
                group={entry}
                spanMs={spanMs}
                open={open.has(entry.id)}
                onToggle={handleToggleGroup}
                selectedId={selectedId}
                onSelect={onSelect}
              />
            ) : (
              <StepRow
                key={entry.id}
                item={entry}
                spanMs={spanMs}
                selected={entry.id === selectedId}
                onSelect={onSelect}
              />
            ),
          )}
        </ul>
      )}
    </RunCard>
  )
}
