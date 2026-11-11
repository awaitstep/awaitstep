import { Cable, Check } from 'lucide-react'
import type { DeployConnections } from '@awaitstep/ir'
import { cn } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { tokenStatus } from '../org-settings/parts/connection-card'

type Account = DeployConnections['connections'][number]

interface DeployAccountCardProps {
  accounts: Account[]
  selectedId: string
  defaultId: string | null
  /** The project's Connections page, when known. */
  connectionsHref: string | null
  /** While a deploy runs the account can't change. */
  disabled: boolean
  onPick: (id: string) => void
}

/** "Cloudflare" for the provider's id; another provider reads as its id. */
export function providerName(provider: string): string {
  return provider === 'cloudflare' ? 'Cloudflare' : provider
}

function accountTag(account: Account, defaultId: string | null): string | null {
  if (account.id === defaultId) return 'Default'
  if (account.scope === 'project') return 'This project'
  return null
}

function suffix(account: Account): string {
  return account.accountSuffix ? `••••${account.accountSuffix}` : 'No account ID'
}

/** Where this deploy goes (25a), and Change to the project's other accounts (25c). */
export function DeployAccountCard({
  accounts,
  selectedId,
  defaultId,
  connectionsHref,
  disabled,
  onPick,
}: DeployAccountCardProps) {
  const selected = accounts.find((a) => a.id === selectedId)
  const tag = selected ? accountTag(selected, defaultId) : null
  const now = new Date()

  return (
    <section
      aria-label="Account"
      className="flex flex-wrap items-center gap-3.5 rounded-2xl border border-border bg-card px-5 py-4"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-status-warning/15 text-status-warning">
        <Cable aria-hidden="true" className="size-[18px]" />
      </span>
      <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          {selected?.name ?? 'Pick an account'}
          {tag && <Badge variant="success">{tag}</Badge>}
        </span>
        {selected && (
          <span className="text-xs text-muted-foreground">
            {providerName(selected.provider)} account {suffix(selected)}
          </span>
        )}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button type="button" variant="outline" size="sm">
            Change
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          {accounts.map((account) => (
            <AccountItem
              key={account.id}
              account={account}
              tag={accountTag(account, defaultId)}
              chosen={account.id === selectedId}
              now={now}
              onPick={onPick}
            />
          ))}
          {connectionsHref && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={connectionsHref} className="text-status-success">
                  Manage project connections →
                </a>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </section>
  )
}

function AccountItem({
  account,
  tag,
  chosen,
  now,
  onPick,
}: {
  account: Account
  tag: string | null
  chosen: boolean
  now: Date
  onPick: (id: string) => void
}) {
  const token = tokenStatus(account, now)

  function handleSelect() {
    onPick(account.id)
  }

  return (
    <DropdownMenuItem
      onSelect={handleSelect}
      className={cn('items-start', chosen && 'bg-muted/60')}
    >
      <Check
        aria-hidden="true"
        className={cn('mt-0.5 size-3.5 shrink-0', chosen ? 'text-status-success' : 'invisible')}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          {account.name}
          {tag && <Badge variant="neutral">{tag}</Badge>}
          {chosen && <span className="sr-only">(chosen)</span>}
        </span>
        <span className="text-2xs text-muted-foreground">
          {token.text} · {suffix(account)}
        </span>
      </span>
    </DropdownMenuItem>
  )
}
