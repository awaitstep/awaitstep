import { useMemo } from 'react'
import { CircleAlert, Play, Share2 } from 'lucide-react'
import {
  itemPath,
  workspacePath,
  workspaceSettingsPath,
  type WorkspaceSlugs,
} from '../../lib/dashboard-paths'
import { cn } from '../../lib/utils'
import { timeAgoOrDay } from '../../lib/time'
import { plural } from '../../lib/plural'
import type { SharedItem, WorkspaceItem } from '../../types/dashboard/items'
import type { WorkspaceRun } from '../../types/dashboard/runs'
import type { Workspace, WorkspacePerson } from '../../types/dashboard/workspaces'
import { ITEM_KIND_LABEL } from '../items/item-kind'
import { Avatar } from '../ui/avatar'
import { Badge } from '../ui/badge'
import { DataTable, type DataColumn } from '../ui/data-table'
import { ShellLink } from '../ui/shell-link'
import { StatusPill } from '../ui/status-pill'
import { StatTile, Tile } from '../ui/tile'
import { ScopeChip } from '../ui/workspace-dot'
import { RESULT_DOT_CLASS, resultLabel, tookLabel, triggerLabel } from '../runs/run-format'
import {
  attentionDetail,
  attentionTitle,
  needsAttention,
  sharedOutLabel,
  sharedSummary,
} from './overview-summary'
import { OverviewCard } from './parts/overview-card'
import { OverviewEmpty } from './parts/overview-empty'
import { RunsTile } from './parts/runs-tile'

const ROLE_LABEL = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' } as const

/** "Project admin" for a role the project gives, else the workspace role. */
function personRole({ role, inherited }: WorkspacePerson): string {
  return inherited && role === 'admin' ? 'Project admin' : ROLE_LABEL[role]
}

function recentColumns(org: string): DataColumn<WorkspaceRun>[] {
  return [
    {
      id: 'workflow',
      header: 'Workflow',
      cell: (run) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <ShellLink
            href={itemPath(org, { id: run.workflowId, kind: run.kind }, run.id)}
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
      align: 'right',
      cell: (run) => <span className="text-muted-foreground">{tookLabel(run.durationMs)}</span>,
    },
  ]
}

interface WorkspaceOverviewProps {
  slugs: WorkspaceSlugs
  workspace: Workspace
  items: WorkspaceItem[]
  recentRuns: WorkspaceRun[]
  failedRuns: WorkspaceRun[]
  people: WorkspacePerson[]
  sharedIn: SharedItem[]
  projectName: string
  /** Built, but nothing has run yet (`WsOverview`, Built no runs): the runs tiles become a nudge to deploy. */
  quiet?: boolean
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
  projectName,
  quiet = false,
}: WorkspaceOverviewProps) {
  const runsHref = workspacePath(slugs, 'runs')
  // Built once per org, so the table keeps the same columns between renders.
  const columns = useMemo(() => recentColumns(slugs.org), [slugs.org])
  const attention = needsAttention(items, failedRuns)
  const shared = sharedSummary(items, sharedIn)
  const workflows = items.filter((item) => item.kind === 'workflow').length
  const failingTone = attention.length > 0 ? 'danger' : undefined
  const workflowsHref = workspacePath(slugs, 'workflows')
  const libraryHref = workspacePath(slugs, 'library')
  const nothingShared = shared.out.length === 0 && shared.in.length === 0

  return (
    <>
      <div
        className={cn(
          'grid grid-cols-2 gap-3',
          quiet ? 'md:grid-cols-[1fr_1fr_2.2fr]' : 'md:grid-cols-[1fr_1fr_2.2fr_1fr]',
        )}
      >
        <StatTile value={workflows} label="Workflows" href={workflowsHref} />
        <StatTile
          value={items.length - workflows}
          label="Functions"
          href={workspacePath(slugs, 'functions')}
        />
        {quiet ? (
          <div className="col-span-2 flex items-center gap-3.5 rounded-xl border border-dashed border-input bg-card px-4 py-3 md:col-span-1">
            <span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-muted text-muted-foreground">
              <Play className="size-4" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[13.5px] font-semibold text-foreground">
                Nothing has run yet
              </span>
              <span className="text-[12.5px] text-muted-foreground">
                Deploy a workflow and its runs appear here.
              </span>
            </span>
            <ShellLink
              href={workflowsHref}
              className="text-xs font-medium whitespace-nowrap text-status-success"
            >
              Deploy one →
            </ShellLink>
          </div>
        ) : (
          <>
            <RunsTile
              runs={workspace.counts.runs24h}
              hours={workspace.runsByHour}
              href={runsHref}
            />
            <StatTile
              value={attention.length}
              label="Failing now"
              tone={failingTone}
              href={runsHref}
            />
          </>
        )}
      </div>

      {attention.length > 0 && (
        <OverviewCard
          title="Needs attention"
          caption={`${attention.length} failing`}
          action={
            <ShellLink href={runsHref} className="text-xs font-medium text-status-success">
              See runs
            </ShellLink>
          }
        >
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
            All runs
          </ShellLink>
        }
      >
        {quiet ? (
          <OverviewEmpty
            icon={Play}
            title="No runs yet"
            body={
              'Runs appear here once a webhook, a schedule or Run triggers a workflow. Nothing is deployed yet.'
            }
            action={{ label: 'Deploy a workflow', href: workflowsHref }}
          />
        ) : (
          <DataTable
            caption="Recent runs"
            columns={columns}
            rows={recentRuns}
            getRowKey={(run) => run.id}
            empty="No runs yet."
            minWidth="720px"
            framed={false}
          />
        )}
      </OverviewCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <OverviewCard
          title="People"
          caption={plural(people.length, 'person', 'people')}
          action={
            <ShellLink
              href={workspaceSettingsPath(slugs, 'members')}
              className="text-xs font-medium text-status-success"
            >
              Manage
            </ShellLink>
          }
        >
          <ul className="flex flex-col divide-y divide-border">
            {people.map((entry) => (
              <li key={entry.person.id} className="flex items-center gap-3 px-5 py-2.5">
                <Avatar
                  name={entry.person.name}
                  email={entry.person.email}
                  src={entry.person.image}
                  className="size-7 text-2xs"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {entry.person.name || entry.person.email}
                </span>
                <Badge variant="default" className="font-normal">
                  {personRole(entry)}
                </Badge>
              </li>
            ))}
          </ul>
        </OverviewCard>
        <OverviewCard
          title="Shared"
          caption={nothingShared ? undefined : `${shared.out.length} out · ${shared.in.length} in`}
          action={
            <ShellLink href={libraryHref} className="text-xs font-medium text-status-success">
              {nothingShared ? 'Library' : 'See all'}
            </ShellLink>
          }
        >
          {nothingShared ? (
            <OverviewEmpty
              icon={Share2}
              title="Nothing shared yet"
              body={`Share a workflow so other workspaces in ${projectName} can call it.`}
              action={{ label: 'Open the library', href: libraryHref }}
            />
          ) : (
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
          )}
        </OverviewCard>
      </div>
    </>
  )
}
