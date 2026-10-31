import { useId } from 'react'
import { orgPath } from '../../../lib/dashboard-paths'
import { timeAgoOrDay } from '../../../lib/time'
import { cn } from '../../../lib/utils'
import type { OrgListing } from '../../../types/dashboard/session'
import { ORG_ROLE_LABEL } from '../../access/parts/access-draft'
import { OrgMark } from '../../shell/org-mark'
import { Badge } from '../../ui/badge'
import { HealthLine } from '../../ui/health-line'
import { ShellLink } from '../../ui/shell-link'
import { Tile } from '../../ui/tile'
import { orgChips } from '../org-cards'

/** "Opened 2h ago", "Opened yesterday", "Opened 12 Oct". */
function openedWhen(at: string): string {
  const when = timeAgoOrDay(at)
  return when === 'Yesterday' ? 'yesterday' : when
}

interface OrgCardProps {
  org: OrgListing
  /** The org opened last: a "Last used" badge and a primary border. */
  lastUsed: boolean
  onOpen: (slug: string) => void
}

/** An organization on /dashboard: role, chips, health and when you last opened it. One link to its home. */
export function OrgCard({ org, lastUsed, onOpen }: OrgCardProps) {
  const nameId = useId()
  const detailId = useId()

  function handleClick() {
    onOpen(org.slug)
  }

  return (
    <ShellLink
      href={orgPath(org.slug)}
      onClick={handleClick}
      aria-labelledby={nameId}
      aria-describedby={detailId}
      className={cn(
        'flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        lastUsed ? 'border-primary' : 'border-border hover:border-foreground/20',
      )}
    >
      <span className="flex items-center gap-3.5">
        <Tile tone="ok" size="lg" className="overflow-hidden">
          <OrgMark initial={org.initial} logo={org.logo} />
        </Tile>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span id={nameId} className="truncate text-base font-semibold text-foreground">
            {org.name}
          </span>
          <span className="text-xs text-muted-foreground">{ORG_ROLE_LABEL[org.role]}</span>
        </span>
        {lastUsed && <Badge variant="success">Last used</Badge>}
      </span>
      <span id={detailId} className="flex flex-1 flex-col gap-4">
        <span className="flex flex-wrap gap-1.5">
          {orgChips(org).map((chip) => (
            <Badge key={chip} variant="neutral" className="px-2.5 py-1 font-normal">
              {chip}
            </Badge>
          ))}
        </span>
        <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3.5">
          <HealthLine failing={org.health.failing} lastRunAt={org.health.lastRunAt} />
          {org.lastOpenedAt && (
            <span className="ml-auto text-2xs text-muted-foreground">
              Opened {openedWhen(org.lastOpenedAt)}
            </span>
          )}
        </span>
      </span>
    </ShellLink>
  )
}
