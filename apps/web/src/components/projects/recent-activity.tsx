import { ArrowUpCircle, Share2, TriangleAlert, type LucideIcon } from 'lucide-react'
import { workspacePath } from '../../lib/dashboard-paths'
import { timeAgoOrDay } from '../../lib/time'
import type { ActivityItem, ActivityKind } from '../../types/dashboard/activity'
import { ListCard, ListRow } from '../ui/list-card'
import { SectionHeader } from '../ui/section-header'
import { StatusPill } from '../ui/status-pill'
import { Tile } from '../ui/tile'

const KIND_LOOK: Record<
  ActivityKind,
  { icon: LucideIcon; tone: 'fail' | 'ok' | 'info'; page: 'runs' | 'workflows' }
> = {
  failed: { icon: TriangleAlert, tone: 'fail', page: 'runs' },
  deployed: { icon: ArrowUpCircle, tone: 'ok', page: 'workflows' },
  shared: { icon: Share2, tone: 'info', page: 'workflows' },
}

/** "Lead enrichment deployed as v3", "… published as v3" for a function, "… failed", "… shared to Project 101". */
export function activityTitle(item: ActivityItem): string {
  const name = item.workflow.name
  if (item.kind === 'failed') return `${name} failed`
  if (item.kind === 'shared') return `${name} shared to ${item.project.name}`
  const verb = item.workflow.kind === 'script' ? 'published' : 'deployed'
  return item.version !== null ? `${name} ${verb} as v${item.version}` : `${name} ${verb}`
}

interface RecentActivityProps {
  org: string
  items: ActivityItem[]
}

/** The org home's "Recent activity": failures, deploys and shares across every project. */
export function RecentActivity({ org, items }: RecentActivityProps) {
  return (
    <section aria-label="Recent activity" className="flex flex-col gap-3">
      <SectionHeader title="Recent activity" caption="All projects" />
      <ListCard
        label="Recent activity"
        empty="Nothing yet. Deploys, failures and shares appear here."
      >
        {items.map((item) => {
          const look = KIND_LOOK[item.kind]
          const Icon = look.icon
          return (
            <ListRow
              key={item.id}
              leading={
                <Tile tone={look.tone} size="sm">
                  <Icon />
                </Tile>
              }
              title={activityTitle(item)}
              href={workspacePath(
                { org, project: item.project.slug, workspace: item.workspace.slug },
                look.page,
              )}
              description={`${item.project.name} · ${item.workspace.name}`}
              trailing={
                <>
                  <StatusPill status={item.kind} />
                  <time
                    dateTime={item.at}
                    className="w-24 text-right text-2xs text-muted-foreground"
                  >
                    {timeAgoOrDay(item.at)}
                  </time>
                </>
              }
            />
          )
        })}
      </ListCard>
    </section>
  )
}
