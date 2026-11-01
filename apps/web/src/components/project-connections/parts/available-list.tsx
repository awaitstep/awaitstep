import { Cloud } from 'lucide-react'
import { cn } from '../../../lib/utils'
import type { AvailableConnection } from '../../../types/dashboard/project-connections'
import { Badge } from '../../ui/badge'
import { Tile } from '../../ui/tile'
import { tokenStatus } from '../../org-settings/parts/connection-card'
import { restrictedText } from '../project-connections-copy'

interface AvailableListProps {
  accounts: AvailableConnection[]
  picked: string[]
  onToggle: (id: string) => void
  now?: Date
}

function metaOf(account: AvailableConnection, now: Date): string {
  if (account.state === 'restricted') return restrictedText(account)
  const suffix = account.accountSuffix ? ` · ••••${account.accountSuffix}` : ''
  return `${tokenStatus(account, now).text}${suffix}`
}

/** *In {org}* on Add connection (23b): pick accounts; added and restricted ones can't be. */
export function AvailableList({
  accounts,
  picked,
  onToggle,
  now = new Date(),
}: AvailableListProps) {
  return (
    <ul className="flex flex-col gap-2">
      {accounts.map((account) => {
        const open = account.state === 'available'
        const on = account.state === 'added' || picked.includes(account.id)
        return (
          <li key={account.id}>
            <label
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                open && on ? 'border-primary bg-primary/5' : 'border-input bg-background',
                open
                  ? 'cursor-pointer hover:border-foreground/25'
                  : 'cursor-not-allowed opacity-70',
              )}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={!open}
                onChange={() => onToggle(account.id)}
                className="size-4 shrink-0 accent-primary"
              />
              <Tile tone="warn" size="sm">
                <Cloud />
              </Tile>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span
                  className={cn(
                    'flex items-center gap-2 text-sm font-semibold',
                    open ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span className="truncate">{account.name}</span>
                  {account.state === 'added' && (
                    <Badge variant="neutral" className="uppercase tracking-wide">
                      Added
                    </Badge>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{metaOf(account, now)}</span>
              </span>
              {account.state === 'restricted' && (
                <span className="whitespace-nowrap text-xs text-status-warning">
                  Ask an org admin
                </span>
              )}
            </label>
          </li>
        )
      })}
    </ul>
  )
}
