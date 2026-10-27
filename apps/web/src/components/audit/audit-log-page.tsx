import { useState } from 'react'
import { Download, ShieldCheck } from 'lucide-react'
import { useAuditExport, useAuditLog } from '../../data/dashboard/audit'
import { useDebouncedValue } from '../../hooks/use-debounced-value'
import { downloadTextFile } from '../../lib/download-file'
import type { AuditLevel, AuditPeriod } from '../../types/dashboard/audit'
import { Banner } from '../ui/banner'
import { Button } from '../ui/button'
import { ListCard } from '../ui/list-card'
import { Pager } from '../ui/pager'
import { SearchField } from '../ui/search-field'
import { SegmentedFilter, type FilterOption } from '../ui/segmented-filter'
import { Select } from '../ui/select'
import { FilterSkeleton, ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { useOrgScope } from '../org-settings/use-org-scope'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { AuditRow } from './parts/audit-row'
import { AUDIT_LEVEL_LABEL, auditCsvName, auditToCsv } from './audit-csv'

type LevelFilter = 'all' | AuditLevel

const LEVEL_OPTIONS: FilterOption<LevelFilter>[] = [
  { id: 'all', label: 'All' },
  ...(['organization', 'project', 'workspace'] as const).map((level) => ({
    id: level,
    label: AUDIT_LEVEL_LABEL[level],
  })),
]

const PERIODS: { value: AuditPeriod; label: string; phrase: string }[] = [
  { value: '24h', label: 'Last 24 hours', phrase: 'in the last 24 hours' },
  { value: '7d', label: 'Last 7 days', phrase: 'in the last 7 days' },
  { value: '30d', label: 'Last 30 days', phrase: 'in the last 30 days' },
  { value: '90d', label: 'Last 90 days', phrase: 'in the last 90 days' },
]

interface AuditLogPageProps {
  org: string
}

// Typing waits this long before it filters, so each keystroke isn't a request.
const SEARCH_DELAY_MS = 250

/** `/{org}/audit` (`AuditLog`): who changed what, anywhere in the org. Owners and admins only. */
export function AuditLogPage({ org }: AuditLogPageProps) {
  // Filters and pages belong to one org: switching org starts afresh.
  return <AuditLog key={org} org={org} />
}

function AuditLog({ org }: AuditLogPageProps) {
  const scope = useOrgScope(org)
  const canSee = scope?.viewerCan.manageSettings.allowed ?? false
  const [level, setLevel] = useState<LevelFilter>('all')
  const [search, setSearch] = useState('')
  const settledSearch = useDebouncedValue(search.trim(), SEARCH_DELAY_MS)
  const [period, setPeriod] = useState<AuditPeriod>('7d')
  // Older pushes the next cursor; Newer pops back to the page before.
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)
  const filter = {
    level: level === 'all' ? undefined : level,
    period,
    search: settledSearch || undefined,
  }
  const events = useAuditLog(org, { ...filter, cursor: cursors.at(-1) }, canSee)
  const exportEvents = useAuditExport(org)

  if (!scope) return null
  const orgName = scope.org.name

  function restart() {
    setCursors([undefined])
  }

  function handleLevel(next: LevelFilter) {
    setLevel(next)
    restart()
  }

  function handleSearch(next: string) {
    setSearch(next)
    restart()
  }

  function handlePeriod(next: string) {
    setPeriod(next as AuditPeriod)
    restart()
  }

  function handleOlder() {
    const next = events.data?.nextCursor
    if (next) setCursors((stack) => [...stack, next])
  }

  function handleNewer() {
    setCursors((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack))
  }

  function handleRetry() {
    void events.refetch()
  }

  async function handleExport() {
    setExporting(true)
    setExportFailed(false)
    try {
      const all = await exportEvents(filter)
      downloadTextFile(auditCsvName(org), auditToCsv(all), 'text/csv')
    } catch {
      setExportFailed(true)
    } finally {
      setExporting(false)
    }
  }

  const intro = (
    <PageIntro
      title="Audit log"
      description={`Who changed what, anywhere in ${orgName}. Sign-ins, keys, access, deploys and deletions are kept for 90 days.`}
    />
  )

  if (!canSee) {
    return (
      <PageBody>
        {intro}
        <Banner tone="info" icon={ShieldCheck}>
          Only org owners and admins can see the audit log.
        </Banner>
      </PageBody>
    )
  }

  const phrase = PERIODS.find((p) => p.value === period)!.phrase
  const emptyText = settledSearch ? `No events match “${settledSearch}”.` : `No events ${phrase}.`
  // While the next page loads, the previous one stays on screen as a
  // placeholder: paging from it would push the same cursor twice.
  const settled = events.data !== undefined && !events.isPlaceholderData
  const hasNewer = settled && cursors.length > 1
  const hasOlder = settled && events.data?.nextCursor != null

  // The filters stay up when a filtered request fails, so it can be changed or cleared.
  const filters = (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="min-w-[260px] flex-1">
        <SearchField
          label="Search people, actions, targets"
          placeholder="Search people, actions, targets"
          value={search}
          onChange={handleSearch}
        />
      </div>
      <SegmentedFilter label="Level" options={LEVEL_OPTIONS} value={level} onChange={handleLevel} />
      <Select
        aria-label="Period"
        value={period}
        onValueChange={handlePeriod}
        options={PERIODS}
        className="w-[160px]"
      />
    </div>
  )

  let body
  if (events.isError) {
    body = (
      <>
        {filters}
        <WorkspaceLoadError
          what="the audit log"
          error={events.error}
          onRetry={handleRetry}
          retrying={events.isFetching}
        />
      </>
    )
  } else if (!events.data) {
    body = (
      <LoadingRegion label="Loading the audit log">
        <FilterSkeleton />
        <ListCardSkeleton rows={7} trailing={2} />
      </LoadingRegion>
    )
  } else {
    body = (
      <>
        {filters}
        <ListCard
          label={`Audit events in ${orgName}`}
          empty={emptyText}
          footer={
            <Pager
              label="Audit log pages"
              summary={`Showing ${events.data.data.length} of ${events.data.total} events ${phrase} · kept for 90 days`}
              hasNewer={hasNewer}
              hasOlder={hasOlder}
              onNewer={handleNewer}
              onOlder={handleOlder}
            />
          }
        >
          {events.data.data.map((event) => (
            <AuditRow key={event.id} event={event} />
          ))}
        </ListCard>
      </>
    )
  }

  return (
    <>
      <TopBarContent>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={!events.data || exporting}
        >
          <Download aria-hidden="true" />
          Export CSV
        </Button>
      </TopBarContent>
      <PageBody>
        {intro}
        {exportFailed && (
          <p role="alert" className="text-xs text-status-error">
            The export didn’t finish. Nothing was downloaded. Try again in a moment.
          </p>
        )}
        {body}
      </PageBody>
    </>
  )
}
