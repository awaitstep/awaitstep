import type { ReactNode } from 'react'
import type { WorkspaceItem } from '../../../types/dashboard/items'
import { ListRow } from '../../ui/list-card'
import { ShareToggle } from '../../ui/share-toggle'
import { StatusPill } from '../../ui/status-pill'
import { Tile } from '../../ui/tile'
import { isFailing, statusLabel } from '../item-format'

function tileTone(item: WorkspaceItem) {
  if (isFailing(item)) return 'fail'
  return item.status === 'draft' ? 'neutral' : 'ok'
}

interface ItemRowProps {
  item: WorkspaceItem
  href: string
  /** The tile's icon: a workflow or a function mark. */
  icon: ReactNode
  /** The line under the name. */
  description: ReactNode
  /** The bars and their caption: the item's last ten runs and latest result. */
  activity: ReactNode
  /** Names the share switch: "Shared with Project 101: Lead enrichment". */
  projectName: string
  onShareChange: (shared: boolean) => void
}

/**
 * One workflow or function on a workspace list. Workflows and functions are the
 * same family, so their rows share this shape: mark, name, status, activity and
 * the share switch, in the same columns.
 */
export function ItemRow({
  item,
  href,
  icon,
  description,
  activity,
  projectName,
  onShareChange,
}: ItemRowProps) {
  const shareBlockedReason = item.shareToggle.allowed
    ? undefined
    : (item.shareToggle.reason ?? 'Sharing isn’t available yet')
  return (
    <ListRow
      leading={<Tile tone={tileTone(item)}>{icon}</Tile>}
      title={item.name}
      href={href}
      description={description}
      trailing={
        <>
          <span className="w-[118px]">
            <StatusPill status={item.status}>{statusLabel(item)}</StatusPill>
          </span>
          <span className="flex w-[150px] flex-col gap-1.5">{activity}</span>
          <span className="w-[120px]">
            <ShareToggle
              shared={item.sharing !== null}
              onChange={onShareChange}
              label={`Shared with ${projectName}: ${item.name}`}
              disabledReason={shareBlockedReason}
            />
          </span>
        </>
      }
    />
  )
}
