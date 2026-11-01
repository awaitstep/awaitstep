import { useState, useMemo } from 'react'
import { Download } from 'lucide-react'
import { useRunsExport, useWorkspaceRuns } from '../../data/dashboard/runs'
import { downloadTextFile } from '../../lib/download-file'
import { itemPath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { timeAgoOrDay } from '../../lib/time'
import { cn } from '../../lib/utils'
import type { RunPeriod, RunResult, WorkspaceRun } from '../../types/dashboard/runs'
import { Button } from '../ui/button'
import { DataTable, type DataColumn } from '../ui/data-table'
import { Pager } from '../ui/pager'
import { SearchField } from '../ui/search-field'
import { SegmentedFilter, type FilterOption } from '../ui/segmented-filter'
import { Select } from '../ui/select'
import { ShellLink } from '../ui/shell-link'
import { FilterSkeleton, ListCardSkeleton, LoadingRegion } from '../ui/skeletons'
import { PageBody, PageIntro } from '../shell/page-intro'
import { TopBarContent } from '../navigation/top-bar-slot'
import { useWorkspaceScope } from '../workspaces/use-workspace-scope'
import { WorkspaceLoadError } from '../workspaces/workspace-load-error'
import { RESULT_DOT_CLASS, resultLabel, runKindLabel, tookLabel, triggerLabel } from './run-format'
import { runsCsvName, runsToCsv } from './runs-csv'

type ResultFilter = 'all' | RunResult

const PERIODS: { value: RunPeriod; label: string; phrase: string }[] = [
  { value: '24h', label: 'Last 24 hours', phrase: 'in the last 24 hours' },
  { value: '7d', label: 'Last 7 days', phrase: 'in the last 7 days' },
  { value: '30d', label: 'Last 30 days', phrase: 'in the last 30 days' },
]

function runColumns(org: string): DataColumn<WorkspaceRun>[] {
  return [
    {
      id: 'result',
      header: 'Result',
      width: '120px',
      cell: (run) => (
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn('size-2 shrink-0 rounded-full', RESULT_DOT_CLASS[run.result])}
          />
          {resultLabel(run)}
        </span>
      ),
    },
    {
      id: 'workflow',
      header: 'Workflow',
      cell: (run) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold text-foreground">{run.workflowName}</span>
          <span className="truncate text-2xs text-muted-foreground">{runKindLabel(run)}</span>
        </span>
      ),
    },
    {
      id: 'run',
      header: 'Run',
      width: '120px',
      cell: (run) => (
        <ShellLink
          href={itemPath(org, { id: run.workflowId, kind: run.kind }, run.id)}
          className="font-mono text-2xs text-foreground hover:underline"
        >
          {run.id}
        </ShellLink>
      ),
    },
    {
      id: 'trigger',
      header: 'Trigger',
      width: '110px',
      cell: (run) => <span className="text-muted-foreground">{triggerLabel(run.trigger)}</span>,
    },
    {
      id: 'started',
      header: 'Started',
      width: '110px',
      cell: (run) => <span className="text-muted-foreground">{timeAgoOrDay(run.createdAt)}</span>,
    },
    {
      id: 'took',
      header: 'Took',
      width: '80px',
      cell: (run) => <span className="text-muted-foreground">{tookLabel(run.durationMs)}</span>,
    },
  ]
}

interface RunsPageProps {
  slugs: WorkspaceSlugs
}

/** `/{org}/{project}/{workspace}/runs`: the `WsRuns` board. */
export function RunsPage({ slugs }: RunsPageProps) {
  const scope = useWorkspaceScope(slugs)
  // Built once per org, so the table keeps the same columns between renders.
  const columns = useMemo(() => runColumns(slugs.org), [slugs.org])
  const [result, setResult] = useState<ResultFilter>('all')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState<RunPeriod>('24h')
  // Older pushes the next cursor; Newer pops back to the page before.
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [exporting, setExporting] = useState(false)
  const [exportFailed, setExportFailed] = useState(false)
  const filter = {
    result: result === 'all' ? undefined : result,
    period,
    search: search.trim() || undefined,
  }
  const runs = useWorkspaceRuns(slugs, { ...filter, cursor: cursors.at(-1) })
  const exportRuns = useRunsExport(slugs)

  if (!scope) return null
  const workspace = scope.workspace.workspace

  function restart() {
    setCursors([undefined])
  }

  function handleResult(next: ResultFilter) {
    setResult(next)
    restart()
  }

  function handleSearch(next: string) {
    setSearch(next)
    restart()
  }

  function handlePeriod(next: string) {
    setPeriod(next as RunPeriod)
    restart()
  }

  function handleOlder() {
    const next = runs.data?.nextCursor
    if (next) setCursors((stack) => [...stack, next])
  }

  function handleNewer() {
    setCursors((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack))
  }

  function handleRetry() {
    void runs.refetch()
  }

  async function handleExport() {
    setExporting(true)
    setExportFailed(false)
    try {
      const all = await exportRuns(filter)
      downloadTextFile(runsCsvName(workspace.slug), runsToCsv(all), 'text/csv')
    } catch {
      setExportFailed(true)
    } finally {
      setExporting(false)
    }
  }

  const counts = runs.data?.counts
  const options: FilterOption<ResultFilter>[] = [
    { id: 'all', label: 'All', count: counts?.all },
    { id: 'failed', label: 'Failed', count: counts?.failed, tone: 'danger' },
    { id: 'running', label: 'Running', count: counts?.running },
    { id: 'succeeded', label: 'Succeeded', count: counts?.succeeded },
  ]
  const phrase = PERIODS.find((p) => p.value === period)!.phrase
  const total = counts ? counts[result] : 0
  const emptyText = search.trim() ? `No runs match “${search.trim()}”.` : `No runs ${phrase}.`
  // While the next page loads, the previous one stays on screen as a
  // placeholder: paging from it would push the same cursor twice.
  const settled = runs.data !== undefined && !runs.isPlaceholderData
  const hasNewer = settled && cursors.length > 1
  const hasOlder = settled && runs.data?.nextCursor != null
  const exportDisabled = !runs.data || exporting

  let body
  if (runs.isError) {
    body = (
      <WorkspaceLoadError
        what="runs"
        error={runs.error}
        onRetry={handleRetry}
        retrying={runs.isFetching}
      />
    )
  } else if (!runs.data) {
    body = (
      <LoadingRegion label="Loading runs">
        <FilterSkeleton />
        <ListCardSkeleton rows={8} trailing={4} tile={false} />
      </LoadingRegion>
    )
  } else {
    body = (
      <>
        <div className="flex flex-wrap items-center gap-3">
          <SearchField
            label="Search by workflow or run ID"
            placeholder="Search by workflow or run ID"
            value={search}
            onChange={handleSearch}
          />
          <SegmentedFilter
            label="Result"
            options={options}
            value={result}
            onChange={handleResult}
          />
          <Select
            aria-label="Period"
            value={period}
            onValueChange={handlePeriod}
            options={PERIODS}
            className="w-[160px]"
          />
        </div>
        <DataTable
          caption={`Runs in ${workspace.name}`}
          columns={columns}
          rows={runs.data.data}
          getRowKey={(run) => run.id}
          empty={emptyText}
          minWidth="820px"
          footer={
            <Pager
              label="Runs pages"
              summary={`Showing ${runs.data.data.length} of ${total} runs ${phrase}`}
              hasNewer={hasNewer}
              hasOlder={hasOlder}
              onNewer={handleNewer}
              onOlder={handleOlder}
            />
          }
        />
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
          disabled={exportDisabled}
        >
          <Download aria-hidden="true" />
          Export
        </Button>
      </TopBarContent>
      <PageBody>
        <PageIntro
          title="Runs"
          description={`Every run of ${workspace.name}’s workflows and functions. Runs of shared workflows show in the workspace that owns them.`}
        />
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
