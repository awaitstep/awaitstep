import { CircleAlert } from 'lucide-react'
import { workspacePath, type WorkspaceSlugs } from '../../lib/dashboard-paths'
import { cn } from '../../lib/utils'
import { timeAgoOrDay } from '../../lib/time'
import type { SharedItem, WorkspaceItem } from '../../types/dashboard/items'
import type { WorkspaceRun } from '../../types/dashboard/runs'
import type { Workspace, WorkspacePerson } from '../../types/dashboard/workspaces'
import { ITEM_KIND_LABEL } from '../items/item-kind'
import { Badge } from '../ui/badge'
import { DataTable, type DataColumn } from '../ui/data-table'
import { ShellLink } from '../ui/shell-link'
import { StatusPill } from '../ui/status-pill'
import { StatTile, Tile } from '../ui/tile'
import { ScopeChip } from '../ui/workspace-dot'
import { RESULT_DOT_CLASS, resultLabel, runHref, tookLabel, triggerLabel } from '../runs/run-format'
import {
  attentionDetail,
  attentionTitle,
  needsAttention,
  sharedOutLabel,
  sharedSummary,
} from './overview-summary'
import { OverviewCard } from './parts/overview-card'

const ROLE_LABEL = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' } as const

/** "Project admin" for a role the project gives, else the workspace role. */
function personRole({ role, inherited }: WorkspacePerson): string {
  return inherited && role === 'admin' ? 'Project admin' : ROLE_LABEL[role]
}

const RECENT_COLUMNS: DataColumn<WorkspaceRun>[] = [
  {
    id: 'workflow',
    header: 'Workflow',
    cell: (run) => (
      <span className="flex min-w-0 flex-col gap-0.5">
        <ShellLink
          href={runHref(run)}
          className="w-fit truncate text-sm font-semibold text-foreground hover:underline"
        >
          {run.workflowName}
        </ShellLink>
        <span className="text-2xs text-muted-foreground">{ITEM_KIND_LABEL[run.kind]}</span>
      </span>
    ),
  },
  {
    id: 'result',
    header: 'Result',
    width: '140px',
    cell: (run) => (
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn('size-2 shrink-0 rounded-full', RESULT_DOT_CLASS[run.result])}
        />
        {resultLabel(run, { httpStatus: true })}
      </span>
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

interface WorkspaceOverviewProps {
  slugs: WorkspaceSlugs
  workspace: Workspace
  items: WorkspaceItem[]
  recentRuns: WorkspaceRun[]
  failedRuns: WorkspaceRun[]
  people: WorkspacePerson[]
  sharedIn: SharedItem[]
}

/** The `WsOverview` board's content: tiles, Needs attention, Recent runs, People and Shared. */
export function WorkspaceOverview({
  slugs,
  workspace,
  items,
  recentRuns,
  failedRuns,
  people,
  sharedIn,
}: WorkspaceOverviewProps) {
  const runsHref = workspacePath(slugs, 'runs')
  const attention = needsAttention(items, failedRuns)
  const shared = sharedSummary(items, sharedIn)
  const workflows = items.filter((item) => item.kind === 'workflow').length
  const failingTone = attention.length > 0 ? 'danger' : undefined

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile value={workflows} label="Workflows" href={workspacePath(slugs, 'workflows')} />
        <StatTile
          value={items.length - workflows}
          label="Functions"
          href={workspacePath(slugs, 'functions')}
        />
        <StatTile
          value={workspace.counts.runs24h}
          label="Runs in the last 24 hours"
          href={runsHref}
        />
        <StatTile value={attention.length} label="Failing now" tone={failingTone} href={runsHref} />
      </div>

      {attention.length > 0 && (
        <OverviewCard title="Needs attention" caption={`${attention.length} failing`}>
          <ul className="flex flex-col divide-y divide-border">
            {attention.map((entry) => (
              <li key={entry.item.id}>
                <ShellLink
                  href={runsHref}
                  className="flex flex-wrap items-center gap-3.5 px-5 py-3.5 text-sm hover:bg-muted/30"
                >
                  <Tile tone="fail" size="sm">
                    <CircleAlert />
                  </Tile>
                  <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                    <span className="font-semibold text-foreground">{attentionTitle(entry)}</span>
                    <span className="text-2xs text-muted-foreground">{attentionDetail(entry)}</span>
                  </span>
                  <StatusPill status="failed" />
                  {entry.item.lastRun && (
                    <span className="text-2xs text-muted-foreground">
                      {timeAgoOrDay(entry.item.lastRun.at)}
                    </span>
                  )}
                </ShellLink>
              </li>
            ))}
          </ul>
        </OverviewCard>
      )}

      <OverviewCard
        title="Recent runs"
        action={
          <ShellLink href={runsHref} className="text-xs font-medium text-status-success">
            All runs →
          </ShellLink>
        }
      >
        <DataTable
          caption={`Recent runs in ${workspace.name}`}
          columns={RECENT_COLUMNS}
          rows={recentRuns}
          getRowKey={(run) => run.id}
          empty="No runs yet."
          minWidth="720px"
          framed={false}
        />
      </OverviewCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <OverviewCard
          title="People"
          caption={`${people.length} can open ${workspace.name}`}
          action={
            <ShellLink
              href={workspacePath(slugs, 'settings')}
              className="text-xs font-medium text-status-success"
            >
              Manage
            </ShellLink>
          }
        >
          <ul className="flex flex-wrap gap-2 px-5 py-4">
            {people.map((entry) => (
              <li key={entry.person.id}>
                <Badge variant="default" className="font-normal">
                  {entry.person.name} · {personRole(entry)}
                </Badge>
              </li>
            ))}
          </ul>
        </OverviewCard>
        <OverviewCard
          title="Shared"
          caption={`${shared.out.length} out · ${shared.in.length} in`}
          action={
            <ShellLink
              href={workspacePath(slugs, 'workflows')}
              className="text-xs font-medium text-status-success"
            >
              See all
            </ShellLink>
          }
        >
          <dl className="flex flex-col gap-2.5 px-5 py-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-[70px] text-muted-foreground">Shared out</dt>
              {shared.out.length === 0 ? (
                <dd className="text-muted-foreground">Nothing yet</dd>
              ) : (
                shared.out.map((item) => (
                  <dd key={item.id}>
                    <Badge variant="success">{sharedOutLabel(item)}</Badge>
                  </dd>
                ))
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <dt className="w-[70px] text-muted-foreground">Shared in</dt>
              {shared.in.length === 0 ? (
                <dd className="text-muted-foreground">Nothing yet</dd>
              ) : (
                shared.in.map((item) => (
                  <dd key={item.id}>
                    <ScopeChip colour={item.from.colour}>
                      {item.name} · {item.from.name}
                    </ScopeChip>
                  </dd>
                ))
              )}
            </div>
          </dl>
        </OverviewCard>
      </div>
    </>
  )
}
