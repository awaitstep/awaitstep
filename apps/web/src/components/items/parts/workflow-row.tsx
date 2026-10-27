import { Workflow } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { WorkspaceItem } from '../../../types/dashboard/items'
import { ListRow } from '../../ui/list-card'
import { RunHistoryBars } from '../../ui/run-history-bars'
import { ShareToggle } from '../../ui/share-toggle'
import { StatusPill } from '../../ui/status-pill'
import { Tile } from '../../ui/tile'
import { isFailing, lastRunLabel, runOutcomes, statusLabel } from '../item-format'

interface WorkflowRowProps {
  item: WorkspaceItem
  href: string
  /** Names the share switch: "Share Lead enrichment with Project 101". */
  projectName: string
  onShareChange: (shared: boolean) => void
}

function tileTone(item: WorkspaceItem) {
  if (isFailing(item)) return 'fail'
  return item.status === 'draft' ? 'neutral' : 'ok'
}

/** One workflow on a workspace's Workflows list, as the `Workflows` board draws it. */
export function WorkflowRow({ item, href, projectName, onShareChange }: WorkflowRowProps) {
  const failing = isFailing(item)
  const shareBlockedReason = item.shareToggle.allowed ? undefined : item.shareToggle.reason
  return (
    <ListRow
      leading={
        <Tile tone={tileTone(item)}>
          <Workflow />
        </Tile>
      }
      title={item.name}
      href={href}
      description={item.description}
      trailing={
        <>
          <span className="w-[118px]">
            <StatusPill status={item.status}>{statusLabel(item)}</StatusPill>
          </span>
          <span className="flex w-[150px] flex-col gap-1.5">
            <RunHistoryBars runs={runOutcomes(item)} />
            <span
              className={cn('text-2xs', failing ? 'text-status-error' : 'text-muted-foreground')}
            >
              {lastRunLabel(item)}
            </span>
          </span>
          <span className="w-[120px]">
            <ShareToggle
              shared={item.sharing !== null}
              onChange={onShareChange}
              label={`Share ${item.name} with ${projectName}`}
              disabledReason={shareBlockedReason}
            />
          </span>
        </>
      }
    />
  )
}
