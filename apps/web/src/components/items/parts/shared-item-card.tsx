import { ArrowRight, Code, Workflow } from 'lucide-react'
import type { SharedItem } from '../../../types/dashboard/items'
import { Badge } from '../../ui/badge'
import { ITEM_KIND_LABEL } from '../item-kind'
import { ShellLink } from '../../ui/shell-link'
import { Tile } from '../../ui/tile'
import { WorkspaceDot } from '../../ui/workspace-dot'

interface SharedItemCardProps {
  item: SharedItem
  href: string
}

/** An item another workspace shared, under "Shared with Sales": read-only, called from a step. */
export function SharedItemCard({ item, href }: SharedItemCardProps) {
  const isFunction = item.kind === 'script'
  const Icon = isFunction ? Code : Workflow
  const version = item.version === null ? '' : ` · v${item.version}`
  return (
    <ShellLink
      href={href}
      className="flex items-center gap-3.5 rounded-2xl border border-border bg-card p-4.5 transition-colors hover:border-foreground/20"
    >
      <Tile tone="info">
        <Icon />
      </Tile>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
        <span className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
          <Badge variant="default" className="font-normal">
            {ITEM_KIND_LABEL[item.kind]}
          </Badge>
          <span className="flex items-center gap-1.5">
            <WorkspaceDot colour={item.from.colour} />
            from {item.from.name}
            {version}
          </span>
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </ShellLink>
  )
}
