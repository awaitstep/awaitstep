import { ChevronRight } from 'lucide-react'
import type { WorkspaceItem } from '../../../types/dashboard/items'
import { Badge } from '../../ui/badge'
import { ShellLink } from '../../ui/shell-link'
import { isFailing, lastRunLabel, statusLabel, statusVariant } from '../item-format'

interface ItemLinkRowProps {
  item: WorkspaceItem
  href: string
}

/** A workflow on a phone (`MobileWorkflows`): the whole row opens it. */
export function ItemLinkRow({ item, href }: ItemLinkRowProps) {
  return (
    <li>
      <ShellLink href={href} className="flex items-center gap-3 px-4 py-3.5">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
          <span className="flex flex-wrap items-center gap-2 text-2xs">
            <Badge variant={statusVariant(item)}>{statusLabel(item)}</Badge>
            <span className={isFailing(item) ? 'text-status-error' : 'text-muted-foreground'}>
              {lastRunLabel(item)}
            </span>
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </ShellLink>
    </li>
  )
}
